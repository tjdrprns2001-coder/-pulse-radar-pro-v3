import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
import scanner as s


def raw_frame(n=160, interval="5m"):
    step = s.TF_MS[interval]
    return pd.DataFrame({
        "open_time": np.arange(n) * step,
        "close_time": (np.arange(n) + 1) * step - 1,
        "open": np.full(n, 100.0), "high": np.full(n, 101.0),
        "low": np.full(n, 98.0), "close": np.full(n, 100.0),
        "volume": np.full(n, 100.0), "quote_volume": np.full(n, 10000.0),
        "taker_buy_quote": np.full(n, 6000.0),
    })


def feature_frame(n=160, interval="5m"):
    df = s.indicators(raw_frame(n, interval), s.Config())
    df["ema14"], df["ema28"], df["ema57"], df["ema92"] = 99., 98.5, 98., 97.
    df["compression"] = .02
    df["hist_pct"] = .2
    df["rvol"], df["taker"], df["vwap"] = 1., 1.2, 99.
    return df


class ScannerTests(unittest.TestCase):
    def setUp(self):
        self.cfg = s.Config()

    def test_indicator_definitions_and_no_current_volume_in_baseline(self):
        df = raw_frame()
        df["close"] = np.linspace(80., 120., len(df))
        df.loc[len(df) - 1, "volume"] = 300.
        got = s.indicators(df, self.cfg)
        cols = [f"ema{x}" for x in s.EMA_PERIODS]
        expected = (got[cols].max(axis=1) - got[cols].min(axis=1)) / got.close
        np.testing.assert_allclose(got.compression, expected)
        np.testing.assert_allclose(got.hist_pct, got["hist"] / got.close * 100)
        self.assertAlmostEqual(got.rvol.iloc[-1], 3.)

    def test_flow_paths(self):
        for path, expected in [
            ([1.2, 1.3, 1.2, 1.4], "FLOW-SUSTAIN"),
            ([.7, .8, 1., 1.8], "FLOW-IGNITION"),
            ([4.5, .8, 1.5, .3], "FLOW-SPIKE-FAIL"),
            ([.8, .9, .7, 4.5], "FLOW-SPIKE"),
            ([1., np.nan, 1.2, 1.4], "UNKNOWN"),
        ]:
            with self.subTest(path=path):
                self.assertEqual(s.flow_label(path, self.cfg), expected)

    def test_negative_histogram_can_improve(self):
        self.assertTrue(s.macd_improving(pd.DataFrame({"hist_pct": [-.8, -.5, -.2]})))
        self.assertFalse(s.macd_improving(pd.DataFrame({"hist_pct": [-.2, -.5, -.8]})))

    def test_negative_5m_macd_does_not_veto_entry(self):
        df = feature_frame()
        df["hist_pct"] = -.2
        df.loc[len(df) - 1, ["close", "high", "rvol", "taker"]] = [102., 103., 1.8, 1.4]
        self.assertTrue(s.gate_5m(df, self.cfg)["passed"])
        df.loc[len(df) - 1, "taker"] = .5
        self.assertFalse(s.gate_5m(df, self.cfg)["passed"])

    def test_low_current_volume_preserves_4h_setup(self):
        df = feature_frame(interval="4h")
        df["rvol"] = .4
        df.loc[len(df) - 8, "rvol"] = 4.
        result = s.setup_4h(df, self.cfg)
        self.assertTrue(result["valid"])
        self.assertTrue(result["historical_rvol"])

    def test_echo_preload_and_combined_context(self):
        h4 = feature_frame(interval="4h")
        h1 = feature_frame(interval="1h")
        h1["low"], h1["ema14"] = 99., 98.
        m15 = feature_frame(interval="15m")
        h1.loc[len(h1) - 25, ["volume", "rvol"]] = [400., 4.]
        self.assertEqual(s.volume_context(h4, h1, m15, self.cfg)["state"], "VOLUME-ECHO")
        h1.loc[len(h1) - 2, ["volume", "rvol"]] = [300., 3.]
        self.assertEqual(s.volume_context(h4, h1, m15, self.cfg)["state"],
                         "ECHO+RECENT-PRELOAD")
        h1.loc[len(h1) - 25, ["volume", "rvol"]] = [100., 1.]
        result = s.volume_context(h4, h1, m15, self.cfg)
        self.assertEqual(result["state"], "RECENT-PRELOAD")
        self.assertFalse(result["detected"])
        self.assertEqual(s.classify_stage(s.unknown_oi("missing"), False,
                                         True, True, True, False), "PRE")

    def test_price_breakdown_invalidates_echo(self):
        df = feature_frame(interval="1h")
        df["low"], df["ema14"] = 99., 98.
        df.loc[len(df) - 25, ["volume", "rvol"]] = [400., 4.]
        self.assertTrue(s.volume_echo(df, self.cfg)["detected"])
        df.loc[len(df) - 1, ["close", "low"]] = [90., 89.]
        self.assertFalse(s.volume_echo(df, self.cfg)["detected"])

    def test_missing_oi_and_extended_do_not_ignite(self):
        unknown = s.unknown_oi("missing")
        self.assertEqual(s.classify_stage(unknown, True, True, True, True, False), "B")
        known = {"known": True, "a": True, "a_pre": True, "change_15m_pct": .5}
        self.assertEqual(s.classify_stage(known, True, True, True, True, False), "점화초기")
        self.assertEqual(s.classify_stage(known, True, True, True, True, True), "A+B")
        known["change_15m_pct"] = -.1
        self.assertEqual(s.classify_stage(known, True, True, True, True, False), "A+B")

    def test_short_5m_history_uses_1h_for_24h_change(self):
        asof = 100 * s.TF_MS["1h"]
        h1 = raw_frame(100, "1h")
        m5 = raw_frame(100)
        m5["open_time"] += asof - 100 * s.TF_MS["5m"]
        m5["close_time"] += asof - 100 * s.TF_MS["5m"]
        m5.loc[len(m5) - 1, "close"] = 110.
        got = s.change_24h(m5, h1, asof)
        self.assertEqual(got["reference_interval"], "1h")
        self.assertAlmostEqual(got["pct"], 10.)
        self.assertLess(got["reference_close_time"], asof - 24 * s.TF_MS["1h"])

    def test_future_candles_are_removed(self):
        class Fake(s.Binance):
            async def get(self, path, **params):
                step = s.TF_MS["5m"]
                return [[i*step,100,101,98,100,100,(i+1)*step-1,
                         10000,10,60,6000,0] for i in range(122)]
        fake = object.__new__(Fake)
        result = asyncio.run(fake.candles("TESTUSDT", "5m",
                                          120 * s.TF_MS["5m"], self.cfg))
        self.assertEqual(len(result), 120)
        self.assertLess(result.close_time.iloc[-1], 120 * s.TF_MS["5m"])

    def test_oi_failure_is_unknown(self):
        class Fake:
            async def get(self, *args, **kwargs):
                raise RuntimeError("unavailable")
        result = asyncio.run(s.oi_features(Fake(), "TESTUSDT", 0, self.cfg))
        self.assertFalse(result["known"])
        self.assertFalse(result["a"])

    def test_oi_uses_contract_quantity_not_dollar_value(self):
        step, end = s.TF_MS["5m"], 48 * s.TF_MS["5m"]
        class Fake:
            async def get(self, *args, **kwargs):
                return [{"timestamp": (i+1)*step,
                         "sumOpenInterest": str(100 + i),
                         "sumOpenInterestValue": "99999999"} for i in range(48)]
        result = asyncio.run(s.oi_features(Fake(), "TESTUSDT", end, self.cfg))
        self.assertTrue(result["known"])
        self.assertTrue(result["a"])
        self.assertGreater(result["change_15m_pct"], 0)


if __name__ == "__main__":
    unittest.main()

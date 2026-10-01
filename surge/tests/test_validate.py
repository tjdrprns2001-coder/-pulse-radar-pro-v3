import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import validate as v


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.db = v.connect(":memory:")
        self.t0 = 1800000000
        self.market = {
            "SIG": {"price": 100., "volume": 1000000., "change": 1.},
            "C1": {"price": 100., "volume": 1000000., "change": 1.},
            "C2": {"price": 100., "volume": 1100000., "change": 1.},
            "C3": {"price": 100., "volume": 1200000., "change": 1.},
            "ERROR": {"price": 100., "volume": 1000000., "change": 1.},
        }
        self.result = {
            "asof_utc": datetime.fromtimestamp(self.t0, timezone.utc).isoformat(),
            "rejected_4h_symbols": ["C1", "C2", "C3"],
            "errors": [{"symbol": "ERROR", "error": "missing data"}],
            "candidates": [{"symbol": "SIG", "stage": "A+B", "type": "A+B",
                            "score": 80, "volume_echo":
                            {"detected": True, "state": "VOLUME-ECHO"}}],
        }

    def tearDown(self):
        self.db.close()

    def seed(self):
        v.save_snapshot(self.db, self.result, self.t0, self.market)

    def test_1h_4h_24h_excess_returns(self):
        self.seed()
        with self.db:
            for hours, signal_pct, control_pct in [(1,10,3),(4,20,6),(24,30,9)]:
                self.db.execute("INSERT INTO prices VALUES (?, ?, ?)",
                                ("SIG", self.t0 + hours*3600, 100 + signal_pct))
                for symbol in ("C1", "C2", "C3"):
                    self.db.execute("INSERT INTO prices VALUES (?, ?, ?)",
                                    (symbol, self.t0 + hours*3600, 100 + control_pct))
        rows = {r["hours"]: r for r in v.summarize(self.db)
                if r["group"] == "stage:A+B"}
        for hours, excess in [(1,7),(4,14),(24,21)]:
            self.assertEqual(rows[hours]["matched"], 1)
            self.assertAlmostEqual(rows[hours]["mean_excess_return_pp"], excess)

    def test_pending_future_data_is_not_zero_return(self):
        self.seed()
        for row in v.summarize(self.db):
            self.assertEqual(row["observed"], 0)
            self.assertIsNone(row["mean_return_pct"])

    def test_no_early_or_stale_future_price(self):
        self.seed()
        with self.db:
            self.db.execute("INSERT INTO prices VALUES (?, ?, ?)",
                            ("SIG", self.t0 + 3599, 500))
            self.db.execute("INSERT INTO prices VALUES (?, ?, ?)",
                            ("SIG", self.t0 + 3600 + 1801, 500))
        self.assertIsNone(v.future_return(self.db, "SIG", self.t0, 100, 1, 1800))

    def test_signal_cooldown_and_error_symbols_excluded_from_controls(self):
        self.seed()
        controls = json.loads(self.db.execute("SELECT controls FROM events").fetchone()[0])
        self.assertEqual({r["symbol"] for r in controls}, {"C1", "C2", "C3"})
        v.save_snapshot(self.db, self.result, self.t0 + 600, self.market)
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 1)

    def test_scan_price_is_not_used_as_entry(self):
        self.result["candidates"][0]["price"] = 10  # Old signal-candle price.
        self.seed()
        self.assertEqual(self.db.execute("SELECT price0 FROM events").fetchone()[0], 100)

    def test_stale_signal_saved_without_event(self):
        saved = v.save_snapshot(self.db, self.result, self.t0 + 901, self.market)
        self.assertFalse(saved["fresh"])
        self.assertEqual(self.db.execute("SELECT count(*) FROM scans").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 0)

    def test_missing_control_coverage_does_not_create_excess(self):
        self.seed()
        with self.db:
            self.db.execute("INSERT INTO prices VALUES (?, ?, ?)",
                            ("SIG", self.t0 + 3600, 110))
            for symbol in ("C1", "C2"):
                self.db.execute("INSERT INTO prices VALUES (?, ?, ?)",
                                (symbol, self.t0 + 3600, 103))
        row = next(r for r in v.summarize(self.db)
                   if r["group"] == "stage:A+B" and r["hours"] == 1)
        self.assertEqual(row["observed"], 1)
        self.assertEqual(row["matched"], 0)
        self.assertIsNone(row["mean_excess_return_pp"])


if __name__ == "__main__":
    unittest.main()

"""Closed-candle Binance USDT perpetual surge scanner; no order execution."""
from __future__ import annotations

import argparse
import asyncio
import json
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import numpy as np
import pandas as pd

BASE_URL = "https://fapi.binance.com"
EMA_PERIODS = (14, 28, 57, 92)
TF_MS = {"1d": 86400000, "4h": 14400000, "1h": 3600000,
         "15m": 900000, "5m": 300000}
VERSION = "integrated-surge-v1"


@dataclass(frozen=True)
class Config:
    bars: int = 400
    min_bars: int = 100
    min_bars_daily: int = 30
    min_bars_5m: int = 100
    workers: int = 6
    rvol_window: int = 20
    compression_max: float = 0.10
    compression_strong: float = 0.05
    historical_rvol: float = 2.0
    oi_a_pct: float = 1.0
    oi_pre_pct: float = 0.20
    oi_cleanup_pct: float = -2.0
    oi_rebuild_pct: float = 0.30
    flow_sustain: float = 1.15
    flow_ignition: float = 1.50
    flow_spike: float = 2.50
    ignition_rvol: float = 1.50
    entry_rvol: float = 1.20
    breakout_bars: int = 12
    hold_tolerance: float = 0.005
    pullback_min: float = 0.02
    pullback_max: float = 0.15
    prior_rally_min: float = 0.05
    echo_max_current_rvol: float = 1.20
    echo_price_floor: float = 0.97
    extended_24h_pct: float = 20.0
    extended_daily_ema_pct: float = 18.0
    extended_4h_ema_pct: float = 10.0
    min_quote_volume: float = 0.0


class BinanceError(RuntimeError):
    pass


class RateGate:
    def __init__(self, interval):
        self.interval = interval
        self.lock = asyncio.Lock()
        self.next_start = 0.0

    async def acquire(self):
        async with self.lock:
            delay = self.next_start - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self.next_start = time.monotonic() + self.interval


class Binance:
    def __init__(self, session):
        self.session = session
        self.http_gate = RateGate(0.30)
        self.oi_gate = RateGate(0.45)
        self.blocked = False

    async def get(self, path, **params):
        for attempt in range(4):
            if self.blocked:
                raise BinanceError("API unavailable or blocked; requests stopped")
            if path.startswith("/futures/data/"):
                await self.oi_gate.acquire()
            await self.http_gate.acquire()
            if self.blocked:
                raise BinanceError("API unavailable or blocked; requests stopped")
            try:
                async with self.session.get(BASE_URL + path, params=params) as r:
                    if r.status == 418:
                        self.blocked = True
                        raise BinanceError("HTTP 418: IP banned")
                    if r.status == 429:
                        if attempt == 3:
                            raise BinanceError("HTTP 429: retry limit reached")
                        try:
                            delay = max(float(r.headers.get("Retry-After", 60)), 1)
                        except ValueError:
                            delay = 60
                        await asyncio.sleep(delay)
                        continue
                    if r.status >= 500 and attempt < 3:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    if r.status != 200:
                        raise BinanceError(f"HTTP {r.status}: {(await r.text())[:200]}")
                    result = await r.json()
                    if isinstance(result, dict) and result.get("code", 0) < 0:
                        raise BinanceError(str(result))
                    return result
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                if attempt == 3:
                    if isinstance(exc, aiohttp.ClientConnectorError):
                        self.blocked = True
                    raise
                await asyncio.sleep(2 ** attempt)
        raise BinanceError("Request failed")

    async def candles(self, symbol, interval, asof, cfg):
        raw = await self.get("/fapi/v1/klines", symbol=symbol,
                             interval=interval, endTime=asof - 1, limit=cfg.bars)
        cols = ["open_time", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades", "taker_buy_base",
                "taker_buy_quote", "ignore"]
        df = pd.DataFrame(raw, columns=cols)
        if df.empty:
            raise ValueError(f"{symbol} {interval}: no candles")
        for col in cols:
            df[col] = pd.to_numeric(df[col], errors="raise")
        df = (df.loc[df.close_time < asof].sort_values("open_time")
              .drop_duplicates("open_time").reset_index(drop=True))
        minimum = (cfg.min_bars_daily if interval == "1d" else
                   cfg.min_bars_5m if interval == "5m" else cfg.min_bars)
        if len(df) < minimum:
            raise ValueError(f"{symbol} {interval}: insufficient history ({len(df)})")
        if not (df.open_time.diff().dropna() == TF_MS[interval]).all():
            raise ValueError(f"{symbol} {interval}: missing candles")
        if asof - int(df.close_time.iloc[-1]) > TF_MS[interval]:
            raise ValueError(f"{symbol} {interval}: stale candles")
        if not np.isfinite(df[cols].to_numpy()).all() or (df.close <= 0).any():
            raise ValueError(f"{symbol} {interval}: invalid values")
        return indicators(df, cfg)


def indicators(df, cfg):
    df = df.copy()
    for period in EMA_PERIODS:
        df[f"ema{period}"] = df.close.ewm(span=period, adjust=False).mean()
    macd = (df.close.ewm(span=12, adjust=False).mean()
            - df.close.ewm(span=26, adjust=False).mean())
    df["hist"] = macd - macd.ewm(span=9, adjust=False).mean()
    df["hist_pct"] = df["hist"] / df.close.replace(0, np.nan) * 100
    baseline = df.volume.shift(1).rolling(cfg.rvol_window).mean().replace(0, np.nan)
    df["rvol"] = df.volume / baseline
    sell = (df.quote_volume - df.taker_buy_quote).clip(lower=0)
    floor = (df.quote_volume.abs() * 1e-9).clip(lower=1e-12)
    df["taker"] = df.taker_buy_quote / sell.where(sell > 0, floor)
    df.loc[df.quote_volume <= 0, "taker"] = np.nan
    cols = [f"ema{x}" for x in EMA_PERIODS]
    df["compression"] = (df[cols].max(axis=1) - df[cols].min(axis=1)) / df.close
    day = pd.to_datetime(df.open_time, unit="ms", utc=True).dt.floor("D")
    df["vwap"] = (df.quote_volume.groupby(day).cumsum()
                  / df.volume.groupby(day).cumsum().replace(0, np.nan))
    return df


def above_all(df):
    r = df.iloc[-1]
    return bool(all(r.close > r[f"ema{x}"] for x in EMA_PERIODS))


def aligned(row):
    return bool(row.ema14 > row.ema28 > row.ema57 > row.ema92)


def macd_improving(df):
    h = df.hist_pct.iloc[-3:]
    return bool(len(h) == 3 and np.isfinite(h).all()
                and h.iloc[-1] > h.iloc[-2] and h.iloc[-1] > h.iloc[0])


def hold_or_hl(df, cfg):
    return bool(df.low.iloc[-3:].min() >=
                df.low.iloc[-6:-3].min() * (1 - cfg.hold_tolerance))


def break_or_reclaim(df, cfg):
    r, prev = df.iloc[-1], df.iloc[-2]
    level = float(df.high.iloc[-cfg.breakout_bars - 1:-1].max())
    breakout = bool(prev.close <= level < r.close)
    reclaim = bool(r.low <= level < r.close)
    return {"confirmed": breakout or reclaim, "breakout": breakout,
            "reclaim": reclaim, "level": level}


def flow_label(values, cfg):
    x = np.asarray(list(values), dtype=float)[-4:]
    if len(x) < 4 or not np.isfinite(x).all():
        return "UNKNOWN"
    if x[:-1].max() >= cfg.flow_spike and x[-1] < 1.0:
        return "FLOW-SPIKE-FAIL"
    if np.all(x[-3:] >= cfg.flow_sustain):
        return "FLOW-SUSTAIN"
    if x[-1] >= cfg.flow_ignition and x[0] <= 1 and np.all(np.diff(x) >= 0):
        return "FLOW-IGNITION"
    return "FLOW-SPIKE" if x[-1] >= cfg.flow_ignition else "FLOW-WAIT"


def good_flow(label):
    return label in {"FLOW-SUSTAIN", "FLOW-IGNITION"}


def setup_4h(df, cfg):
    r = df.iloc[-1]
    above14 = bool(r.close > r.ema14)
    width = float(r.compression)
    # Positional indexing keeps the rise -> peak -> pullback sequence causal.
    peak_pos = len(df) - 12 + int(np.argmax(df.high.iloc[-12:-2].to_numpy()))
    peak = float(df.high.iloc[peak_pos])
    base = float(df.low.iloc[-24:peak_pos + 1].min())
    trough = float(df.low.iloc[peak_pos + 1:].min())
    rally, depth = peak / base - 1, 1 - trough / peak
    recent = df.iloc[-3:]
    recovery = bool((recent.close <= recent.ema14).any() and above14)
    pullback = bool(rally >= cfg.prior_rally_min
                    and cfg.pullback_min <= depth <= cfg.pullback_max
                    and recovery and hold_or_hl(df, cfg))
    improving = macd_improving(df)
    max_rvol = float(df.rvol.iloc[-18:].max())
    return {
        "valid": bool(above14 and (improving or r.hist_pct > 0)
                      and (width <= cfg.compression_max or pullback)),
        "above_ema14": above14, "compression_pct": width * 100,
        "strong_compression": width <= cfg.compression_strong,
        "pullback_recovery": pullback, "macd_improving": improving,
        "hist_pct": float(r.hist_pct),
        "historical_rvol": max_rvol >= cfg.historical_rvol,
        "max_rvol_72h": max_rvol,
    }


def volume_echo(df, cfg):
    current = df.iloc[-1]
    age = (current.open_time - df.open_time) / TF_MS["1h"]
    past = df.loc[age.between(3, 72) & (df.rvol >= cfg.historical_rvol)]
    for idx in reversed(past.index.tolist()):
        anchor = df.loc[idx]
        since = df.loc[idx + 1:]
        floor = anchor.low * cfg.echo_price_floor
        maintained = (df.low.iloc[-3:].min() >= floor
                      and current.close >= anchor.close * cfg.echo_price_floor
                      and since.close.min() >= floor)
        reduced = (current.rvol <= cfg.echo_max_current_rvol
                   and current.volume < anchor.volume * 0.70)
        alive = current.close > current.ema14 and hold_or_hl(df, cfg)
        if maintained and reduced and alive:
            return {"detected": True, "anchor_time": int(anchor.open_time),
                    "anchor_rvol": float(anchor.rvol),
                    "current_rvol": float(current.rvol)}
    return {"detected": False, "anchor_time": None}


def volume_context(h4, h1, m15, cfg):
    echo = volume_echo(h1, cfg)
    alive = bool(setup_4h(h4, cfg)["valid"]
                 and h1.close.iloc[-1] > h1.ema14.iloc[-1]
                 and hold_or_hl(h1, cfg))
    h1_max = float(h1.rvol.iloc[-3:].max())
    m15_max = float(m15.rvol.iloc[-4:].max())
    preload = bool(alive and max(h1_max, m15_max) >= cfg.historical_rvol)
    detected = bool(alive and echo["detected"])
    state = ("ECHO+RECENT-PRELOAD" if detected and preload else
             "VOLUME-ECHO" if detected else "RECENT-PRELOAD" if preload else "QUIET")
    return {**echo, "detected": detected, "state": state,
            "recent_preload": preload, "structure_alive": alive,
            "recent_1h_max_rvol": h1_max, "recent_15m_max_rvol": m15_max}


def ready_1h(df, cfg):
    r = df.iloc[-1]
    above = bool(r.close > r.ema14)
    hold, improving = hold_or_hl(df, cfg), macd_improving(df)
    return {"ready": above and hold and improving, "above_ema14": above,
            "above_all_emas": above_all(df), "hold_or_hl": hold,
            "macd_improving": improving, "hist_pct": float(r.hist_pct),
            "break": break_or_reclaim(df, cfg),
            "flow": flow_label(df.taker.iloc[-4:], cfg)}


def gate_15m(df, cfg):
    r, prev = df.iloc[-1], df.iloc[-2]
    flow, brk = flow_label(df.taker.iloc[-4:], cfg), break_or_reclaim(df, cfg)
    transition = bool(r.ema14 > r.ema28 and r.ema14 > prev.ema14
                      and r.ema14 - r.ema28 > prev.ema14 - prev.ema28)
    rvol_up = bool(r.rvol >= cfg.ignition_rvol and r.rvol > prev.rvol)
    passed = bool(r.close > r.ema14 and (aligned(r) or transition)
                  and brk["confirmed"] and rvol_up and good_flow(flow))
    return {"passed": passed, "above_all_emas": above_all(df),
            "aligned": aligned(r), "alignment_transition": transition,
            "compression_pct": float(r.compression * 100),
            "break": brk, "rvol": float(r.rvol), "rvol_increasing": rvol_up,
            "flow": flow, "taker_sequence": df.taker.iloc[-4:].tolist()}


def gate_5m(df, cfg):
    r, prev = df.iloc[-1], df.iloc[-2]
    brk, hold = break_or_reclaim(df, cfg), hold_or_hl(df, cfg)
    ema_reclaim = bool(prev.close <= prev.ema14 and r.close > r.ema14)
    vwap_reclaim = bool(prev.close <= prev.vwap and r.close > r.vwap)
    vwap = bool(r.close > r.vwap or ema_reclaim)
    rvol_up = bool(r.rvol >= cfg.entry_rvol and r.rvol > prev.rvol)
    taker = bool(r.taker >= cfg.flow_sustain
                 and (r.taker > prev.taker
                      or good_flow(flow_label(df.taker.iloc[-4:], cfg))))
    mss = brk["confirmed"] and hold  # Range-break proxy, not pivot CHoCH.
    passed = bool(above_all(df) and hold and vwap and mss and rvol_up and taker)
    return {"passed": passed, "above_all_emas": above_all(df), "hold_or_hl": hold,
            "vwap_confirmed": vwap, "vwap_reclaim": vwap_reclaim,
            "ema_reclaim": ema_reclaim, "mss_proxy": mss, "break": brk,
            "rvol": float(r.rvol), "taker_reentry": taker,
            "macd_hist_pct_info_only": float(r.hist_pct)}


def pct_change(current, previous):
    if previous <= 0:
        raise ValueError("Nonpositive reference")
    return (current / previous - 1) * 100


def change_24h(m5, h1, asof):
    target = asof - 24 * TF_MS["1h"]
    for interval, frame in (("5m", m5), ("1h", h1)):
        ref = frame.loc[frame.close_time < target]
        if not ref.empty:
            r = ref.iloc[-1]
            return {"pct": pct_change(float(m5.close.iloc[-1]), float(r.close)),
                    "reference_interval": interval,
                    "reference_close_time": int(r.close_time),
                    "reference_gap_ms": target - int(r.close_time)}
    return {"pct": None, "reference_interval": None,
            "reference_close_time": None, "reference_gap_ms": None}


def unknown_oi(error):
    return {"known": False, "a": False, "a_pre": False,
            "c_rebuild": False, "error": str(error)}


async def oi_features(api, symbol, asof, cfg):
    try:
        raw = await api.get("/futures/data/openInterestHist", symbol=symbol,
                            period="5m", limit=48, endTime=asof)
        df = pd.DataFrame(raw)
        if df.empty:
            raise ValueError("No OI data")
        df["timestamp"] = pd.to_numeric(df.timestamp)
        df["oi"] = pd.to_numeric(df.sumOpenInterest)
        df = (df.loc[df.timestamp <= asof].sort_values("timestamp")
              .drop_duplicates("timestamp"))
        if df.empty or not np.isfinite(df.oi).all() or (df.oi <= 0).any():
            raise ValueError("Invalid OI")
        stamp = int(df.timestamp.iloc[-1])
        if asof - stamp > 2 * TF_MS["5m"]:
            raise ValueError("Stale OI")

        def at(target):
            subset = df.loc[df.timestamp <= target]
            if subset.empty or target - int(subset.timestamp.iloc[-1]) > TF_MS["5m"]:
                raise ValueError("Missing OI reference")
            return float(subset.oi.iloc[-1])

        now = at(stamp)
        p15, p30 = at(stamp - 900000), at(stamp - 1800000)
        p60, p180 = at(stamp - 3600000), at(stamp - 10800000)
        d15, d60 = pct_change(now, p15), pct_change(now, p60)
        cleanup, building = pct_change(p60, p180), now > p15 > p30
        return {"known": True, "timestamp": stamp,
                "change_15m_pct": d15, "change_1h_pct": d60,
                "cleanup_pct": cleanup, "building": building,
                "a": d60 >= cfg.oi_a_pct,
                "a_pre": d60 >= cfg.oi_pre_pct and d15 > 0 and building,
                "c_rebuild": cleanup <= cfg.oi_cleanup_pct
                and d60 >= cfg.oi_rebuild_pct and d15 > 0,
                "error": None}
    except Exception as exc:
        return unknown_oi(exc)


def classify_stage(oi, flow, ready, gate15, gate5, extended):
    if oi["known"] and oi["a"] and flow:
        if (ready and gate15 and gate5 and not extended
                and oi.get("change_15m_pct", 0) > 0):
            return "점화초기"
        return "A+B"
    if oi["known"] and oi["a"]:
        return "A"
    if flow:
        return "B"
    if oi["known"] and oi["a_pre"]:
        return "A-pre"
    return "PRE"


async def analyze(api, symbol, asof, cfg):
    h4 = await api.candles(symbol, "4h", asof, cfg)
    setup = setup_4h(h4, cfg)
    if not setup["valid"]:
        return None
    daily, h1 = await asyncio.gather(
        api.candles(symbol, "1d", asof, cfg),
        api.candles(symbol, "1h", asof, cfg))
    m15, m5, oi = await asyncio.gather(
        api.candles(symbol, "15m", asof, cfg),
        api.candles(symbol, "5m", asof, cfg),
        oi_features(api, symbol, asof, cfg))
    ready = ready_1h(h1, cfg)
    echo = volume_context(h4, h1, m15, cfg)
    g15, g5 = gate_15m(m15, cfg), gate_5m(m5, cfg)
    flow = good_flow(ready["flow"]) or good_flow(g15["flow"])
    price, d = float(m5.close.iloc[-1]), daily.iloc[-1]
    day_dist = pct_change(price, float(d.ema14))
    h4_dist = pct_change(price, float(h4.ema14.iloc[-1]))
    change = change_24h(m5, h1, asof)
    reasons = []
    if change["pct"] is not None and change["pct"] >= cfg.extended_24h_pct:
        reasons.append("24H 상승폭 과대")
    if day_dist >= cfg.extended_daily_ema_pct:
        reasons.append("1D EMA14 이격 과대")
    if h4_dist >= cfg.extended_4h_ema_pct:
        reasons.append("4H EMA14 이격 과대")
    extended = bool(reasons)
    d_above = bool(d.close > d.ema14)
    d_recovery = bool(d.close >= d.ema14 * .99 and d.close > daily.close.iloc[-2])
    c_type = bool(oi["known"] and oi["c_rebuild"]
                  and ready["above_ema14"] and ready["hold_or_hl"])
    kind = ("C" if c_type else "A+B" if oi["a"] and flow else
            "A" if oi["a"] or oi["a_pre"] else "B" if flow else "PRE")
    stage = classify_stage(oi, flow, ready["ready"], g15["passed"], g5["passed"], extended)
    score = (20 + 10 * setup["strong_compression"] + 8 * setup["pullback_recovery"]
             + 8 * setup["historical_rvol"] + 8 * (d_above or d_recovery)
             + 5 * macd_improving(daily) + 10 * ready["ready"]
             + 5 * ready["above_all_emas"] + 10 * echo["detected"]
             + 10 * oi["a"] + 8 * c_type + 10 * flow
             + 12 * g15["passed"] + 10 * g5["passed"]
             - 8 * (not (d_above or d_recovery)) - 8 * (day_dist > 12)
             - 10 * (g15["flow"] == "FLOW-SPIKE-FAIL") - 20 * extended)
    warnings = []
    if not oi["known"]:
        warnings.append("OI 미확인")
    if not ready["ready"]:
        warnings.append("1H 준비 미완료")
    if g15["flow"] == "FLOW-SPIKE-FAIL":
        warnings.append("15m FLOW 스파이크 실패")
    history = {tf: {"bars": len(frame), "ema92_has_92_bars": len(frame) >= 92,
                    "ema92_seed_decay": float((1 - 2 / 93) ** (len(frame) - 1))}
               for tf, frame in (("1d", daily), ("4h", h4), ("1h", h1),
                                 ("15m", m15), ("5m", m5))}
    if any(not item["ema92_has_92_bars"] for item in history.values()):
        warnings.append("EMA92 이력 부족: 참고치")
    if change["pct"] is None:
        warnings.append("24H 변화율 미확인")
    return {"symbol": symbol, "price": price, "type": kind, "stage": stage,
            "score": int(score), "change_24h_pct": change["pct"],
            "change_24h_reference": change, "extended": extended,
            "extended_reasons": reasons, "volume_echo": echo,
            "echo_reignition": bool(echo["detected"] and ready["ready"]
                                   and g15["passed"] and g5["passed"] and not extended),
            "environment_1d": {"above_ema14": d_above, "recovery_attempt": d_recovery,
                               "macd_improving": macd_improving(daily),
                               "hist_pct": float(d.hist_pct),
                               "compression_pct": float(d.compression * 100),
                               "ema14_distance_pct": day_dist},
            "setup_4h": setup, "ready_1h": ready, "oi": oi,
            "gate_15m": g15, "gate_5m": g5, "history": history, "warnings": warnings}


async def scan(args, cfg):
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout,
                                    connector=aiohttp.TCPConnector(limit=20)) as session:
        api = Binance(session)
        clock, exchange = await asyncio.gather(
            api.get("/fapi/v1/time"), api.get("/fapi/v1/exchangeInfo"))
        asof = ((int(clock["serverTime"]) - 5000) // TF_MS["5m"]) * TF_MS["5m"]
        universe = {r["symbol"] for r in exchange["symbols"]
                    if r["status"] == "TRADING" and r["contractType"] == "PERPETUAL"
                    and r["quoteAsset"] == "USDT"}
        if args.symbols:
            requested = {s.upper() for s in args.symbols}
            if requested - universe:
                raise ValueError(f"Not active USDT perpetual: {sorted(requested - universe)}")
            universe &= requested
        if cfg.min_quote_volume > 0:
            tickers = await api.get("/fapi/v1/ticker/24hr")
            universe &= {r["symbol"] for r in tickers
                         if float(r["quoteVolume"]) >= cfg.min_quote_volume}
        if not universe:
            raise ValueError("Empty universe")
        queue = asyncio.Queue()
        for symbol in sorted(universe):
            queue.put_nowait(symbol)
        rows, errors, rejected = [], [], []

        async def worker():
            while True:
                try:
                    symbol = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                try:
                    row = await analyze(api, symbol, asof, cfg)
                    (rejected if row is None else rows).append(symbol if row is None else row)
                except Exception as exc:
                    errors.append({"symbol": symbol, "error": str(exc)})
                finally:
                    queue.task_done()

        await asyncio.gather(*(worker() for _ in range(cfg.workers)))
    if len(errors) == len(universe):
        raise BinanceError(f"All symbols failed; first error: {errors[0]['error']}")
    rank = {"점화초기": 5, "A+B": 4, "A": 3, "B": 2, "A-pre": 1, "PRE": 0}
    rows.sort(key=lambda r: (rank[r["stage"]], r["score"]), reverse=True)
    return json_safe({
        "version": VERSION, "asof_utc": datetime.fromtimestamp(asof / 1000, timezone.utc).isoformat(),
        "universe_count": len(universe), "universe_symbols": sorted(universe),
        "rejected_4h_count": len(rejected), "rejected_4h_symbols": sorted(rejected),
        "config": asdict(cfg), "candidates": [r for r in rows if not r["extended"]],
        "extended": [r for r in rows if r["extended"]], "errors": errors})


def json_safe(value):
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="+")
    parser.add_argument("--output", default="scan.json")
    parser.add_argument("--min-quote-volume", type=float, default=0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        import unittest
        suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent / "tests"))
        raise SystemExit(0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1)
    if args.min_quote_volume < 0:
        parser.error("--min-quote-volume must be nonnegative")
    result = asyncio.run(scan(args, Config(min_quote_volume=args.min_quote_volume)))
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2,
                                           allow_nan=False), encoding="utf-8")
    print(f"Candidates={len(result['candidates'])} extended={len(result['extended'])} "
          f"errors={len(result['errors'])}; output={args.output}")


if __name__ == "__main__":
    main()

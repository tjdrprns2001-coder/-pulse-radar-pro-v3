"""Forward-only signal observations with matched controls and SQLite persistence."""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import sqlite3
import statistics
import time
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import aiohttp

from scanner import Binance, Config, json_safe, scan

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    ts INTEGER PRIMARY KEY,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT NOT NULL,
    ts INTEGER NOT NULL,
    price REAL NOT NULL CHECK(price > 0),
    PRIMARY KEY (symbol, ts)
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    stage TEXT NOT NULL,
    type TEXT NOT NULL,
    echo INTEGER NOT NULL,
    volume_state TEXT NOT NULL,
    t0 INTEGER NOT NULL,
    price0 REAL NOT NULL CHECK(price0 > 0),
    score REAL NOT NULL,
    controls TEXT NOT NULL,
    scan_ts INTEGER NOT NULL,
    FOREIGN KEY (scan_ts) REFERENCES scans(ts)
);
CREATE INDEX IF NOT EXISTS events_symbol_stage_time
ON events(symbol, stage, t0);
"""


def connect(path):
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(SCHEMA)
    return db


def finite_positive(value):
    try:
        value = float(value)
        return math.isfinite(value) and value > 0
    except (TypeError, ValueError):
        return False


async def market_snapshot():
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        api = Binance(session)
        tickers, exchange = await asyncio.gather(
            api.get("/fapi/v1/ticker/24hr"), api.get("/fapi/v1/exchangeInfo"))
        clock = await api.get("/fapi/v1/time")
    active = {r["symbol"] for r in exchange["symbols"]
              if r["status"] == "TRADING" and r["contractType"] == "PERPETUAL"
              and r["quoteAsset"] == "USDT"}
    market = {}
    for r in tickers:
        if r["symbol"] not in active or not finite_positive(r.get("lastPrice")):
            continue
        volume, change = float(r["quoteVolume"]), float(r["priceChangePercent"])
        if math.isfinite(volume) and math.isfinite(change):
            market[r["symbol"]] = {
                "price": float(r["lastPrice"]), "volume": max(volume, 0),
                "change": change}
    if not market:
        raise ValueError("Empty market snapshot")
    return int(clock["serverTime"]) // 1000, market


def match_controls(symbol, market, eligible, count=3):
    """Use only successfully screened 4H noncandidates, never data errors."""
    origin = market[symbol]
    ranked = []
    for other in eligible:
        if other == symbol or other not in market:
            continue
        row = market[other]
        distance = (
            abs(math.log1p(row["volume"]) - math.log1p(origin["volume"]))
            + abs(row["change"] - origin["change"]) / 5)
        ranked.append((distance, other, row["price"]))
    ranked.sort()
    return [{"symbol": s, "price0": p, "match_distance": d}
            for d, s, p in ranked[:count]]


def save_snapshot(db, result, ts, market, cooldown_hours=24):
    signal_ts = int(datetime.fromisoformat(result["asof_utc"]).timestamp())
    lag = ts - signal_ts
    fresh = 0 <= lag <= 900
    # The eligible set is fixed before future performance is observed.
    eligible = set(result["rejected_4h_symbols"])
    added = 0
    payload = {**result, "observation_ts": ts, "observation_lag_seconds": lag}
    with db:
        db.execute("INSERT INTO scans(ts, payload) VALUES (?, ?)",
                   (ts, json.dumps(json_safe(payload), ensure_ascii=False, allow_nan=False)))
        db.executemany("INSERT INTO prices(symbol, ts, price) VALUES (?, ?, ?)",
                       [(s, ts, r["price"]) for s, r in market.items()])
        if fresh:
            for row in result["candidates"]:
                symbol, stage = row["symbol"], row["stage"]
                if symbol not in market:
                    continue
                existing = db.execute(
                    "SELECT 1 FROM events WHERE symbol=? AND stage=? AND t0>=? LIMIT 1",
                    (symbol, stage, ts - int(cooldown_hours * 3600))).fetchone()
                if existing:
                    continue
                controls = match_controls(symbol, market, eligible)
                db.execute(
                    """INSERT INTO events(
                    symbol, stage, type, echo, volume_state, t0,
                    price0, score, controls, scan_ts
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (symbol, stage, row["type"], int(row["volume_echo"]["detected"]),
                     row["volume_echo"]["state"], ts, market[symbol]["price"],
                     row["score"], json.dumps(controls, ensure_ascii=False), ts))
                added += 1
    return {"prices": len(market), "new_events": added, "signal_lag_seconds": lag,
            "fresh": fresh, "scan_errors": len(result["errors"])}


async def collect_once(db, cooldown_hours=24):
    result = await scan(SimpleNamespace(symbols=None), Config())
    ts, market = await market_snapshot()
    saved = save_snapshot(db, result, ts, market, cooldown_hours)
    print(json.dumps(saved, ensure_ascii=False), flush=True)
    return saved


def future_return(db, symbol, t0, price0, hours, tolerance):
    target = t0 + hours * 3600
    row = db.execute(
        """SELECT price, ts FROM prices
        WHERE symbol=? AND ts>=? AND ts<=? ORDER BY ts LIMIT 1""",
        (symbol, target, target + tolerance)).fetchone()
    if row is None:
        return None
    return (row[0] / price0 - 1) * 100


def summarize(db, tolerance=1800):
    events = db.execute(
        """SELECT symbol, stage, type, echo, volume_state, t0, price0, controls
        FROM events ORDER BY t0""").fetchall()
    groups = {}
    for symbol, stage, kind, echo, volume_state, t0, price0, encoded in events:
        controls = json.loads(encoded)
        for hours in (1, 4, 24):
            ret = future_return(db, symbol, t0, price0, hours, tolerance)
            control_returns = [
                future_return(db, c["symbol"], t0, c["price0"], hours, tolerance)
                for c in controls]
            # Exactly three fixed controls must all have future observations.
            matched = len(controls) == 3 and all(
                value is not None for value in control_returns)
            control_mean = statistics.mean(control_returns) if matched else None
            labels = [f"stage:{stage}", f"type:{kind}",
                      f"echo:{'yes' if echo else 'no'}", f"volume:{volume_state}"]
            for label in labels:
                group = groups.setdefault((label, hours),
                    {"events": 0, "returns": [], "controls": [], "excess": []})
                group["events"] += 1
                if ret is not None:
                    group["returns"].append(ret)
                    if control_mean is not None:
                        group["controls"].append(control_mean)
                        group["excess"].append(ret - control_mean)
    report = []
    for (label, hours), g in sorted(groups.items()):
        returns, excess = g["returns"], g["excess"]
        report.append({
            "group": label, "hours": hours, "events": g["events"],
            "observed": len(returns), "matched": len(excess),
            "mean_return_pct": statistics.mean(returns) if returns else None,
            "median_return_pct": statistics.median(returns) if returns else None,
            "positive_return_rate_pct":
                100 * sum(x > 0 for x in returns) / len(returns) if returns else None,
            "matched_control_mean_pct":
                statistics.mean(g["controls"]) if g["controls"] else None,
            "mean_excess_return_pp": statistics.mean(excess) if excess else None,
        })
    return report


async def collection_loop(db, args):
    while True:
        started = time.monotonic()
        try:
            await collect_once(db, args.cooldown_hours)
        except Exception as exc:
            print(f"Collection failed: {exc}", flush=True)
            if args.once:
                raise
        if args.once:
            return
        elapsed = time.monotonic() - started
        periods = max(1, math.ceil(elapsed / args.interval))
        await asyncio.sleep(max(0, periods * args.interval - elapsed))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["collect", "report"])
    p.add_argument("--db", default="signals.sqlite")
    p.add_argument("--interval", type=int, default=900)
    p.add_argument("--cooldown-hours", type=float, default=24)
    p.add_argument("--tolerance-minutes", type=int, default=30)
    p.add_argument("--output", default="validation.json")
    p.add_argument("--once", action="store_true")
    args = p.parse_args()
    if args.interval < 300 or args.cooldown_hours <= 0 or args.tolerance_minutes < 0:
        p.error("interval >=300, cooldown >0, tolerance >=0 required")
    db = connect(args.db)
    try:
        if args.mode == "collect":
            asyncio.run(collection_loop(db, args))
        else:
            report = summarize(db, args.tolerance_minutes * 60)
            Path(args.output).write_text(
                json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False),
                encoding="utf-8")
            for row in report:
                if row["observed"]:
                    print(json.dumps(row, ensure_ascii=False))
            print(f"Report: {args.output}")
    finally:
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        db.close()


if __name__ == "__main__":
    main()

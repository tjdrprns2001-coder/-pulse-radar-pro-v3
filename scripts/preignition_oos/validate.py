from __future__ import annotations

import argparse
import asyncio
import json
import math
import sqlite3
import statistics
import time
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
    price REAL NOT NULL,
    PRIMARY KEY (symbol, ts)
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    stage TEXT NOT NULL,
    type TEXT NOT NULL,
    echo INTEGER NOT NULL,
    t0 INTEGER NOT NULL,
    price0 REAL NOT NULL,
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
    db.execute("PRAGMA busy_timeout=5000")
    db.executescript(SCHEMA)
    return db


def finite_positive(value):
    try:
        number = float(value)
        return math.isfinite(number) and number > 0
    except (TypeError, ValueError):
        return False


async def market_snapshot():
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        api = Binance(session)
        tickers, exchange = await asyncio.gather(
            api.get("/fapi/v1/ticker/24hr"),
            api.get("/fapi/v1/exchangeInfo"),
        )
        clock = await api.get("/fapi/v1/time")

    active = {
        row["symbol"]
        for row in exchange["symbols"]
        if row["status"] == "TRADING"
        and row["contractType"] == "PERPETUAL"
        and row["quoteAsset"] == "USDT"
    }

    market = {}
    for row in tickers:
        symbol = row["symbol"]
        if symbol not in active:
            continue
        if not finite_positive(row.get("lastPrice")):
            continue

        volume = float(row["quoteVolume"])
        change = float(row["priceChangePercent"])
        if not math.isfinite(volume) or not math.isfinite(change):
            continue

        market[symbol] = {
            "price": float(row["lastPrice"]),
            "volume": max(volume, 0.0),
            "change": change,
        }

    # 수집 완료 시각을 기준으로 후속 성과를 측정한다.
    return int(clock["serverTime"]) // 1000, market


def match_controls(symbol, market, excluded, count=3):
    """신호 발생 시점의 거래대금·24H 상승률이 가까운 대조군."""
    origin = market[symbol]
    ranked = []

    for other, row in market.items():
        if other == symbol or other in excluded:
            continue

        distance = (
            abs(
                math.log1p(row["volume"])
                - math.log1p(origin["volume"])
            )
            + abs(row["change"] - origin["change"]) / 5.0
        )
        ranked.append((distance, other, row["price"]))

    ranked.sort()
    return [
        {
            "symbol": other,
            "price0": price,
            "match_distance": distance,
        }
        for distance, other, price in ranked[:count]
    ]


async def collect_once(db, cooldown_hours):
    result = await scan(
        SimpleNamespace(symbols=None),
        Config(),
    )
    ts, market = await market_snapshot()

    asof = result["asof_utc"]
    from datetime import datetime

    signal_ts = int(datetime.fromisoformat(asof).timestamp())
    lag_seconds = ts - signal_ts

    all_rows = result["candidates"] + result["extended"]
    excluded = {row["symbol"] for row in all_rows}

    # 기록은 저장하되, 너무 오래된 스캔은 신규 이벤트로 채택하지 않는다.
    fresh = 0 <= lag_seconds <= 900
    added = 0

    with db:
        db.execute(
            "INSERT INTO scans(ts, payload) VALUES (?, ?)",
            (
                ts,
                json.dumps(
                    json_safe(result),
                    ensure_ascii=False,
                    allow_nan=False,
                ),
            ),
        )
        db.executemany(
            "INSERT INTO prices(symbol, ts, price) VALUES (?, ?, ?)",
            [
                (symbol, ts, row["price"])
                for symbol, row in market.items()
            ],
        )

        if fresh:
            for row in result["candidates"]:
                symbol, stage = row["symbol"], row["stage"]
                if symbol not in market:
                    continue

                # 같은 종목·단계의 반복 신호를 지정된 시간 동안 묶는다.
                existing = db.execute(
                    """
                    SELECT 1 FROM events
                    WHERE symbol = ? AND stage = ? AND t0 >= ?
                    LIMIT 1
                    """,
                    (
                        symbol,
                        stage,
                        ts - int(cooldown_hours * 3600),
                    ),
                ).fetchone()
                if existing:
                    continue

                controls = match_controls(
                    symbol, market, excluded
                )
                db.execute(
                    """
                    INSERT INTO events(
                        symbol, stage, type, echo, t0,
                        price0, score, controls, scan_ts
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        symbol,
                        stage,
                        row["type"],
                        int(row["volume_echo"]["detected"]),
                        ts,
                        market[symbol]["price"],
                        row["score"],
                        json.dumps(controls, ensure_ascii=False),
                        ts,
                    ),
                )
                added += 1

    print(
        f"저장: 가격 {len(market)}개, 신규 신호 {added}개, "
        f"신호 지연 {lag_seconds}초, "
        f"스캐너 오류 {len(result['errors'])}개",
        flush=True,
    )


def future_return(db, symbol, t0, price0, hours, tolerance):
    target = t0 + hours * 3600
    row = db.execute(
        """
        SELECT price, ts FROM prices
        WHERE symbol = ? AND ts >= ? AND ts <= ?
        ORDER BY ts
        LIMIT 1
        """,
        (symbol, target, target + tolerance),
    ).fetchone()

    if row is None:
        return None
    return (row[0] / price0 - 1) * 100


def summarize(db, tolerance):
    events = db.execute(
        """
        SELECT symbol, stage, type, echo, t0, price0, controls
        FROM events
        ORDER BY t0
        """
    ).fetchall()

    groups = {}

    for symbol, stage, kind, echo, t0, price0, encoded in events:
        controls = json.loads(encoded)

        for hours in (1, 4, 24):
            ret = future_return(
                db, symbol, t0, price0, hours, tolerance
            )

            control_returns = [
                future_return(
                    db,
                    item["symbol"],
                    t0,
                    item["price0"],
                    hours,
                    tolerance,
                )
                for item in controls
            ]

            # 지정된 대조군 전체가 관측된 경우에만 짝 비교.
            matched = bool(controls) and all(
                value is not None for value in control_returns
            )
            control_mean = (
                statistics.mean(control_returns)
                if matched else None
            )

            labels = [
                f"stage:{stage}",
                f"type:{kind}",
                f"echo:{'yes' if echo else 'no'}",
            ]
            for label in labels:
                group = groups.setdefault(
                    (label, hours),
                    {
                        "events": 0,
                        "returns": [],
                        "controls": [],
                        "excess": [],
                    },
                )
                group["events"] += 1
                if ret is not None:
                    group["returns"].append(ret)
                    if control_mean is not None:
                        group["controls"].append(control_mean)
                        group["excess"].append(ret - control_mean)

    report = []
    for (label, hours), group in sorted(groups.items()):
        returns = group["returns"]
        excess = group["excess"]
        report.append({
            "group": label,
            "hours": hours,
            "events": group["events"],
            "observed": len(returns),
            "matched": len(excess),
            "mean_return_pct": (
                statistics.mean(returns) if returns else None
            ),
            "median_return_pct": (
                statistics.median(returns) if returns else None
            ),
            "positive_return_rate_pct": (
                100 * sum(x > 0 for x in returns) / len(returns)
                if returns else None
            ),
            "matched_control_mean_pct": (
                statistics.mean(group["controls"])
                if group["controls"] else None
            ),
            "mean_excess_return_pp": (
                statistics.mean(excess) if excess else None
            ),
        })

    return report


async def collection_loop(db, args):
    while True:
        started = time.monotonic()
        try:
            await collect_once(db, args.cooldown_hours)
        except Exception as exc:
            print(f"수집 실패: {exc}", flush=True)
            if args.once:
                raise

        if args.once:
            return

        # 실행 시간이 주기를 넘으면 다음 경계까지 기다린다.
        elapsed = time.monotonic() - started
        periods = max(1, math.ceil(elapsed / args.interval))
        await asyncio.sleep(
            max(0.0, periods * args.interval - elapsed)
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["collect", "report"])
    parser.add_argument("--db", default="signals.sqlite")
    parser.add_argument("--interval", type=int, default=900)
    parser.add_argument("--cooldown-hours", type=float, default=24)
    parser.add_argument("--tolerance-minutes", type=int, default=30)
    parser.add_argument("--output", default="validation.json")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    if args.interval < 300:
        parser.error("--interval은 300초 이상으로 지정하세요")
    if args.cooldown_hours <= 0:
        parser.error("--cooldown-hours는 양수여야 합니다")
    if args.tolerance_minutes < 0:
        parser.error("--tolerance-minutes는 0 이상이어야 합니다")

    db = connect(args.db)
    try:
        if args.mode == "collect":
            asyncio.run(collection_loop(db, args))
            return

        report = summarize(
            db, args.tolerance_minutes * 60
        )
        Path(args.output).write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        for row in report:
            if row["observed"] == 0:
                continue

            excess = row["mean_excess_return_pp"]
            excess_text = (
                "미확인" if excess is None else f"{excess:+.2f}pp"
            )
            print(
                f"{row['group']:16} {row['hours']:2}H "
                f"관측={row['observed']:4} "
                f"짝비교={row['matched']:4} "
                f"평균={row['mean_return_pct']:+.2f}% "
                f"대조군 대비={excess_text}"
            )
        print(f"상세 결과: {args.output}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

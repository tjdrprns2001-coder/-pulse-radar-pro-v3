from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import sqlite3
import statistics
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

import aiohttp

from scanner import (
    Binance,
    Config,
    json_safe,
    scan,
    spot_symbol_candidates,
)


SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    ts INTEGER PRIMARY KEY,
    payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT NOT NULL,
    ts INTEGER NOT NULL,
    price REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'unknown',
    PRIMARY KEY (symbol, ts)
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    stage TEXT NOT NULL,
    type TEXT NOT NULL,
    echo INTEGER NOT NULL,
    volume_state TEXT NOT NULL DEFAULT 'QUIET',
    t0 INTEGER NOT NULL,
    price0 REAL NOT NULL,
    price_source TEXT NOT NULL DEFAULT 'unknown',
    score REAL NOT NULL,
    controls TEXT NOT NULL,
    episode_id TEXT,
    scan_ts INTEGER NOT NULL,
    FOREIGN KEY (scan_ts) REFERENCES scans(ts)
);

CREATE INDEX IF NOT EXISTS events_symbol_stage_time
ON events(symbol, stage, t0);
CREATE INDEX IF NOT EXISTS events_episode
ON events(episode_id, t0);
"""




def connect(path):
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=5000")
    db.executescript(SCHEMA)

    # 기존 DB도 새 소스/에피소드 필드를 사용할 수 있도록 제자리 migration.
    migrations = {
        "prices": {
            "source": "TEXT NOT NULL DEFAULT 'unknown'",
        },
        "events": {
            "volume_state": "TEXT NOT NULL DEFAULT 'QUIET'",
            "price_source": "TEXT NOT NULL DEFAULT 'unknown'",
            "episode_id": "TEXT",
        },
    }
    for table, columns in migrations.items():
        existing = {
            row[1] for row in db.execute(
                f"PRAGMA table_info({table})"
            ).fetchall()
        }
        for column, definition in columns.items():
            if column not in existing:
                db.execute(
                    f"ALTER TABLE {table} "
                    f"ADD COLUMN {column} {definition}"
                )

    db.execute(
        "UPDATE prices SET source='unknown' "
        "WHERE source IS NULL OR source=''"
    )
    db.execute(
        "UPDATE events SET price_source='unknown' "
        "WHERE price_source IS NULL OR price_source=''"
    )
    db.execute(
        "UPDATE events SET volume_state="
        "CASE WHEN echo=1 THEN 'VOLUME-ECHO' ELSE 'QUIET' END "
        "WHERE volume_state IS NULL OR volume_state=''"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS events_episode "
        "ON events(episode_id, t0)"
    )
    db.commit()
    return db

def finite_positive(value):
    try:
        number = float(value)
        return math.isfinite(number) and number > 0
    except (TypeError, ValueError):
        return False


async def market_snapshot(allowed_symbols=None):
    timeout = aiohttp.ClientTimeout(total=30)
    allowed = (
        {str(symbol).upper() for symbol in allowed_symbols}
        if allowed_symbols else None
    )

    async with aiohttp.ClientSession(timeout=timeout) as session:
        api = Binance(session)

        try:
            tickers = await api.get("/fapi/v1/ticker/24hr")
            ticker_source = "futures"
        except Exception:
            tickers = await api.get(
                "/api/v3/ticker/24hr",
                base_url="https://api.binance.com",
            )
            ticker_source = "spot"

        try:
            exchange = await api.get("/fapi/v1/exchangeInfo")
            active = {
                row["symbol"]
                for row in exchange.get("symbols", [])
                if row.get("status") == "TRADING"
                and row.get("contractType") == "PERPETUAL"
                and row.get("quoteAsset") == "USDT"
            }
        except Exception:
            if allowed:
                active = set(allowed)
            else:
                active = {
                    str(row.get("symbol", "")).upper()
                    for row in tickers
                    if str(row.get("symbol", "")).upper().endswith("USDT")
                    and "_" not in str(row.get("symbol", ""))
                }

        try:
            clock = await api.get("/fapi/v1/time")
            ts = int(clock["serverTime"]) // 1000
        except Exception:
            ts = int(time.time())

    if allowed:
        active &= allowed

    ticker_map = {
        str(row.get("symbol", "")).upper(): row
        for row in tickers
    }
    market = {}

    for symbol in sorted(active):
        selected = None
        scale = 1.0
        source = ticker_source

        if ticker_source == "futures":
            selected = ticker_map.get(symbol)
        else:
            for spot_symbol, candidate_scale in spot_symbol_candidates(symbol):
                candidate = ticker_map.get(spot_symbol)
                if candidate is not None:
                    selected = candidate
                    scale = candidate_scale
                    source = (
                        "spot"
                        if spot_symbol == symbol and scale == 1.0
                        else f"spot:{spot_symbol}*{scale:g}"
                    )
                    break

        if selected is None:
            continue
        if not finite_positive(selected.get("lastPrice")):
            continue

        try:
            price = float(selected["lastPrice"]) * scale
            volume = float(selected.get("quoteVolume", 0))
            change = float(selected.get("priceChangePercent", 0))
        except (TypeError, ValueError):
            continue
        if not all(math.isfinite(x) for x in (price, volume, change)):
            continue

        market[symbol] = {
            "price": price,
            "volume": max(volume, 0.0),
            "change": change,
            "source": source,
        }

    # 수집 완료 시각을 기준으로 후속 성과를 측정한다.
    return ts, market

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
        ranked.append((distance, other, row["price"], row.get("source")))

    ranked.sort()
    return [
        {
            "symbol": other,
            "price0": price,
            "source": source or "unknown",
            "match_distance": distance,
        }
        for distance, other, price, source in ranked[:count]
    ]

async def build_collection_payload():
    result = await scan(
        SimpleNamespace(symbols=None),
        Config(),
    )
    ts, market = await market_snapshot(
        result.get("universe_symbols")
    )
    return {
        "result": json_safe(result),
        "ts": ts,
        "market": market,
    }


def parse_sink_response(status, text):
    if status >= 300:
        raise RuntimeError(f"원격 저장 실패 HTTP {status}")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("원격 저장 응답이 JSON이 아님") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("원격 저장 응답 형식 오류")
    if str(payload.get("status", "")).lower() != "ok":
        raise RuntimeError("원격 저장소가 실패 상태를 반환함")
    return payload


async def post_collection(payload, sink_url, sink_token, cooldown_hours):
    headers = {"content-type": "application/json"}
    if sink_token:
        headers["authorization"] = f"Bearer {sink_token}"

    body = {
        **payload,
        "cooldown_hours": cooldown_hours,
    }
    timeout = aiohttp.ClientTimeout(total=180)
    retryable = {408, 425, 429, 500, 502, 503, 504}

    async with aiohttp.ClientSession(timeout=timeout) as session:
        last_error = None
        for attempt in range(5):
            try:
                async with session.post(
                    sink_url,
                    json=body,
                    headers=headers,
                ) as response:
                    text = await response.text()
                    try:
                        return parse_sink_response(response.status, text)
                    except RuntimeError as exc:
                        last_error = exc
                        if response.status < 300:
                            raise
                        if response.status not in retryable:
                            raise
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_error = RuntimeError(
                    f"원격 저장 네트워크 오류: {type(exc).__name__}"
                )

            if attempt < 4:
                await asyncio.sleep(min(60, 5 * (2 ** attempt)))

        raise last_error or RuntimeError("원격 저장 실패")

async def collect_once(
    db,
    cooldown_hours,
    sink_url=None,
    sink_token=None,
):
    payload = await build_collection_payload()
    result = payload["result"]
    ts = payload["ts"]
    market = payload["market"]

    if sink_url:
        remote = await post_collection(
            payload, sink_url, sink_token, cooldown_hours
        )
        print(
            f"원격 저장: 가격 {remote.get('prices', len(market))}개, "
            f"신규 신호 {remote.get('added', 0)}개, "
            f"신호 지연 {remote.get('lag_seconds', 'N/A')}초, "
            f"스캐너 오류 {len(result.get('errors', []))}개",
            flush=True,
        )
        preview = []
        for row in result.get("candidates", [])[:120]:
            echo = row.get("volume_echo") or {}
            cascade = row.get("compression_cascade") or {}
            setup = row.get("setup_4h") or {}
            ready = row.get("ready_1h") or {}
            gate15 = row.get("gate_15m") or {}
            oi = row.get("oi") or {}
            preview.append({
                "symbol": row.get("symbol"),
                "price": row.get("price"),
                "type": row.get("type"),
                "stage": row.get("stage"),
                "score": row.get("score"),
                "change_24h_pct": row.get("change_24h_pct"),
                "extended": row.get("extended", False),
                "volume_state": echo.get("state", "QUIET"),
                "echo": bool(echo.get("detected")),
                "compression_count": cascade.get("count"),
                "compression_label": cascade.get("label"),
                "compression_4h_pct": setup.get("compression_pct"),
                "ready_1h": bool(ready.get("ready")),
                "flow_15m": gate15.get("flow"),
                "oi_known": bool(oi.get("known")),
                "oi_1h_pct": oi.get("change_1h_pct"),
                "warnings": row.get("warnings", [])[:4],
            })
        return {
            **remote,
            "_dashboard": {
                "asof_utc": result.get("asof_utc"),
                "universe_count": result.get("universe_count"),
                "rejected_4h_count": result.get("rejected_4h_count"),
                "scanner_errors": len(result.get("errors", [])),
                "candidates": preview,
            },
        }

    if db is None:
        raise ValueError("로컬 저장에는 DB 연결이 필요합니다")

    asof = result["asof_utc"]
    from datetime import datetime

    signal_ts = int(datetime.fromisoformat(asof).timestamp())
    lag_seconds = ts - signal_ts

    all_rows = result["candidates"] + result["extended"]
    error_symbols = {
        str(item.get("symbol", "")).upper()
        for item in result.get("errors", [])
        if item.get("symbol")
    }
    excluded = {row["symbol"] for row in all_rows} | error_symbols

    # 기록은 저장하되, 너무 오래된 스캔은 신규 이벤트로 채택하지 않는다.
    fresh = 0 <= lag_seconds <= 900
    added = 0

    with db:
        db.execute(
            """
            INSERT INTO scans(ts, payload) VALUES (?, ?)
            ON CONFLICT(ts) DO UPDATE SET payload=excluded.payload
            """,
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
            """
            INSERT INTO prices(symbol, ts, price, source)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(symbol, ts) DO UPDATE SET
                price=excluded.price,
                source=excluded.source
            """,
            [
                (
                    symbol,
                    ts,
                    row["price"],
                    row.get("source", "unknown"),
                )
                for symbol, row in market.items()
            ],
        )

        if fresh:
            for row in result["candidates"]:
                symbol, stage = row["symbol"], row["stage"]
                if symbol not in market:
                    continue

                # 같은 종목·단계의 반복 신호는 cooldown 동안 중복 저장하지 않는다.
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

                # 같은 상승 국면에서 stage가 진행돼도 하나의 episode로 묶는다.
                prior_episode = db.execute(
                    """
                    SELECT episode_id FROM events
                    WHERE symbol = ? AND t0 >= ?
                    ORDER BY t0 DESC
                    LIMIT 1
                    """,
                    (
                        symbol,
                        ts - int(cooldown_hours * 3600),
                    ),
                ).fetchone()
                episode_id = (
                    prior_episode[0]
                    if prior_episode and prior_episode[0]
                    else f"{symbol}:{ts}"
                )

                controls = match_controls(symbol, market, excluded)
                echo = row.get("volume_echo") or {}
                db.execute(
                    """
                    INSERT INTO events(
                        symbol, stage, type, echo, volume_state, t0,
                        price0, price_source, score, controls,
                        episode_id, scan_ts
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        symbol,
                        stage,
                        row["type"],
                        int(bool(echo.get("detected"))),
                        echo.get("state", "QUIET"),
                        ts,
                        market[symbol]["price"],
                        market[symbol].get("source", "unknown"),
                        row["score"],
                        json.dumps(controls, ensure_ascii=False),
                        episode_id,
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
    return {
        "status": "ok",
        "prices": len(market),
        "added": added,
        "lag_seconds": lag_seconds,
        "fresh": fresh,
        "scanner_errors": len(result.get("errors", [])),
    }

def future_return(
    db,
    symbol,
    t0,
    price0,
    hours,
    tolerance,
    source=None,
):
    target = t0 + hours * 3600
    if source and source != "unknown":
        row = db.execute(
            """
            SELECT price, ts FROM prices
            WHERE symbol = ? AND source = ?
              AND ts >= ? AND ts <= ?
            ORDER BY ts
            LIMIT 1
            """,
            (symbol, source, target, target + tolerance),
        ).fetchone()
    else:
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
        SELECT id, symbol, stage, type, echo, volume_state, t0,
               price0, price_source, controls, episode_id
        FROM events
        ORDER BY t0, id
        """
    ).fetchall()

    first_by_episode = {}
    normalized = []
    for row in events:
        (
            event_id,
            symbol,
            stage,
            kind,
            echo,
            volume_state,
            t0,
            price0,
            price_source,
            encoded,
            episode_id,
        ) = row
        episode = episode_id or f"legacy:{event_id}"
        if episode not in first_by_episode:
            first_by_episode[episode] = event_id
        normalized.append(
            (
                event_id,
                symbol,
                stage,
                kind,
                echo,
                volume_state,
                t0,
                price0,
                price_source,
                encoded,
                episode,
            )
        )

    groups = {}

    for (
        event_id,
        symbol,
        stage,
        kind,
        echo,
        volume_state,
        t0,
        price0,
        price_source,
        encoded,
        episode,
    ) in normalized:
        controls = json.loads(encoded)

        for hours in (1, 4, 24):
            ret = future_return(
                db,
                symbol,
                t0,
                price0,
                hours,
                tolerance,
                price_source,
            )

            control_returns = [
                future_return(
                    db,
                    item["symbol"],
                    t0,
                    item["price0"],
                    hours,
                    tolerance,
                    item.get("source"),
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

            # stage는 단계별 이벤트 자체를 측정한다.
            # type/echo/volume은 동일 episode의 첫 신호만 사용해
            # PRE→ARMED→IGNITION 진행을 독립 표본처럼 중복 가중하지 않는다.
            labels = [f"stage:{stage}"]
            if first_by_episode[episode] == event_id:
                labels.extend([
                    f"type:{kind}",
                    f"echo:{'yes' if echo else 'no'}",
                    f"volume:{volume_state or 'QUIET'}",
                    "combo:"
                    + "|".join([
                        stage,
                        kind,
                        volume_state or "QUIET",
                    ]),
                ])

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


def self_test():
    path = tempfile.mktemp(prefix="preignition-", suffix=".sqlite")
    db = connect(path)
    try:
        t0 = 1_700_000_000
        with db:
            db.execute(
                "INSERT INTO scans(ts, payload) VALUES (?, ?)",
                (t0, "{}"),
            )
            db.executemany(
                """
                INSERT INTO prices(symbol, ts, price, source)
                VALUES (?, ?, ?, ?)
                """,
                [
                    ("AAAUSDT", t0, 100.0, "futures"),
                    ("AAAUSDT", t0 + 3600, 999.0, "spot"),
                    ("AAAUSDT", t0 + 3660, 105.0, "futures"),
                ],
            )
            db.execute(
                """
                INSERT INTO events(
                    symbol, stage, type, echo, volume_state, t0,
                    price0, price_source, score, controls,
                    episode_id, scan_ts
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "AAAUSDT",
                    "PRE",
                    "A",
                    0,
                    "QUIET",
                    t0,
                    100.0,
                    "futures",
                    50.0,
                    "[]",
                    "AAAUSDT:episode",
                    t0,
                ),
            )
            db.execute(
                """
                INSERT INTO events(
                    symbol, stage, type, echo, volume_state, t0,
                    price0, price_source, score, controls,
                    episode_id, scan_ts
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "AAAUSDT",
                    "ARMED",
                    "A+B",
                    1,
                    "VOLUME-ECHO",
                    t0 + 60,
                    100.0,
                    "futures",
                    70.0,
                    "[]",
                    "AAAUSDT:episode",
                    t0,
                ),
            )

        # 같은 소스의 첫 관측만 사용하고 spot 가격은 섞지 않는다.
        value = future_return(
            db, "AAAUSDT", t0, 100.0, 1, 120, "futures"
        )
        assert value is not None and abs(value - 5.0) < 1e-9

        report = summarize(db, 120)
        type_rows = [
            row for row in report
            if row["group"].startswith("type:")
            and row["hours"] == 1
        ]
        assert len(type_rows) == 1
        assert type_rows[0]["group"] == "type:A"
        assert type_rows[0]["events"] == 1

        assert parse_sink_response(
            200, '{"status":"ok","added":1}'
        )["added"] == 1
        try:
            parse_sink_response(200, '{"status":"error"}')
        except RuntimeError:
            pass
        else:
            raise AssertionError("sink error 응답을 성공으로 처리함")

        print("validate self-test passed")
    finally:
        db.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(path + suffix)
            except FileNotFoundError:
                pass

async def collection_loop(db, args):
    while True:
        started = time.monotonic()
        try:
            await collect_once(
                db,
                args.cooldown_hours,
                sink_url=args.sink_url,
                sink_token=args.sink_token,
            )
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
    parser.add_argument(
        "mode",
        choices=["collect", "report", "self-test"],
    )
    parser.add_argument("--db", default="signals.sqlite")
    parser.add_argument("--interval", type=int, default=900)
    parser.add_argument("--cooldown-hours", type=float, default=24)
    parser.add_argument("--tolerance-minutes", type=int, default=30)
    parser.add_argument("--output", default="validation.json")
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--sink-url",
        default=os.getenv("OOS_SINK_URL"),
    )
    parser.add_argument(
        "--sink-token",
        default=os.getenv("OOS_VALIDATION_TOKEN"),
    )
    args = parser.parse_args()

    if args.mode == "self-test":
        self_test()
        return

    if args.interval < 300:
        parser.error("--interval은 300초 이상으로 지정하세요")
    if args.cooldown_hours <= 0:
        parser.error("--cooldown-hours는 양수여야 합니다")
    if args.tolerance_minutes < 0:
        parser.error("--tolerance-minutes는 0 이상이어야 합니다")

    db = None
    if args.mode == "report" or not args.sink_url:
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
        if db is not None:
            db.close()

if __name__ == "__main__":
    main()

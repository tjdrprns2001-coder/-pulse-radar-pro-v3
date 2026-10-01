"""Read-only API smoke test; failures are recorded separately from offline tests."""
import argparse
import asyncio
import json
from pathlib import Path

import aiohttp

from scanner import Binance, Config, TF_MS, json_safe, oi_features


async def check():
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        api = Binance(session)
        clock, exchange = await asyncio.gather(
            api.get("/fapi/v1/time"), api.get("/fapi/v1/exchangeInfo"))
        active = {r["symbol"] for r in exchange["symbols"]
                  if r["status"] == "TRADING" and r["contractType"] == "PERPETUAL"
                  and r["quoteAsset"] == "USDT"}
        if "BTCUSDT" not in active:
            raise ValueError("BTCUSDT is not an active USDT perpetual")
        asof = ((int(clock["serverTime"]) - 5000) // TF_MS["5m"]) * TF_MS["5m"]
        cfg = Config()
        intervals = ["1d", "4h", "1h", "15m", "5m"]
        frames = await asyncio.gather(
            *(api.candles("BTCUSDT", tf, asof, cfg) for tf in intervals))
        oi = await oi_features(api, "BTCUSDT", asof, cfg)
        return {"status": "ok" if oi["known"] else "oi_unavailable",
                "symbol": "BTCUSDT", "universe_count": len(active), "asof_ms": asof,
                "frames": {tf: {"bars": len(frame),
                                 "last_close_time": int(frame.close_time.iloc[-1])}
                           for tf, frame in zip(intervals, frames)},
                "oi": oi}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", default="live-smoke.json")
    args = p.parse_args()
    try:
        result = asyncio.run(check())
    except Exception as exc:
        result = {"status": "failed", "error_type": type(exc).__name__, "error": str(exc)}
    result = json_safe(result)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2,
                                           allow_nan=False), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0 if result["status"] == "ok" else 1)


if __name__ == "__main__":
    main()

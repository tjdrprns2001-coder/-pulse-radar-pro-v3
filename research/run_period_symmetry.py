"""CLI for independent daily period-symmetry research scanner.

python -m research.run_period_symmetry --symbols ONDOUSDT APTUSDT FILUSDT
python -m research.run_period_symmetry --all
Only closed Binance USD-M futures daily candles; no order execution.
"""
import argparse
import concurrent.futures
import json
import time
import urllib.parse
import urllib.request
from .period_symmetry_scan import scan_bowl

BASE = "https://fapi.binance.com"

def get_json(path, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"User-Agent": "period-symmetry-research/1.0"})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)

def universe():
    info = get_json("/fapi/v1/exchangeInfo")
    return sorted(x["symbol"] for x in info["symbols"]
        if x.get("status") == "TRADING" and x.get("contractType") == "PERPETUAL"
        and x.get("quoteAsset") == "USDT" and x.get("underlyingType") == "COIN")

def analyze(symbol):
    try:
        candles = get_json("/fapi/v1/klines", {"symbol": symbol, "interval": "1d", "limit": 750})
        now_ms = int(time.time() * 1000)
        closed = [x for x in candles if int(x[6]) < now_ms]
        if len(closed) < 500:
            return {"symbol": symbol, "stage": "INSUFFICIENT_HISTORY", "bars": len(closed)}
        try:
            return {"symbol": symbol, **scan_bowl(closed).to_dict()}
        except ValueError as error:
            return {"symbol": symbol, "stage": "NO_PATTERN", "reason": str(error)}
    except Exception as error:
        return {"symbol": symbol, "stage": "DATA_ERROR", "error": str(error)[:160]}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="+", default=["ONDOUSDT", "APTUSDT", "FILUSDT"])
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.workers <= 6:
        parser.error("workers must be 1..6")
    symbols = universe() if args.all else list(dict.fromkeys(args.symbols))
    if args.limit > 0:
        symbols = symbols[:args.limit]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(analyze, symbols))
    priority = {"PRE": 0, "BREAKOUT": 1, "RETEST_CANDIDATE": 2,
                "EXTENDED": 3, "REJECT": 4, "NO_PATTERN": 5,
                "INSUFFICIENT_HISTORY": 6, "DATA_ERROR": 7}
    results.sort(key=lambda x: (priority.get(x["stage"], 9), x["symbol"]))
    print(json.dumps({"count": len(results), "results": results}, ensure_ascii=False, indent=2))
    if any(x["stage"] == "DATA_ERROR" for x in results):
        raise SystemExit(2)

if __name__ == "__main__":
    main()

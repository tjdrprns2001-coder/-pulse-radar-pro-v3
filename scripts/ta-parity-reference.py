#!/usr/bin/env python3
"""MIT-licensed bukosabino/ta library used as a test oracle; not in production."""
import json
import math
import sys

import pandas as pd
from ta.trend import SMAIndicator, EMAIndicator, MACD
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange


def as_json_array(series):
    out = []
    for value in series:
        try:
            x = float(value)
            out.append(x if math.isfinite(x) else None)
        except (TypeError, ValueError):
            out.append(None)
    return out


def main():
    bars = json.load(sys.stdin)["candles"]
    df = pd.DataFrame(bars)
    close = pd.to_numeric(df["close"]), 
    c = close[0]
    high, low = pd.to_numeric(df["high"]), pd.to_numeric(df["low"])
    m = MACD(close=c, window_slow=26, window_fast=12, window_sign=9, fillna=False)
    values = {
        "sma112": as_json_array(SMAIndicator(close=c, window=112).sma_indicator()),
        "ema20": as_json_array(EMAIndicator(close=c, window=20).ema_indicator()),
        "rsi14": as_json_array(RSIIndicator(close=c, window=14).rsi()),
        "macd": {
            "line": as_json_array(m.macd()),
            "signal": as_json_array(m.macd_signal()),
            "hist": as_json_array(m.macd_diff()),
        },
        "atr14": as_json_array(AverageTrueRange(high=high, low=low, close=c, window=14).average_true_range()),
    }
    print(json.dumps(values, separators=(",", ":")))


if __name__ == "__main__":
    main()

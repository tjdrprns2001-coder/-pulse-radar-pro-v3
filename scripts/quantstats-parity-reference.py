#!/usr/bin/env python3
"""Independent, pinned QuantStats 0.0.86 reference. Invoked only by CI.

This test oracle reads externally generated DAILY EQUITY marks from stdin.
No live exchanges, brokerage connections, training, or network calls.
"""
import json
import math
import sys

import pandas as pd
import quantstats as qs

PERIODS = 365.25


def safe(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (ValueError, TypeError):
        return None
    return f if math.isfinite(f) else None


def calculate(items):
    equity = pd.Series(
        [float(row["equity"]) for row in items],
        index=pd.to_datetime([int(row["time"]) for row in items], unit="ms", utc=True),
        dtype="float64",
    )
    # Dates have already been checked to be contiguous UTC 24h marks by JS.
    # Feed actual daily returns (not trade returns) to QuantStats.
    returns = equity.pct_change(fill_method=None).iloc[1:]
    return {
        "observationDays": len(returns),
        "totalReturnPct": safe(qs.stats.comp(returns) * 100),
        "cagrPct": safe(qs.stats.cagr(returns, periods=PERIODS) * 100),
        "annualizedVolPct": safe(
            qs.stats.volatility(returns, periods=PERIODS, annualize=True) * 100
        ),
        "sharpe": safe(qs.stats.sharpe(returns, rf=0, periods=PERIODS)),
        "sortino": safe(qs.stats.sortino(returns, rf=0, periods=PERIODS)),
        "maxDrawdownPct": safe(qs.stats.max_drawdown(equity) * 100),
    }


def main():
    payload = json.load(sys.stdin)
    results = {key: calculate(rows) for key, rows in payload["fixtures"].items()}
    print(
        json.dumps(
            {
                "reference": "quantstats",
                "version": qs.__version__,
                "periodsPerYear": PERIODS,
                "riskFreeRate": 0,
                "results": results,
            },
            separators=(",", ":"),
            allow_nan=False,
        )
    )


if __name__ == "__main__":
    main()

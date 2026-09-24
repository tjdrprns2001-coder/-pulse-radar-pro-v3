# Dante Walk-Forward Research Snapshot — 2026-09-24

Status: **SHADOW_ONLY / RESEARCH ONLY**  
Ruleset: `DANTE_RULESET_v1`  
Runtime: `DANTE_BACKTEST_RUNTIME_v1`  
Window: 2021-01-01 through 2026-09-24  
Timeframe: 1D  
Execution: next eligible daily bar open  
Round-trip friction: 0.20%  
Signal data: CLOSED_ONLY  
Ranking contribution: 0

## Data-source note

The Netlify validation environment returned HTTP 451 from Binance USDⓈ-M futures history.  
The runtime therefore used its explicit fallback:

```text
BINANCE_USDT_PERPETUAL
  -> access failure (HTTP 451)
  -> BINANCE_SPOT_FALLBACK
```

All three symbols below used `BINANCE_SPOT_FALLBACK`. Results must not be presented as futures/OI validation.

Every live backtest completed causal-to-prefix parity with **0 mismatches**.

---

## Fixed-default baseline

### BTCUSDT

- history: 2,092 daily bars
- total events: 18
- DANTE_256: 17
- Rice Bowl PHASE_3_CONFIRMED entries: 1
- parity: 18 checked / 0 mismatches

DANTE_256:

| Horizon | n | Mean net | Median net | Positive |
|---|---:|---:|---:|---:|
| 5D | 17 | -0.90% | +0.60% | 52.9% |
| 10D | 17 | +1.00% | -1.31% | 41.2% |
| 20D | 17 | +2.92% | +0.94% | 52.9% |
| 40D | 17 | +6.32% | +7.85% | 58.8% |

Rice Bowl only had one confirmed event, therefore it is not a meaningful efficacy sample.  
Its observed outcomes were +3.92% at 5D, +0.27% at 10D, approximately 0.00% at 20D, and 40D was pending at capture time.

BTC baseline split:

| Split | n | 20D mean | 20D median | 40D mean | 40D median | 40D positive |
|---|---:|---:|---:|---:|---:|---:|
| Train | 8 | +1.56% | -1.16% | +4.61% | -4.19% | 37.5% |
| Validation | 10 | +3.72% | +0.47% | +7.84%* | +9.35%* | 77.8%* |

`* 40D validation n=9 because one horizon was not yet complete.`

### ETHUSDT

- history: 2,092 daily bars
- total events: 15
- DANTE_256: 15
- Rice Bowl confirmed entries: 0
- parity: 15 / 0 mismatches

DANTE_256:

| Horizon | n | Mean net | Median net | Positive |
|---|---:|---:|---:|---:|
| 5D | 15 | +4.30% | +1.79% | 73.3% |
| 10D | 15 | +6.40% | +6.05% | 73.3% |
| 20D | 15 | +8.73% | +4.34% | 53.3% |
| 40D | 15 | +7.50% | +5.73% | 73.3% |

Validation contains only 4 events, so the apparently strong forward results are low-confidence.

### SOLUSDT

- history: 2,092 daily bars
- total events: 17
- DANTE_256: 16
- Rice Bowl confirmed entries: 1
- parity: 17 / 0 mismatches

DANTE_256:

| Horizon | n | Mean net | Median net | Positive |
|---|---:|---:|---:|---:|
| 5D | 16 | +2.61% | +3.12% | 62.5% |
| 10D | 16 | +3.56% | +4.33% | 56.3% |
| 20D | 16 | +0.20% | -0.84% | 50.0% |
| 40D | 16 | -0.14% | -8.82% | 37.5% |

The single SOL Rice Bowl event was negative across 5/10/20/40D. One observation is not sufficient for a conclusion.

---

## Descriptive pooled DANTE_256 view

Across BTC + ETH + SOL there were 48 DANTE_256 candidate events.

This is a simple weighted descriptive aggregation, **not an independence-adjusted statistical estimate**:

| Horizon | Weighted mean net | Positive share |
|---|---:|---:|
| 5D | +1.90% | 62.5% |
| 10D | +3.54% | 56.3% |
| 20D | +3.83% | 52.1% |
| 40D | +4.54% | 56.3% |

Cross-asset dispersion is substantial. SOL's 40D result is materially weaker than BTC/ETH, so a single pooled mean must not be treated as a stable edge.

---

## BTC parameter sensitivity

The default is preserved. Sensitivity observations do **not** change production/research defaults.

### Rice Bowl-related perturbations

For BTC, these variants produced effectively the same baseline outcome because only one Rice Bowl confirmation existed:

- breakout buffer 0.10 ATR
- prior-below-EMA224 = 60
- prior-below-EMA224 = 100
- retest window = 3
- retest window = 8

Breakout buffer 0.30 ATR removed the single Rice Bowl event, leaving only the 17 DANTE_256 events.

Therefore BTC currently has insufficient Rice Bowl sample count to infer parameter robustness.

### 256 EMA60 distance sensitivity

Default: `maxDistanceToEma60Atr = 1.5`

| Variant | Total events | D256 n | D256 20D mean | D256 20D median | D256 40D mean | D256 40D median | D256 40D positive |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1.0 ATR | 12 | 11 | +3.15% | +3.72% | +9.74% | +11.75% | 63.6% |
| 1.5 ATR default | 18 | 17 | +2.92% | +0.94% | +6.32% | +7.85% | 58.8% |
| 2.0 ATR | 22 | 21 | +0.46% | -0.68% | +3.86% | +2.21% | 52.4% |

The 1.0 ATR variant looks stronger on this BTC window, especially in the validation subset, but **must not replace the frozen 1.5 default based on this result**. Doing so would turn the validation interval into a tuning set.

The proper next step is a separate discovery/validation protocol across a broader universe and additional market regimes.

---

## Observed limitations

1. This snapshot uses Binance spot fallback because futures history was blocked in the Netlify environment.
2. It validates price-pattern rules only; OI, taker, funding, and cross-exchange derivatives evidence are not included.
3. BTC/ETH/SOL are surviving large-cap assets. This is not a survivorship-bias-safe universe test.
4. Rice Bowl confirmed-event count is far too small to estimate its efficacy.
5. Fixed-horizon returns are signal-study outcomes, not a full portfolio equity curve.
6. Overlapping event horizons can make observations statistically dependent.
7. No claim of win probability, expected future return, or ranking activation is justified from this snapshot.

## Frozen decision after this snapshot

- Keep `DANTE_256.maxDistanceToEma60Atr = 1.5`.
- Keep Rice Bowl defaults unchanged.
- Keep all Dante outputs `SHADOW_ONLY`.
- Keep ranking/scanner/book-evidence contribution at zero.
- Treat 1.0 / 2.0 ATR results as sensitivity evidence only.
- Expand validation universe before any readiness-gate discussion.

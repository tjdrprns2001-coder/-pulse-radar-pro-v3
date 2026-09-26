# PRE-SURGE aggregate statistics — 2026-09-27

Unique-symbol reverse-trace samples: **20**. Repeated symbols use the newest sample.

| Metric | Mean | Median |
|---|---:|---:|
| 15m RVOL | 1.46x | 1.33x |
| RSI14 15m | 61.0 | 64.3 |
| OI 1H | -0.11% | -0.06% |
| OI 4H | 1.33% | 0.23% |
| OI 8H | 1.71% | 0.25% |
| Taker 15m avg (last 1H) | 1.07 | 1.03 |
| Price change in prior 6H | 3.11% | 1.67% |

## Frequency

- RVOL >= 1.0x: 65%
- RVOL >= 1.5x: 35%
- RVOL >= 3.0x: 10%
- OI 4H positive: 55%
- OI 4H >= +1%: 30%
- OI 4H negative: 45%
- Taker avg >= 1.0: 60%
- Taker avg >= 1.2: 30%
- RSI 40~70: 65%
- Prior 6H price within ±3%: 60%
- EMA20 distance within ±2%: 65%

## Takeaway

The most common pre-surge state is **not** “OI +1% + RVOL 3x + taker 1.5 all at once.” The recurring pattern is closer to **price still relatively contained + one or two leading dimensions (OI, flow, or RVOL) starting to improve**, with the remaining dimensions often confirming later.

Use median values for scanner calibration because the mean OI values are distorted by a few extreme build samples.

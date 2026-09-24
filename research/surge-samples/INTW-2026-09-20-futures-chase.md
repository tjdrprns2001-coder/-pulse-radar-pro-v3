# INTW Surge Sample — 2026-09-20

## Classification
- pattern_primary: DELEVERAGING_IGNITION
- pattern_secondary: FUTURES_CHASE
- T0: IGNITION_T0
- outcome_label: HISTORICAL_SUCCESS_SAMPLE

## Observed surge
- reference T0: 2026-09-20 15:00 UTC
- T0 close: 27.05
- sampled max 24H surge: +24.29%

## Reverse path
| Window | Price | OI | Avg taker B/S |
|---|---:|---:|---:|
| T-72H → T0 | -0.77% | -25.84% | 1.140 |
| T-48H → T0 | +6.04% | -7.13% | 1.211 |
| T-24H → T0 | +3.13% | +2.99% | 1.201 |
| T-12H → T0 | +1.01% | -0.57% | 1.108 |
| T-6H → T0 | +0.71% | -0.09% | 1.306 |

## T0 structure
- 5m RVOL 5.92x
- 5m buy share 66%
- 15m RVOL 1.36x, buy share 63%
- 1H strong bullish body, before large HTF breakout
- sequence: leverage cleanup → taker survives → OI stabilizes → LTF volume ignition

## Spot / basis
- Binance spot pair unavailable
- used Binance index price as indirect spot basket proxy
- basis:
  - T-24H +0.110%
  - T-12H +0.257%
  - T-6H -0.001%
  - T-3H -0.093%
  - T0 +0.356%
- basis flipped from discount/neutral to strong positive at T0
- classify as FUTURES_CHASE

## Book structure tags
- price stabilization after deleveraging
- LTF volume expansion before HTF breakout
- breakout still needed for confirmation

## ICT / SMC tags
- LTF displacement candidate
- ignition before full HTF BOS
- monitor close-based BOS rather than wick only

## Research takeaway
INTW is a strong example of OI cleanup not being bearish by itself. Taker stayed >1 during deleveraging, then a 5m RVOL burst and basis flip marked futures participation catching up.

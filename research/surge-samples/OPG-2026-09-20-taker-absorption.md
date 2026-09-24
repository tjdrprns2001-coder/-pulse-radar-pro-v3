# OPG Surge Sample — 2026-09-20

## Classification
- pattern_primary: TAKER_ABSORPTION_IGNITION
- pattern_secondary: DERIVATIVES_LED
- T0: BASE_T0
- outcome_label: HISTORICAL_SUCCESS_SAMPLE

## Observed surge
- reference T0: 2026-09-20 08:00 UTC
- T0 close: 0.1111
- sampled max 24H surge: +25.38%

## Reverse path
| Window | Price | OI | Avg taker B/S |
|---|---:|---:|---:|
| T-72H → T0 | +6.52% | +11.03% | 1.084 |
| T-48H → T0 | +1.83% | +1.40% | 1.045 |
| T-24H → T0 | +0.36% | +3.94% | 1.082 |
| T-12H → T0 | -3.39% | -0.04% | 1.097 |
| T-6H → T0 | -1.42% | -1.18% | 1.287 |

## T0 structure
- 4H RSI 66.2, EMA20 > EMA50
- 1H RSI 39.1, RVOL 2.01x
- 15m RSI 38.4, RVOL 1.34x
- price was in an LTF flush while HTF trend remained constructive
- 6H cumulative taker stayed strongly buy-dominant despite local price weakness

## Spot / basis
- Binance spot available
- spot and futures returns were mostly synchronous
- T0 basis: +0.074%
- no strong evidence that spot led the move
- classify as DERIVATIVES/Taker-led rather than SPOT_LEAD

## Book structure tags
- HTF trend intact
- LTF pullback / support test
- resistance reclaim required after flush
- breakout quality should be confirmed with volume

## ICT / SMC tags
- LTF liquidity reset candidate
- reclaim / MSS-BOS sequence required after base
- not a clean wick-only breakout sample

## Research takeaway
OPG is a useful example where the final local candles looked weak, but multi-hour taker stayed >1 and accelerated to ~1.29 while OI flattened. Do not reject solely because the immediate candle is bearish.

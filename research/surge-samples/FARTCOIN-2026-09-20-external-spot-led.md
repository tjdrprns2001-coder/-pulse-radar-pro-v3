# FARTCOIN Surge Sample — 2026-09-20

## Classification
- pattern_primary: EXTERNAL_SPOT_LEAD_CANDIDATE
- pattern_secondary: LOW_DERIVATIVES_SIGNAL
- T0: IGNITION_T0
- outcome_label: HISTORICAL_SUCCESS_SAMPLE
- confidence_note: external spot lead is a candidate, not fully exchange-time-resolved

## Observed surge
- reference T0: 2026-09-20 15:00 UTC
- T0 close: 0.1662
- sampled max 24H surge: +19.19%

## Reverse path
| Window | Price | OI | Avg taker B/S |
|---|---:|---:|---:|
| T-72H → T0 | +14.86% | -5.26% | 1.008 |
| T-48H → T0 | +4.40% | -7.31% | 0.994 |
| T-24H → T0 | +3.10% | -3.95% | 0.963 |
| T-12H → T0 | +2.47% | +1.67% | 0.913 |
| T-6H → T0 | +1.22% | -0.66% | 0.950 |

## T0 structure
- 15m RVOL 2.40x, buy share 59%
- 5m RVOL 2.16x
- 1H T0 candle expanded from 0.1604 to 0.1662
- Binance futures OI/taker did not provide a strong lead
- 6H OBV was not strongly positive

## Spot / basis
- Binance FARTCOIN spot USDT pair unavailable
- used Binance futures index price as indirect external spot basket proxy
- basis:
  - T-24H +0.214%
  - T-12H +0.112%
  - T-6H +0.173%
  - T-3H +0.209%
  - T0 +0.115%
- futures premium was modest, not extreme
- external spot markets therefore remain a plausible source of leading demand
- requires future exchange-level timestamped spot-volume verification before being upgraded from candidate

## Book structure tags
- LTF base followed by strong bullish expansion
- thin-overhead-supply hypothesis worth testing
- breakout volume expanded from local base

## ICT / SMC tags
- LTF displacement / ignition candidate
- no strong derivatives-led pre-signal
- cross-exchange confirmation required

## Research takeaway
FARTCOIN is a key sample showing that a Binance-futures-only scanner can miss a move. Add an external spot route rather than assuming every surge must be explained by OI or taker.

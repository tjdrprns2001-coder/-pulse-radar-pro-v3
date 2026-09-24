# EPIC Surge Sample — 2026-09-18

## Classification
- pattern_primary: OI_LEAD
- pattern_secondary: SPOT_SUPPORTED_OI_LEAD
- T0: BREAKOUT_T0
- outcome_label: HISTORICAL_SUCCESS_SAMPLE

## Observed surge
- reference T0: 2026-09-18 19:00 UTC
- T0 close: 0.3814
- sampled max 24H surge: +39.51%

## Reverse path
| Window | Price | OI | Avg taker B/S |
|---|---:|---:|---:|
| T-72H → T0 | +9.72% | +18.56% | 1.045 |
| T-48H → T0 | +9.72% | +18.56% | 1.045 |
| T-24H → T0 | +8.94% | +17.41% | 1.046 |
| T-12H → T0 | +5.13% | +13.71% | 0.900 |
| T-6H → T0 | +5.80% | +13.43% | 0.949 |

## T0 structure
- 4H RSI 92.4
- 4H RVOL 7.89x
- 4H close broke recent 20-bar high
- 1H RVOL 1.89x
- MACD histogram flipped from negative to positive into T0
- OBV 6H change was strongly positive
- breakout was already active by the prior 1H candle

## Spot / basis
- Binance spot available
- spot share of combined Binance spot+futures turnover:
  - T-72→48H 18.7%
  - T-48→24H 20.3%
  - T-24→12H 17.9%
  - T-12→6H 37.4%
  - T-6→0H 20.6%
- basis around T0 remained near neutral:
  - T-24H -0.056%
  - T-12H -0.205%
  - T-6H -0.027%
  - T0 -0.028%
- strong spot participation occurred before the final futures expansion
- classify as SPOT_SUPPORTED_OI_LEAD

## Book structure tags
- resistance breakout with strong volume
- moving averages aligned bullishly
- breakout quality supported by volume expansion

## ICT / SMC tags
- HTF BOS / displacement confirmed
- liquidity above consumed on close
- T0 is not early pre-surge; it is breakout confirmation

## Research takeaway
EPIC is the clean benchmark for a classical OI-led breakout with spot support. It is useful as a high-confidence confirmation sample but is likely detected later than BASE_T0 or IGNITION_T0 patterns.

# FIL PRE-SURGE sample — 2026-09-22

Status: PRE-SURGE -> IGNITION boundary (tracking sample; not labeled as a successful surge yet)
Source: Binance USDⓈ-M futures live observations captured during analysis.

## Pattern
OI Lead -> Taker Cascade -> Liquidity Break

The sample is intentionally outcome-neutral. Keep both successful and failed outcomes for later calibration.

## Multi-timeframe snapshot
| TF | RSI | RVOL | Notes |
|---|---:|---:|---|
| 1W | 61.7 | 0.24 | recovery; EMA20 above, EMA50 below |
| 3D | 64.3 | 1.17 | relative volume expansion |
| 1D | 62.3 | incomplete candle | EMA20/50 above |
| 12H | 66.8 | incomplete candle | bullish alignment |
| 4H | 40.2 | incomplete candle | momentum reset while structure held |
| 2H | 68.5 | 0.20 | lower-TF recovery |
| 1H | 52.7 | 0.38 | EMA20/50 above |
| 15m | 64.0 | 0.54 | taker share ~58.8% |
| 5m | 69.5 | 0.92 | short-term ignition attempt |

Do not compare incomplete-candle RVOL directly with completed bars. Scanner should use elapsed-time-adjusted RVOL for live candles.

## Derivatives snapshot
- OI change: 5m +0.16%, 15m +4.45%, 1H window +10.63%, 4H window +9.49%
- Taker buy/sell: 5m 1.5156, 15m 0.9040, 1H 0.9698
- Funding: +0.00002981
- Global account long/short ratio: 1.5820
- Top-trader position long/short ratio: 2.8935

Interpretation: OI expanded before broad taker confirmation. Recent 5m aggressive buying appeared, but 15m/1H had not yet confirmed. High top-trader long bias is a crowding risk, so OI growth alone must never be treated as bullish confirmation.

## Liquidity / structure levels
- 0.9961: nearest 5m/15m BSL / first alert
- 1.0166: key 1H/2H liquidity and BOS confirmation area
- 1.1345: higher 4H liquidity
- 0.9809: 5m defense
- 0.9625: 15m structure
- 0.9437: 1H invalidation warning
- 0.9066-0.9130: deeper 2H/4H structural defense

## Detector proposal
### Stage A — OI_LEAD
Flag when price remains relatively compressed while normalized OI acceleration materially exceeds price expansion.

### Stage B — TAKER_CASCADE
Track directional propagation across 5m -> 15m -> 1H. A 5m spike is an early alert only; confirmation requires persistence/propagation rather than one isolated print.

### Stage C — LIQUIDITY_BREAK
Require close-based BOS through the relevant external liquidity, preferably with displacement/RVOL expansion. A wick-only sweep is not a breakout.

### Positive confirmation path
0.9961 close-based break -> hold/retest -> 1.0166 BOS -> RVOL expansion -> 15m/1H taker > 1 with OI holding/increasing -> displacement/FVG or OB retest holds.

### Failure / counter-evidence
- repeated rejection at 0.9961-1.0166
- taker deteriorates while OI continues rising
- long/short crowding increases without price progress
- 0.9809 loss followed by 0.9625 loss
- 0.9437 loss materially degrades the setup

## Labels
- sample_family: PRE_SURGE
- subtype: OI_LEAD_TAKER_CASCADE_LIQUIDITY_BREAK
- current_state: IGNITION_WATCH
- direction_usage: LONG_RESEARCH
- outcome: PENDING
- keep_failed_samples: true

## Follow-up
Record T+1h, T+4h, T+12h and T+24h outcomes. Do not overwrite this snapshot; append outcome records so successful and failed examples remain available for calibration.

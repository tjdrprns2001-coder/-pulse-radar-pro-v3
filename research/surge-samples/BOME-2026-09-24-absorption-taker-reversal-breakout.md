# BOME PRE-SURGE sample — 2026-09-24

## Classification
- pattern_primary: SELL_ABSORPTION_TAKER_REVERSAL_BREAKOUT
- pattern_secondary: SPOT_SUPPORTED_LIQUIDITY_RECLAIM
- T0: BREAKOUT_T0
- outcome_label: HISTORICAL_SUCCESS_SAMPLE
- direction_usage: LONG_RESEARCH
- bull_trap_note: initial breakout was valid, but post-ignition OI crowding requires separate bull-trap monitoring

## Core sequence

```
Lower-liquidity sweep / leverage cleanup
→ price reclaims base
→ first abnormal 15m volume burst
→ taker remains sell-dominant but price refuses to break down
→ OI rebuilds
→ taker flips above 1 and accelerates
→ spot and futures rise together
→ 1H close breaks 0.00115~0.00116 resistance
→ expansion
→ post-ignition OI crowding / bull-trap watch
```

## Higher-timeframe context
- 1D EMA20/50/112/224 all below price into the move
- 1D RSI before the later expansion snapshot: 62.6
- 4H EMA20 > EMA50 > EMA112 > EMA224
- recent 4H swing highs stair-stepped:
  - 0.0010696
  - 0.0010924
  - 0.0011333
  - 0.0011581
- 2026-09-23 lower-liquidity probe reached 0.0009872 and was reclaimed

## 1H breakout T0
Reference T0: **2026-09-24 05:00 UTC**

- open: 0.0011241
- close: 0.0011879
- candle return: **+5.68%**
- RVOL20: **5.03x**
- prior 20-bar high / breakout reference: **0.0011567**
- close-based breakout: **confirmed**
- futures quote turnover in T0 1H: **~6.55M USDT**
- spot quote turnover in T0 1H: **~1.55M USDT**

## Reverse path into T0

| Window | Price into T0 | OI into T0 | Avg taker B/S |
|---|---:|---:|---:|
| T-24H → T0 | +0.46% | -4.79% | 0.898 |
| T-12H → T0 | +10.00% | +16.55% | 0.972 |
| T-6H → T0 | +9.66% | +16.61% | 0.916 |

Interpretation:
- 24H before T0 was not a persistent long-crowding build; OI was still below the 24H-earlier level.
- During the final 6–12H, OI rebuilt while taker remained below 1.
- Price strength despite sell-dominant taker is the key absorption clue.

## Earliest 15m ignition evidence

### 2026-09-24 02:15 UTC
- BOME futures: **+3.37%**
- 15m RVOL: **4.56x**
- taker B/S: **0.930**
- spot: **+3.15%**
- BTC same 15m: **+0.26%**

This was the earliest strong abnormal-volume impulse in the sampled pre-breakout sequence.

## Absorption test

At **03:30 UTC**:
- 15m BOME return: **-1.29%**
- taker B/S: **0.4899**
- OI value: **~9.35M USDT**
- close: **0.0010797**
- BTC same 15m: **-0.06%**

Despite extreme sell-dominant taker flow, price did not collapse back through the reconstructed base. This is the main absorption / seller-exhaustion evidence.

## Taker reversal cascade

The transition from absorption to actual buy aggression was sequential:

| UTC | 15m return | Taker B/S |
|---|---:|---:|
| 04:00 | +0.47% | 1.0759 |
| 04:15 | +0.63% | 1.2614 |
| 04:30 | +1.28% | 1.1547 |
| 04:45 | +1.51% | 1.4722 |
| 05:00 | +3.89% | 1.3447 |

This is materially stronger evidence than one isolated taker spike.

## Spot confirmation / market-relative strength
At 05:00 UTC:
- futures 15m: **+3.89%**
- Binance spot 15m: **+3.82%**
- BTC 15m: **+0.19%**

The move therefore was not simply a BTC beta move and was not futures-only.

## Book structure tags
- resistance breakout confirmed on close
- breakout volume expanded materially
- prior resistance cluster around 0.00115~0.00116 was consumed
- higher-timeframe moving averages were constructively aligned
- later retest should be judged as resistance-to-support flip rather than chasing the initial extension

## ICT / SMC tags
- SSL / lower-liquidity sweep and reclaim candidate
- seller absorption during elevated OI
- taker reversal cascade
- BSL / external-liquidity break
- bullish displacement
- close-based BOS rather than wick-only sweep

## Detector proposal

High-value BOME-like early candidate:

```
24H price expansion still modest
AND recent leverage cleanup or neutral 24H OI context
AND 15m RVOL >= 3x
AND spot moves in the same direction
AND taker <= 1 while price holds/rises  // absorption phase
AND OI begins rebuilding without structure loss
THEN
  require multi-window taker reversal above 1
  prefer sequential strengthening toward 1.2+
  require close-based break of nearby resistance / BSL
```

### Quality boosts
- market-relative strength vs BTC
- spot confirmation
- prior SSL sweep / reclaim
- HTF EMA alignment
- sell-dominant retest fails to make a new structural low

### Failure / bull-trap warning
Downgrade to **상승함정 주의** when:
- OI accelerates sharply after breakout
- taker falls back below 1
- price cannot hold the breakout/retest zone
- 1H close returns below the prior resistance cluster
- spot participation disappears while futures leverage keeps rising

## Post-ignition crowding snapshot
Later in the move:
- OI 3H: +14.70%
- OI 6H: +30.96%
- OI 12H: +29.03%
- taker 6H: 0.926
- taker 3H: 0.983
- 15m/5m became overbought

This later snapshot must **not** overwrite the pre-surge DNA. It is a separate post-ignition crowding / bull-trap-risk state.

## Research takeaway
BOME is a strong benchmark for:

```
Liquidity cleanup
→ sell absorption
→ spot-supported abnormal volume
→ OI rebuild
→ taker reversal cascade
→ close-based resistance breakout
→ expansion
```

The important lesson is that taker < 1 is not automatically bearish when price is rising/holding and spot confirms. The scanner should distinguish **sell absorption before ignition** from **late long crowding after ignition**.

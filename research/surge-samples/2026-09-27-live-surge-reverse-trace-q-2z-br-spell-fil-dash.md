# 2026-09-27 Live Surge + Reverse Trace Sample Batch

Source: Binance USDⓈ-M perpetual
Sampled at: 2026-09-27 KST
Purpose: save current surge samples and reverse-traced pre-ignition signatures.
Duplicate policy: previous samples remain untouched; this batch is appended as a dated research set.

## Current surge snapshot

| Symbol | 24H price | t0 KST | t0 1H move | t0 1H RVOL | Pre-t0 OI | DNA |
|---|---:|---|---:|---:|---|---|
| Q | +56.286% | 2026-09-26 15:00 | +17.71% | 13.03x | 6H -2.47%, 12H -4.17%, 24H -12.51% | DELEVERAGING_ABSORPTION_RVOL_IGNITION |
| 2Z | +27.429% | 2026-09-26 14:00 | +6.99% | 6.32x | 6H -2.42%, 12H -1.22%, 24H -4.28% | SELL_CLEANUP_VOLUME_IGNITION |
| BR | +23.384% | 2026-09-25 21:00 | +8.23% | 2.53x | 6H -16.25%, 12H -14.90%, 24H -29.31% | DEEP_OI_CLEAN_REVERSAL |
| SPELL | +20.317% | 2026-09-26 15:00 | +8.81% | 24.70x | 6H +1.00%, 12H +2.91%, 24H +15.58% | OI_BUILD_EXTREME_RVOL_IGNITION |
| FIL | +19.909% | 2026-09-26 23:00 | +6.15% | 4.91x | 6H +2.41%, 12H +10.30%, 24H +16.75% | CLASSIC_OI_LEAD_RVOL_IGNITION |
| DASH | +16.632% | 2026-09-26 19:00 | +4.32% | 3.99x | 6H +3.01%, 12H +5.18%, 24H +1.34% | GRADUAL_OI_BUILD_VOLUME_IGNITION |

## Reverse-trace notes

### Q
- Before t0, 15m RVOL repeatedly expanded while price drifted lower rather than collapsing.
- Example pre-t0 15m RVOL events: 3.44x, 4.19x, 2.42x, 3.16x, 2.04x, 2.75x.
- OI was contracting into the event:
  - 6H -2.47%
  - 12H -4.17%
  - 24H -12.51%
- 6H taker avg ~0.888, 12H taker avg ~0.847.
- Interpretation: not an OI-build setup. This is a deleveraging / absorption path where abnormal sell-side activity is absorbed before a large RVOL displacement.
- Scanner implication: OI decline must not auto-reject if repeated high-RVOL sell pressure fails to break price structure and later reclaims.

### 2Z
- Pre-t0 OI:
  - 6H -2.42%
  - 12H -1.22%
  - 24H -4.28%
- 6H taker avg ~0.790.
- A notable 15m sell candle printed around -1.65% with RVOL 5.28x before the later expansion.
- Interpretation: sell cleanup / liquidity flush followed by volume ignition.
- Scanner implication: detect high-RVOL downside flushes that fail to continue lower and transition into reclaim.

### BR
- Deep deleveraging before ignition:
  - 6H OI -16.25%
  - 12H OI -14.90%
  - 24H OI -29.31%
- 6H taker avg ~1.01, 12H ~1.01.
- 15m sequence contained large two-way volatility and repeated RVOL spikes:
  - +5.70% / 5.71x
  - -10.69% / 11.66x
  - +4.08% / 5.46x
  - -8.45% / 2.48x
  - -7.48% / 2.59x
  - +5.43% / 3.38x
- Interpretation: extreme leverage cleanup and two-way liquidity clearing before recovery.
- Scanner implication: keep a separate DEEP_CLEAN path independent from classic PRE-SURGE OI growth.

### SPELL
- Pre-t0 OI:
  - 6H +1.00%
  - 12H +2.91%
  - 24H +15.58%
- 12H taker avg ~1.14.
- Before the main 1H ignition, 15m price remained nearly flat while RVOL printed 3.0x, 4.42x and 8.93x.
- Main t0: +8.81% on 24.70x 1H RVOL.
- Interpretation: quiet-price + accumulated OI + abnormal volume absorption before displacement.
- Scanner implication: repeated RVOL anomalies with minimal price progress should increase absorption/readiness score.

### FIL
- Pre-t0 OI:
  - 6H +2.41%
  - 12H +10.30%
  - 24H +16.75%
- 12H taker avg ~1.00; taker was not extreme.
- Price before t0 was relatively controlled.
- t0: +6.15% with 4.91x 1H RVOL.
- Interpretation: classic OI-led PRE-SURGE signature.
- Scanner implication: strong OI accumulation + compressed price should rank highly even if taker remains around neutral.

### DASH
- Pre-t0 OI:
  - 6H +3.01%
  - 12H +5.18%
  - 24H +1.34%
- 15m pre-ignition RVOL first expanded to ~2.49x before the 1H displacement.
- t0: +4.32% with 3.99x 1H RVOL.
- Interpretation: gradual OI build followed by lower-TF volume ignition.
- Scanner implication: a moderate OI slope can be sufficient when 15m volume acceleration appears before the 1H breakout.

## New scanner routes

### Route A — CLASSIC_OI_BUILD
- price expansion still limited
- 6H OI > +2%
- 12H OI > +5%
- preferably 24H OI > +10%
- 15m/1H RVOL expansion confirms ignition
- taker may remain near 1.0
- samples: FIL, SPELL

### Route B — DELEVERAGING_ABSORPTION
- OI flat or declining
- repeated high-RVOL sell candles
- price fails to continue lower / reclaims
- later positive displacement with RVOL expansion
- samples: Q, 2Z

### Route C — DEEP_CLEAN_REVERSAL
- 12–24H OI strongly negative
- two-way liquidity clearing / violent volatility
- structure stabilizes after cleanup
- reclaim + volume expansion becomes the trigger
- sample: BR

### Route D — GRADUAL_BUILD
- 6–12H OI positive but not extreme
- lower-TF RVOL rises before 1H breakout
- sample: DASH

## Key deduction

The scanner must not rely on only one route.

- FIL/SPELL type = OI_BUILD before ignition.
- Q/2Z/BR type = OI_CLEAN or deleveraging before ignition.
- DASH type = moderate OI slope + lower-TF volume lead.

A negative OI reading is not automatically bearish; in the right structural context it can be the cleanup phase preceding a squeeze/reversal.

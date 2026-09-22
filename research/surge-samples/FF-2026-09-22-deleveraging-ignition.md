# FF Deleveraging Ignition Sample — 2026-09-22

## Summary

FF is recorded as a distinct PRE-SURGE DNA type from the FIL-style OI Lead pattern.

**Pattern name:** `Deleveraging Ignition`

Core sequence:

```
Price compression
→ Volume drying
→ OI falling
→ Taker < 1
→ Taker reversal > 1
→ 1.10~1.20+ taker cascade
→ LTF liquidity/BOS break
→ Volume expansion
→ OI re-expansion
→ Surge
```

This pattern is useful because FF's large move did **not** begin with persistent OI accumulation. OI remained flat/falling into ignition and expanded only after price/taker ignition.

## Observed surge window

Binance USDⓈ-M FFUSDT 1H data.

- Surge start reference: 2026-09-19 21:00 UTC
- Surge end reference: 2026-09-20 21:00 UTC
- Start close: 0.12529
- End close: 0.18182
- Approx. close-to-close move: +45.1%
- High during sampled surge window: 0.18418
- Low during sampled surge window: 0.12481

## Harvested raw checkpoints

These checkpoints preserve the sampled path rather than only the aggregated windows.

| Relative point | UTC timestamp | Close | 1H volume | OI value | Taker B/S |
|---|---|---:|---:|---:|---:|
| T-72H | 2026-09-16 21:00 | 0.13590 | 2.652M | 48.149M | 0.7132 |
| T-48H | 2026-09-17 21:00 | 0.13070 | 2.174M | 47.428M | 1.0468 |
| T-24H | 2026-09-18 21:00 | 0.12612 | 2.419M | 44.661M | 1.1787 |
| T-12H | 2026-09-19 09:00 | 0.12697 | 2.803M | 45.377M | 0.7348 |
| T-6H | 2026-09-19 15:00 | 0.12492 | 3.532M | 45.197M | 0.6143 |
| T-3H | 2026-09-19 18:00 | 0.12484 | 0.966M | 44.650M | 1.1781 |
| T-1H | 2026-09-19 20:00 | 0.12498 | 1.138M | 44.494M | 1.2103 |
| T0 | 2026-09-19 21:00 | 0.12529 | 1.603M | 44.495M | 1.4682 |
| T+6H | 2026-09-20 03:00 | 0.13013 | 2.523M | 44.863M | 1.5277 |
| T+12H | 2026-09-20 09:00 | 0.12646 | 1.694M | 45.248M | 0.7634 |
| T+24H | 2026-09-20 21:00 | 0.18182 | 71.145M | 57.215M | 1.1417 |

### Harvest notes

- T-72H → T-24H showed price weakness with OI cleanup rather than accumulation.
- The most important micro-sequence is **T-6H → T-3H → T-1H → T0**.
- At T-6H taker was still weak (0.6143), then flipped to **1.1781 → 1.2103 → 1.4682** while price remained pinned around 0.1248–0.1253.
- OI stayed near 44.5M into T0, so OI was not the early trigger.
- T+24H volume exploded to about **71.1M** and OI expanded to about **57.2M**, confirming post-ignition participation.

## Reverse-engineered pre-surge sequence

| Window | Price | OI | Avg taker B/S | Avg volume | Interpretation |
|---|---:|---:|---:|---:|---|
| T-72H → T-48H | -3.96% | -1.20% | 0.918 | 4.63M | Weakness / position cleanup |
| T-48H → T-24H | -4.47% | -5.82% | 0.816 | 3.72M | Strong deleveraging |
| T-24H → T0 | -0.90% | -0.37% | 0.977 | 2.12M | Price/OI compression |
| T-6H → T0 | +0.05% | -1.55% | 1.085 | 1.71M | **Taker flips before OI** |
| Surge T0 → T+24H | +31.65% | +17.55% | 1.162 | 6.90M | Price ignition + OI chase |

## Last-hours ignition signature

Approximate taker progression before ignition:

- ~T-6H: weak / sub-1
- ~T-3H: 1.178
- ~T-1H: 1.210
- T0 reference: 1.468

Important interpretation:

- OI did **not** lead.
- Volume dried before the move.
- Price stopped making meaningful new lows near 0.1246–0.1250.
- Aggressive buy execution reversed first.
- OI expanded materially only after the move was underway.

## Comparison with FIL OI Lead pattern

### FIL-style OI Lead

```
OI Lead
→ Taker Cascade
→ Liquidity Break
→ Expansion
```

Use when derivatives positioning expands before price.

### FF-style Deleveraging Ignition

```
Deleveraging
→ Quiet price compression
→ Volume drying
→ Taker reversal
→ Liquidity break
→ OI chase
```

Use when OI does not accumulate early and would otherwise cause the scanner to wrongly discard the candidate.

## Detector proposal

### Stage A — DELEVERAGING_BASE

Candidate when:

- 24H–72H price is flat/down but no longer accelerating lower
- OI is falling or flat
- volume is contracting
- recent local low is repeatedly defended
- no requirement for positive OI lead

### Stage B — TAKER_REVERSAL

Promote when:

- taker B/S crosses above 1.0
- preferably rises sequentially across recent windows
- stronger evidence at 1.10+
- high-priority evidence at 1.20+ if sustained
- price remains near compression range rather than already extended

### Stage C — IGNITION_CONFIRM

Confirm only when:

- 5m/15m or 1H liquidity/BOS break occurs on close
- RVOL expands from the dry baseline
- taker remains >1
- OI stops falling and begins re-expanding

### Failure / invalidation

Downgrade if:

- taker falls back below 1 without a structure break
- price loses the defended compression low
- volume remains dead and taker does not recover
- OI rises while price breaks down and taker remains sell-dominant

## Current FF comparison — 2026-09-22 snapshot

Current FF reproduced some **early** features of the historic setup but had not reproduced ignition.

Observed:

- 24H price: about -0.09%
- 48H price: about +1.19%
- 72H price: about +1.33%
- OI 24H: -3.63%
- OI 48H: -5.25%
- OI 72H: -3.54%
- taker 6H: 0.796
- taker 24H: 0.791
- recent 12H volume vs prior 12H: ~0.70x
- mark price: ~0.12806
- general account L/S: 0.5437
- top-trader position L/S: 3.5112
- funding: ~0.000292%

Current classification:

`RESET / DELEVERAGING — precondition similarity only, no taker reversal yet`

Key monitoring levels from the current snapshot:

- 0.12897 — LTF liquidity
- 0.13069 — 1H structure/BOS
- 0.12639 — 1H local defense
- 0.12461 — 4H defense
- 0.12071 — deeper 12H structural warning

## Scanner implementation note

Do **not** reject every candidate with falling OI.

Add a parallel PRE-SURGE route:

```
OI_LEAD route
OR
DELEVERAGING_IGNITION route
```

The second route should explicitly score:

1. volume contraction,
2. local-low stabilization,
3. OI cleanup,
4. taker reversal velocity,
5. multi-window taker propagation,
6. close-based liquidity break,
7. post-break OI re-expansion.

Store both successful and failed samples to avoid survivorship bias.

## Outcome label

`HISTORICAL_SUCCESS_SAMPLE`

The present 2026-09-22 FF setup remains:

`PENDING / NO CURRENT IGNITION CONFIRMATION`

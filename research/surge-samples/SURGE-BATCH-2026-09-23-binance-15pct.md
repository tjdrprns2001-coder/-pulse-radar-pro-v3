# Current Surge Success Batch — Binance USDT Futures — 2026-09-23

## Snapshot

- sampling date: 2026-09-23
- market: Binance USDⓈ-M Futures
- selection rule: current 24H price change >= +15%
- population scanned: 728 USDT futures symbols
- success candidates captured: 20
- purpose: post-event success-sample extraction / route discovery
- NOT a predictive validation cohort
- TAKE has its own deep-dive file:
  - `TAKE-2026-09-23-delayed-volume-probe-ignition.md`

## Anti-bias warning

Every symbol in this file was selected **after it was already in the current surge group**.

Therefore:

- these observations may be used to discover candidate DNA;
- they must not be used by themselves to claim predictive power;
- any scanner rule derived here requires failed/control samples selected without future outcome knowledge;
- micro-flow / probe-memory conditions are candidate features, not validated entry rules.

---

## Current +15% surge universe

| Symbol | 24H change | 1H T0 RVOL | OI T-24H→T0 | OI T0→+3H | Initial route |
|---|---:|---:|---:|---:|---|
| TAKE | +235.13% | ~30.06x | ~flat | strong post-ignition expansion | FLOW_FIRST → OI_LATE |
| MET | +35.10% | 7.22x | +30.33% | +5.81% | OI_LEAD |
| BCH | +30.94% | 21.12x | -5.37% | +56.22% | OI_LATE |
| 4 | +28.00% | 3.18x | -1.16% | +2.58% | MIXED |
| NIL | +26.53% | 9.52x | -2.07% | +24.62% | OI_LATE |
| ZRO | +26.37% | 13.46x | +0.11% | +6.13% | RVOL_IGNITION |
| ZEST | +25.39% | 6.65x | +0.43% | +2.02% | RVOL_IGNITION |
| ALLO | +25.35% | 7.67x | -2.53% | +1.97% | RVOL_IGNITION |
| CHR | +23.77% | 65.50x | +35.67% | +35.74% | OI_LEAD |
| SUPER | +21.14% | 7.50x | +7.22% | +14.47% | RVOL → OI_CHASE |
| US | +20.52% | 4.56x | +0.71% | -0.82% | MIXED |
| SAGA | +19.41% | 9.83x | -0.29% | +5.90% | RVOL_IGNITION |
| CYPH | +19.21% | 26.22x | +4.13% | +24.78% | FLOW_FIRST |
| TIA | +19.03% | 6.17x | -3.53% | +4.03% | RVOL_IGNITION |
| FIGHT | +18.97% | 15.78x | +2.83% | +2.01% | RVOL_IGNITION |
| ARIA | +17.70% | 16.13x | +0.97% | +3.15% | RVOL_IGNITION |
| SENT | +16.85% | 8.25x | -0.58% | +3.48% | RVOL_IGNITION |
| 1000BONK | +16.74% | 3.11x | +2.83% | +6.39% | MIXED |
| 0G | +16.56% | 3.15x | -0.81% | +1.81% | MIXED |
| PENGU | +15.22% | 3.68x | -1.58% | -2.04% | MIXED |

## T0 identification

For the first-pass bulk extraction, T0 was chosen mechanically from recent 1H bars using a combined expansion score:

- positive candle body;
- 1H RVOL;
- close above the prior 20-bar high.

This is a research approximation and is not guaranteed to equal the earliest tradeable trigger.

Where lower-timeframe reconstruction was available, the actual raid / close-BOS time is recorded separately.

---

# Lower-timeframe probe-memory study

## Main repeated observation

All 20 success samples had at least one 15m RVOL >= 3x abnormal-volume event inside the sampled 24H pre-T0 window.

This does **not** mean RVOL>=3 is predictive because the cohort contains only known successes.

The useful research question is whether the following sequence separates successes from failed controls:

```
ABNORMAL_VOLUME_PROBE
→ volume cooling / recompression
→ structural survival
→ flow or volume re-acceleration
→ close-based BOS
→ expansion
```

## Probe → T0 examples

| Symbol | Probe→T0 | Post-probe avg volume / probe | Pre-T0 micro buy pulse | Lower-TF BOS note |
|---|---:|---:|---|---|
| TAKE | ~15H | ~6.9% | very strong | old probe-high raid → close BOS |
| BCH | 21.25H | 10.6% | weak/moderate | 5m BOS with RVOL 28.84x |
| NIL | 11.75H | 11.5% | very strong | 17:20 UTC raid + close BOS |
| CYPH | 16.75H | 28.1% | extreme | raid then next 5m close BOS |
| ALLO | 17H | 7.5% | moderate | 5m BOS RVOL 39.55x |
| FIGHT | 6.5H | 9.0% | moderate | BOS RVOL 21.79x |
| ZEST | 7.25H | 12.1% | weak | probe-memory / delayed break |
| TIA | 13.25H | 14.4% | weak | BOS RVOL 8.20x |
| SENT | 13H | 23.0% | weak | BOS at 19:00 UTC |
| BONK | 17.25H | 27.5% | weak | raid 06:20 → close 06:30 |
| 4 | 16H | 31.2% | weak | BOS RVOL 7.96x |
| US | 16.25H | 31.3% | weak | BOS despite low local RVOL |
| ARIA | 7.5H | 40.0% | strong | BOS 08:00 UTC |
| PENGU | 6.5H | 47.1% | weak | BOS 15:00 UTC |
| ZRO | 3.5H | 54.2% | moderate | raid + close BOS 16:10 UTC |
| MET | 10H | 116.7% | weak | continuous OI/volume build |
| CHR | 2H | 104.4% | some 1m pulses | OI/volume cascade |
| SUPER | 5.75H | 140.5% | weak | continuous expansion |
| SAGA | 0.25H | N/A | weak | near-immediate ignition |
| 0G | 3.25H | 27.1% | strong | raid then 5m close BOS |

## Candidate observation

15/20 samples showed substantial post-probe cooling, defined here as average post-probe volume <= 50% of the probe candle volume.

This motivates a candidate feature:

`VOLUME_PROBE_MEMORY + POST_PROBE_VOLUME_DRY`

but control samples are required before giving it predictive weight.

---

# Deep-dive samples

## CHR — OI Lead Cascade

1H:
- T0: 2026-09-22 16:00 UTC
- T0 body: +20.99%
- T0 RVOL: 65.50x
- OI T-24H→T0: +35.67%
- OI T-6H→T0: +39.22%
- OI T0→+3H: +35.74%

15m:
- strong abnormal event around 14:00 UTC
- RVOL ~40.0x
- no meaningful post-probe volume drying
- volume remained near/above probe-scale activity

1m, final hour:
- buy-share >=70%: 7 bars
- buy-share >=90%: 1 bar
- max buy share: ~90.1%
- max 1m RVOL: ~12.85x

Interpretation:

```
OI BUILD
→ sustained volume cascade
→ breakout
→ continued OI expansion
```

CHR is a fundamentally different family from TAKE/BCH/NIL.

Suggested tags:
- `OI_LEAD_CASCADE`
- `CONTINUOUS_EXPANSION`
- `DERIVATIVES_LEAD`

## BCH — Deep Recompression → OI Chase

1H:
- T0: 2026-09-22 12:00 UTC
- T0 RVOL: 21.12x
- OI T-24H→T0: -5.37%
- OI T0→+3H: +56.22%

15m:
- probe: 2026-09-21 14:45 UTC
- probe RVOL: ~5.64x
- elapsed probe→T0: ~21.25H
- post-probe average volume: ~10.6% of probe volume
- price survived the reset and later reclaimed structure

5m:
- raid + close BOS around 12:30 UTC
- BOS RVOL: ~28.84x
- BOS taker-buy share: ~57.8%

1m final hour:
- buy-share >=70%: 3 bars
- >=90%: 0
- max buy share: ~80.0%

Interpretation:

```
PROBE_MEMORY
→ DEEP_RECOMPRESSION
→ VOLUME_DRY
→ BOS / RVOL EXPANSION
→ MASSIVE OI_CHASE
```

BCH shows that an extreme micro buy-pulse cluster is not required.

Suggested tags:
- `DEEP_RECOMPRESSION_AFTER_PROBE`
- `VOLUME_DRY`
- `OI_LATE`
- `OI_CHASE_CONFIRM`

## NIL — Probe → Micro Buy Pulse → BOS → OI Chase

1H:
- T0: 2026-09-20 17:00 UTC
- T0 RVOL: 9.52x
- OI T-24H→T0: -2.07%
- OI T0→+3H: +24.62%

15m:
- prior probe: 2026-09-20 05:15 UTC
- probe RVOL: ~7.23x
- elapsed probe→T0: ~11.75H
- post-probe average volume: ~11.5% of probe volume

1m final hour:
- buy-share >=70%: 20 bars
- >=90%: 3 bars
- >=95%: 2 bars
- max buy share: ~99.9%

5m ignition:
- prior reference high: 0.05168
- 17:20 UTC high: 0.05220
- close: 0.05209
- RVOL: ~5.53x
- taker-buy share: ~65.3%
- raid and close BOS on the same 5m bar

Interpretation:

```
PROBE_MEMORY
→ VOLUME_DRY
→ MICRO_BUY_PULSE_CLUSTER
→ CLOSE_BOS
→ OI_CHASE
```

NIL is one of the closest relatives to TAKE.

## CYPH — Sell-dominant Probe → Price Resilience → Flow Flip

1H:
- T0: 2026-09-21 00:00 UTC
- T0 RVOL: 26.22x
- OI T-24H→T0: +4.13%
- OI T0→+3H: +24.78%
- pre-6H taker pulse reached ~3.38

15m prior probe:
- 2026-09-20 07:15 UTC
- RVOL: ~11.84x
- taker-buy share: only ~7.15%
- price subsequently did not structurally collapse

1m final hour:
- buy-share >=70%: 18 bars
- >=90%: 17 bars
- >=95%: 16 bars
- many prints at 100%
- 23:41 UTC: RVOL ~84.32x with buy-share ~98.1%

5m ignition:
- reference high: ~3.986
- 00:00 UTC raid candle: RVOL ~112.35x
- raid candle did not close above reference high
- 00:05 UTC close BOS:
  - close: 4.104
  - RVOL: ~6.07x
  - buy-share: ~57.4%

Interpretation:

```
SELL_DOMINANT_ABNORMAL_PROBE
→ PRICE_RESILIENCE
→ EXTREME_MICRO_FLOW_FLIP
→ RAID
→ CLOSE_BOS
→ OI_CHASE
```

Do not label the initial event as confirmed absorption without more order-book / spot evidence.

Suggested tags:
- `SELL_DOMINANT_PROBE`
- `PRICE_RESILIENCE`
- `FLOW_FLIP`
- `MICRO_BUY_PULSE_CLUSTER`
- `OI_LATE`

## ZRO — Short-delay Probe → Flow Build → BOS

1H:
- T0: 2026-09-22 16:00 UTC
- T0 RVOL: 13.46x
- OI T-24H→T0: +0.11%
- OI T0→+3H: +6.13%

15m:
- probe: 12:30 UTC
- probe RVOL: ~7.21x
- probe→T0: ~3.5H
- post-probe volume: ~54.2% of probe

1m final hour:
- buy-share >=70%: 11 bars
- >=90%: 0
- max buy share: ~86.7%
- 15:25 UTC RVOL ~5.43x / buy-share ~76.1%

5m:
- reference high: ~1.281
- 16:10 UTC:
  - high: 1.2909
  - close: 1.2871
  - RVOL: ~2.46x
  - buy-share: ~65.3%
- raid + close BOS on same bar

Interpretation:

```
SHORT_DELAY_PROBE_MEMORY
→ FLOW_BUILD
→ CLOSE_BOS
→ RVOL EXPANSION
```

---

# Cross-sample candidate DNA

## Route A — OI Lead Cascade

Examples:
- CHR
- MET

Candidate sequence:

```
OI_BUILD
→ persistent volume expansion
→ breakout
→ OI continuation
```

OI is genuinely useful as a leading feature in this family.

## Route B — Delayed Probe → Volume Dry → BOS → OI Chase

Examples:
- TAKE
- BCH
- NIL
- CYPH

Candidate sequence:

```
ABNORMAL_VOLUME_PROBE
→ delayed recompression
→ volume dry
→ renewed flow / RVOL
→ remembered-high raid
→ close BOS
→ displacement
→ OI_CHASE
```

OI should not be required before ignition.

## Route C — Delayed Probe → Volume Dry → RVOL/BOS

Examples:
- ALLO
- 4
- ZEST
- TIA
- FIGHT
- SENT
- BONK
- US
- PENGU

The precondition appears more related to remembered abnormal turnover + structural survival than to OI.

## Route D — Micro-flow Assisted

Examples with notable lower-TF buy-pressure pulses:
- TAKE
- NIL
- CYPH
- ZRO
- ARIA
- 0G

Important:

`MICRO_BUY_PULSE_CLUSTER` is a bonus feature, not a universal requirement.

Successful controls such as BCH, ZEST, TIA, BONK and PENGU did not require an extreme cluster.

## Route E — Immediate / Continuous Expansion

Examples:
- SAGA
- SUPER

These do not fit a long delayed-probe memory state well and should remain a separate route.

---

# Candidate rule refinements

## Do not require OI lead globally

Only a small subset of this success batch showed strong pre-ignition OI build.

Therefore:

```
OI lead = route-specific positive evidence
NOT a universal PRE-SURGE requirement
```

## Remember abnormal volume

Potential state:

`VOLUME_PROBE_MEMORY`

Store:

- probe timestamp
- probe TF
- probe high / low / close
- probe RVOL
- probe taker-buy share
- elapsed time
- post-probe volume ratio
- structural invalidation level

## Volume dry can be positive information

Candidate state:

`POST_PROBE_VOLUME_DRY`

The feature is only meaningful if:

- price structure survives;
- probe base / structural invalidation is not lost;
- later flow / volume re-accelerates.

## Micro buy pulse is optional

Use as a weighted bonus:

- repeated 1m / 5m taker-buy >=70%
- stronger bonus >=90%
- pulse cluster before full displacement
- do not reject valid candidates for lacking it.

## BOS should be close-based

Differentiate:

- `PROBE_HIGH_RAID`: wick trades through remembered high
- `CLOSE_BOS_CONFIRM`: close finishes above remembered high

CYPH is a useful example where raid and BOS occurred on different bars.

## Do not require high RVOL on the BOS bar itself

Several successful samples showed a relatively modest BOS-bar RVOL after earlier flow/volume acceleration.

Examples included:
- ZEST
- US
- 0G
- BONK

Therefore evaluate:

`rolling pre-BOS RVOL / flow acceleration`

rather than only the single BOS candle's RVOL.

---

# Required next validation

This batch is success-only and cannot validate predictive value.

The next control cohort must be selected mechanically from the same historical universe.

Target failed pattern:

```
ABNORMAL_VOLUME_PROBE
→ recompression
→ volume dry
→ structure survives for some period
→ BUT no valid close-BOS / no +8% or +12% follow-through
```

Compare success vs failure on:

- probe RVOL
- probe buy share
- probe age
- post-probe volume ratio
- drawdown after probe
- distance to remembered high
- OI change before ignition
- taker pulses
- pulse count / intensity
- pre-BOS rolling RVOL
- raid vs close-BOS timing
- MFE / MAE after BOS
- OI chase after BOS

Only after this control study should these features receive scanner weights.

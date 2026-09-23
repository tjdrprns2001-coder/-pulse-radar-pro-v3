# TAKE Surge Sample — Delayed Volume-Probe Ignition

## Classification

- symbol: `TAKEUSDT`
- venue sampled: Binance USDⓈ-M Futures
- sample type: historical success sample
- primary route: `DELAYED_VOLUME_PROBE_IGNITION`
- secondary route: `FLOW_FIRST_OI_LATE`
- ignition behavior: `MICRO_TAKER_PULSE → RVOL_IGNITION → OI_CHASE`
- outcome label: `HISTORICAL_SUCCESS_SAMPLE`
- spot/basis status: Binance Spot `TAKEUSDT` returned invalid symbol at sampling time, so Binance spot-volume/basis confirmation is unavailable and must not be inferred.

## Observed move

Binance 24H futures ticker at sampling time:

- open: 0.0587900
- high: 0.1888800
- low: 0.0579600
- last: 0.1696300
- 24H change: +188.535%
- quote volume: ~131.9M USDT

Largest sampled 24H close-to-close window:

- start: 2026-09-22 08:00 UTC
- start close: 0.05883
- end: 2026-09-23 08:00 UTC
- end close: 0.19491
- return: +231.31%
- sampled 24H high: 0.19987
- sampled 24H low: 0.05796

This 24H window is an outcome window, not the ignition T0.

## Ignition T0

The first 1H candle meeting the research definition of a genuine expansion candle
(body >= 15% and RVOL >= 5x) occurred at:

- T0: 2026-09-23 05:00 UTC
- open: 0.06101
- close: 0.08137
- high: 0.08299
- low: 0.06066
- body change: +33.37%
- 1H RVOL: 30.06x

The important research point is that TAKE produced useful precursors before this T0.

## Reverse checkpoints around ignition T0

| Point | UTC | Close | 1H RVOL | OI | Taker B/S |
|---|---|---:|---:|---:|---:|
| T-48H | 2026-09-21 05:00 | 0.05904 | 0.57x | 66,789,968 | 1.4218 |
| T-24H | 2026-09-22 05:00 | 0.05854 | 0.37x | 66,811,093 | 2.8894 |
| T-12H | 2026-09-22 17:00 | 0.05988 | 0.56x | 66,850,653 | 0.9193 |
| T-6H | 2026-09-22 23:00 | 0.06089 | 0.33x | 67,270,353 | 1.1237 |
| T-3H | 2026-09-23 02:00 | 0.06042 | 0.31x | 67,248,335 | 0.9351 |
| T-1H | 2026-09-23 04:00 | 0.06100 | 0.49x | 67,311,814 | 1.6312 |
| T0 | 2026-09-23 05:00 | 0.08137 | 30.06x | 67,410,744 | 0.9294 |
| T+1H | 2026-09-23 06:00 | 0.10201 | 74.52x | 75,194,842 | 0.9619 |
| T+2H | 2026-09-23 07:00 | 0.16765 | 35.91x | 86,621,245 | 1.1072 |
| T+3H | 2026-09-23 08:00 | ~0.196 | 10.94x | 106,848,436 | 1.1072 |

### OI sequence

The key differentiator versus FIL/KERNEL-style OI Lead:

```
T-24H OI ~66.81M
→ T-1H OI ~67.31M
→ T0 OI ~67.41M
```

OI was almost flat into the ignition.

Only after price expansion:

```
T0 67.41M
→ T+1H 75.19M  (+11.55%)
→ T+2H 86.62M  (+15.20% from prior hour)
→ T+3H 106.85M (+23.35% from prior hour)
```

Therefore TAKE must **not** be classified as a normal OI-lead setup.

## Delayed volume-probe behavior

### Earlier 15m volume probe

2026-09-22 14:00 UTC:

- open: 0.05994
- close: 0.06364
- high: 0.06438
- 15m RVOL: 21.72x
- taker-buy share: 61.53%

This large probe did not immediately produce the final surge.

Price subsequently recompressed near 0.06.

That delay is the central feature of this sample:

```
Volume Probe
→ no immediate expansion
→ price holds
→ recompression
→ micro-flow pulses
→ renewed RVOL ignition
→ major expansion
```

### Other pre-ignition probes

- 2026-09-22 01:15 UTC: 15m RVOL 4.59x
- 2026-09-22 12:30 UTC: 15m RVOL 3.78x
- 2026-09-22 14:00 UTC: 15m RVOL 21.72x

A scanner must retain memory of a significant probe instead of discarding the setup when immediate continuation fails.

## 5m micro-flow immediately before ignition

Selected 5m observations:

| UTC | Close | RVOL | Taker-buy share |
|---|---:|---:|---:|
| 2026-09-23 04:00 | 0.06106 | 6.96x | 76.0% |
| 2026-09-23 04:50 | 0.06112 | 0.73x | 94.4% |
| 2026-09-23 05:35 | 0.06087 | 1.67x | 68.8% |
| 2026-09-23 05:40 | 0.06089 | 2.58x | 94.0% |
| 2026-09-23 05:50 | 0.06372 | 48.89x | 63.45% |
| 2026-09-23 05:55 | 0.08137 | 271.53x | 47.06% |

Interpretation:

- extreme buy-share pulses appeared before the price expansion;
- these pulses did not always coincide with high RVOL;
- final ignition was characterized by a massive volume explosion;
- buy-share at the largest expansion candle itself does not need to remain extreme because two-way turnover/short covering/chasing can dominate once expansion begins.

This supports tracking **micro taker pulses before the RVOL explosion**, not only the ignition candle's final buy share.

## Taker behavior

Notable 1H taker B/S readings:

- T-24H: 2.8894
- T-6H: 1.1237
- T-1H: 1.6312
- T0: 0.9294
- T+2H: 1.1072

Important:

The useful taker signal appeared **before** T0.

Do not require T0's aggregated 1H taker ratio itself to be >1 if lower-timeframe flow and RVOL already show ignition.

## Long / short positioning

Global account L/S:

- T-24H: 3.6620
- T-6H: 3.3649
- T-3H: 3.4228
- T-1H: 3.3802
- T0: 3.3384
- T+1H: 2.2733
- T+2H: 1.2957
- T+3H: 0.6852

Top trader position L/S:

- T-24H: 1.9382
- T-6H: 1.9243
- T-3H: 1.9326
- T-1H: 1.9288
- T0: 1.9298
- T+1H: 1.8866
- T+2H: 1.8645
- T+3H: 1.7271

Interpretation:

- public/global account positioning was heavily long-biased before ignition;
- after expansion, the global account ratio collapsed much faster than the top-trader position ratio;
- this documents a rapid change in participant positioning during the move;
- account ratios alone do not identify liquidation direction and must not be over-interpreted.

## Funding

Selected funding observations:

- 2026-09-21 08:00 UTC: +0.005%
- 2026-09-22 00:00 UTC: +0.012189%
- 2026-09-22 04:00 UTC: +0.005%
- 2026-09-22 08:00 UTC: +0.005%
- 2026-09-22 16:00 UTC: +0.010439%
- 2026-09-23 00:00 UTC: +0.059718%
- 2026-09-23 04:00 UTC: +0.022589%

Funding was not completely neutral immediately before the final move.

Therefore TAKE is **not** a pristine hidden accumulation sample.

It is better described as:

- earlier abnormal flow becomes visible,
- the market recompresses instead of failing,
- final micro-flow and RVOL ignition arrives later.

## Pattern definition

### Delayed Volume-Probe Ignition

```
Quiet / compressed price
→ abnormal volume probe
→ no immediate sustained breakout
→ probe zone remains defended
→ volume cools again
→ micro taker-buy pulses appear
→ RVOL re-accelerates
→ displacement / breakout
→ OI expands after price
```

### FLOW-FIRST / OI-LATE

Required distinction:

```
price / micro-flow / volume move first
OI does NOT materially lead
OI expands only after price ignition
```

This is structurally different from:

```
OI_LEAD:
OI acceleration → taker propagation → liquidity break → price expansion
```

## Scanner rule proposal

Create a separate route so flat OI does not automatically reject the candidate.

### Stage A — VOLUME_PROBE_MEMORY

Candidate if:

- price still within a broad ±5–8% compression / consolidation zone;
- one or more 5m/15m volume probes occurred within the previous 6–24H;
- strong probe threshold: RVOL >= 5x;
- very strong probe: RVOL >= 10x;
- price does not lose the probe-base / local structural low after the event.

Persist this state for a limited memory window rather than immediately clearing it.

### Stage B — RECOMPRESSION

After the probe:

- RVOL returns toward/below baseline;
- price remains relatively stable;
- OI may remain flat;
- absence of OI lead must not invalidate this route.

### Stage C — MICRO_FLOW_PULSE

Priority increase if:

- 5m taker-buy share >= 70%;
- repeated pulses are stronger than one isolated print;
- >= 85–90% buy-share pulse is high priority;
- pulse may occur on modest volume before final ignition.

### Stage D — RVOL_REIGNITION

Trigger candidate when:

- 5m RVOL re-expands >= 2–3x;
- then RVOL accelerates sharply;
- close-based local resistance break / displacement occurs.

TAKE final sequence:

- 5m buy-share 94.0% with RVOL 2.58x
- ~10m later 5m RVOL 48.9x
- next bar RVOL 271.5x

### Stage E — OI_CHASE_CONFIRM

Post-ignition confirmation, not a precondition:

- OI begins material expansion only after displacement;
- TAKE showed +11.5%, then +15.2%, then +23.4% sequential hourly OI expansion.

Use this as confirmation that leverage is chasing the already-active move.

## Suggested scanner tags

- `VOLUME_PROBE_MEMORY`
- `RECOMPRESSION_AFTER_PROBE`
- `MICRO_TAKER_PULSE`
- `FLOW_FIRST`
- `OI_LATE`
- `RVOL_REIGNITION`
- `OI_CHASE_CONFIRM`
- `DELAYED_VOLUME_PROBE_IGNITION`

## Failure / invalidation

Do not keep the setup alive indefinitely.

Invalidate or heavily downgrade if:

- probe-base / structural low breaks decisively;
- repeated volume probes are followed by lower lows;
- micro taker pulses disappear while sell flow dominates;
- RVOL re-expansion occurs but price cannot reclaim local resistance;
- OI expands aggressively while price is breaking downward;
- funding becomes extremely crowded before any valid breakout and price fails to progress.

## Research takeaway

TAKE adds an important missing route:

```
Volume Probe
→ Recompression
→ Micro Taker Pulse
→ RVOL Reignition
→ Price Expansion
→ OI Chase
```

The primary lesson is:

> **Flat pre-ignition OI is not a reason to reject a candidate when a prior volume probe is still structurally valid and lower-timeframe flow begins to re-accelerate.**

This sample should be kept separately from OI Lead examples and used to test whether a probe-memory feature reduces false negatives without excessively increasing false positives.

## Data caveats

- Binance Futures data was used for price/OI/taker/funding/L/S.
- Binance Spot `TAKEUSDT` was unavailable at sampling time, so spot-volume leadership and spot/futures basis are N/A.
- T0 in this document is the final 1H ignition candle, while the earlier 24H outcome window begins before T0.
- This is a historical successful example and must be paired with failed volume-probe/recompression controls during validation to avoid survivorship bias.


---

# Deep-Dive Refinement — confirmed-bar / 1m microstructure review

## Why this refinement was added

The original TAKE sample correctly identified a delayed volume-probe route, but deeper reconstruction changed one important interpretation:

**TAKE should not be described as a clean 15-hour hidden accumulation / reaccumulation sequence.**

During the interval after the large probe and before final ignition:

- price retraced;
- OBV fell;
- taker-derived cumulative delta fell;
- aggregate flow was not continuously buy-dominant.

The stronger interpretation is:

```
Probe Memory
→ Deep Recompression
→ Volume Dry
→ LTF Reset
→ Micro Buy-Pulse Cluster
→ Old Probe High Raid
→ Close BOS
→ Displacement
→ OI Chase
```

Therefore the scanner tag `REACCUMULATION` should **not** be automatically applied to TAKE-like setups unless independent OBV/CVD/spot evidence supports it.

## Confirmed-bar PRE-T0 state

To avoid lookahead, the following PRE-T0 snapshot uses only bars fully closed before the final 1H expansion candle beginning at 2026-09-23 05:00 UTC.

### 1D

- last confirmed close: 0.06089
- RSI: ~58.46
- MACD histogram: slightly negative
- EMA20: 0.05767
- EMA50: 0.05240
- EMA112: 0.04230
- EMA224: 0.06239
- RVOL: ~0.85x
- taker-buy share: ~47.5%

Interpretation:

- medium-term EMA structure had recovered;
- price remained just below EMA224;
- daily momentum was not overbought;
- long-term resistance was still present.

### 4H

- close: 0.06108
- RSI: ~68.11
- MACD histogram: positive
- EMA20 > EMA50 ≈ EMA112 > EMA224
- RVOL: ~0.77x

Interpretation:

```
Structure Ready + Volume Dry
```

### 1H

- close: 0.06100
- RSI: ~61.54
- MACD histogram: positive
- EMA20 > EMA50 > EMA112 > EMA224
- RVOL: ~0.49x
- taker-buy share: ~62.0%

This is one of the highest-value PRE-T0 observations:

**trend structure was already constructive while hourly turnover had contracted to roughly half of its recent baseline.**

### 15m

- close: 0.06100
- RSI: ~60.09
- MACD histogram: slightly positive
- EMA20 > EMA50 > EMA112 > EMA224
- RVOL: ~0.48x

### 5m

- close: 0.06100
- RSI: ~61.06
- MACD histogram: slightly negative
- EMA stack remained constructive
- RVOL: ~0.73x
- short-term OBV slope negative

Interpretation:

- HTF structure intact;
- LTF momentum reset;
- no confirmed expansion yet.

## The important historical probe level

The major 15m probe occurred at:

**2026-09-22 14:00 UTC**

- open: 0.05994
- high: **0.06438**
- low: 0.05982
- close: 0.06364
- volume: 3,217,825
- RVOL: ~21.72x
- taker-buy share: ~61.53%

The probe high **0.06438** became a critical memory level.

## Deep recompression after the probe

From the probe until final ignition:

- elapsed time: ~15H
- 15m bars between events: 59
- lowest price: 0.05864
- pre-ignition close: 0.06100
- change from probe close: ~-4.15%
- max drawdown from probe close: ~-7.86%
- distance from pre-ignition price to old probe high: ~+5.54%

This was **not** a shallow flag immediately beneath resistance.

It was a materially deeper reset.

Recommended tag:

`DEEP_RECOMPRESSION_AFTER_PROBE`

rather than automatically calling it upper compression.

## Volume drying after the probe

Average volume after the large probe collapsed sharply.

Relative to the probe candle volume:

- average volume during the following recompression: ~6.9%
- average volume during the final ~4H before ignition: ~3.1%

Sequence:

```
RVOL ~21.7x Probe
→ price retracement
→ no structural collapse
→ turnover decays toward near-idle levels
```

This suggests a useful scanner memory rule:

> A large probe should not be discarded merely because continuation is delayed. Keep it alive while the structural base survives and post-probe volume contracts.

## Important negative finding: no continuous hidden accumulation

The full post-probe interval did **not** show persistent positive flow.

### 15m probe → pre-ignition

- price: ~-4.15%
- OBV: decreased
- taker-derived CVD: decreased
- net taker delta: approximately -13.8% of sampled volume

### 1H view

- price remained broadly stable/slightly higher across the broader window
- OBV: decreased
- CVD: decreased
- net taker delta: approximately -11.2%

Therefore:

```
Do NOT infer:
"smart money continuously accumulated for 15 hours"
```

A better description is:

```
Probe
→ real sell / cleanup pressure
→ volume exhaustion
→ late flow reversal
```

## Micro Buy-Pulse Cluster before the breakout

The final high-value precursor appears only when the last minutes are decomposed.

### 1m observations

#### 05:39 UTC

- close: 0.06087
- RVOL: ~7.12x
- taker-buy share: **97.6%**

#### 05:42 UTC

- close: 0.06092
- RVOL: ~16.67x
- taker-buy share: **98.7%**

#### 05:45 UTC

- taker-buy share: **95.3%**

Price had not yet materially expanded.

This gives a useful tag:

`BUY_PRESSURE_WITHOUT_EXPANSION`

and then:

`MICRO_BUY_PULSE_CLUSTER`

The distinction matters because an extreme buy-share pulse alone does not prove immediate breakout. It identifies pressure building against resting liquidity.

## Actual ignition mechanics

### 05:54 UTC — initial raid / displacement

- open: 0.06075
- high: **0.06453**
- close: 0.06372
- RVOL: **~182.64x**
- taker-buy share: ~63.6%

The candle traded through the old probe high:

`0.06438`

This is the initial liquidity raid / displacement event.

### 05:55 UTC — close-based BOS confirmation

- open: 0.06384
- high: 0.06621
- close: **0.06599**
- RVOL: ~56.66x

This candle closed decisively above the old probe high.

Research distinction:

```
05:54 = raid / initial displacement
05:55 = close-based BOS confirmation
```

This directly supports the scanner rule:

> Wick penetration is not enough. Prefer a close-based break above the remembered probe high before promoting the setup to confirmed ignition.

## Post-BOS displacement

Subsequent 1m closes:

- 05:54 — 0.06372
- 05:55 — 0.06599
- 05:56 — 0.07054
- 05:57 — 0.07562
- 05:58 — 0.07912
- 05:59 — 0.08137

After the confirmed break, the setup transitioned from PRE-IGNITION to EXPANSION very quickly.

## Taker interpretation after ignition

Taker-buy share did **not** remain persistently above 60% once full expansion began.

Examples:

- 05:54 — ~63.6%
- 05:55 — ~46.4%
- 05:56 — ~48.8%
- 05:57 — ~51.9%
- 05:58 — ~46.7%
- 05:59 — ~38.8%

Therefore a rule such as:

`require taker-buy > 60% throughout the breakout`

would be too restrictive.

TAKE suggests:

- pre-ignition extreme buy-share pulses are useful;
- after displacement begins, two-way turnover, profit-taking, covering, and chasing can distort aggregate taker ratios;
- structure + RVOL + close-based BOS should gain weight after ignition.

## OI remains a lagging confirmation

Pre-ignition OI remained almost flat:

- T-24H: ~66.81M
- T-6H: ~67.27M
- T-1H: ~67.31M
- T0 region: ~67.41M

Post-expansion:

- +1H: ~75.19M
- +2H: ~86.62M
- +3H: ~106.85M

Thus the final route remains:

`FLOW_FIRST / OI_LATE`

OI should be used as:

`OI_CHASE_CONFIRM`

not as a precondition for this pattern.

## Risk context

This was not a pristine uncrowded setup.

Before ignition:

- global account L/S roughly 3.3–3.6
- top-trader position L/S roughly 1.9
- funding reached ~+0.0597% several hours before the move
- funding remained positive near ignition

Therefore the high-value safeguard is:

**do not front-run the route only because a probe exists.**

Prefer:

```
probe memory valid
+ structural base survives
+ volume dry
+ HTF structure constructive
+ LTF reset
+ micro buy-pulse cluster
+ remembered probe high raid
+ CLOSE-BASED BOS
```

before upgrading to confirmed ignition.

## Refined scanner route

### Stage A — PROBE_MEMORY

- prior 5m/15m RVOL >= 5x
- preferably >= 10x for a strong probe
- store probe high / low / close
- preserve timestamp and elapsed time

### Stage B — DEEP_RECOMPRESSION

- price may retrace several percent
- probe low / structural invalidation remains intact
- do not require a shallow flag

### Stage C — VOLUME_DRY

- average post-probe volume materially below probe volume
- TAKE reference:
  - post-probe average ~6.9% of probe volume
  - final 4H average ~3.1%

### Stage D — LTF_RESET

- HTF structure remains constructive
- LTF RSI/MACD/OBV may temporarily cool
- no requirement for persistent positive CVD

### Stage E — MICRO_BUY_PULSE_CLUSTER

High priority when repeated 1m/5m observations show:

- taker-buy >= 70%
- stronger if >= 90%
- multiple pulses rather than one isolated reading
- price has not yet fully expanded

### Stage F — PROBE_HIGH_RAID

- renewed RVOL expansion
- price trades through stored probe high

### Stage G — CLOSE_BOS_CONFIRM

- candle closes above stored probe high / local external liquidity
- displacement present
- route promoted to confirmed ignition

### Stage H — OI_CHASE_CONFIRM

- OI expands after price
- confirms leverage chasing the already-active move
- must not be required for Stage A–G

## Final refined DNA

```
PROBE_MEMORY
→ DEEP_RECOMPRESSION
→ VOLUME_DRY
→ LTF_RESET
→ MICRO_BUY_PULSE_CLUSTER
→ PROBE_HIGH_RAID
→ CLOSE_BOS_CONFIRM
→ DISPLACEMENT
→ OI_CHASE_CONFIRM
```

### Do not automatically tag

- continuous accumulation
- hidden smart-money accumulation
- spot-led move
- OI lead

without separate evidence.

## Validation requirement

This is still a known successful sample.

The next required control cohort is:

```
large volume probe
→ recompression
→ volume dry
→ no valid close-based probe-high BOS
→ no subsequent surge
```

Compare successful TAKE-like samples with those failed controls before assigning predictive weight to `PROBE_MEMORY` or `MICRO_BUY_PULSE_CLUSTER`.

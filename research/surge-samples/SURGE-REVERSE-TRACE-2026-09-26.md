# Current Surge Reverse-Trace Batch — 2026-09-26

## Scope

- market: Binance USDⓈ-M Futures
- snapshot date: 2026-09-26
- current surge universe: 24H change >= +10%
- deep reverse-trace cohort: 24H change >= +15% and quote volume >= $10M
- deep cohort size: 13
- purpose: successful-surge DNA extraction
- NOT a predictive validation cohort

## Anti-bias warning

Every symbol in this document was selected after it was already a current winner.

Use this batch to discover candidate routes only.

Do not assign scanner weights from this file without matched failed controls selected before outcome.

---

## Deep reverse-trace cohort

| Symbol | 24H | T0 | 1H body | 1H RVOL | OI T-24H→T0 | OI T-6H→T0 | OI T0→+3H | Pre-T0 taker max | Route |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| RARE | +61.77% | 2026-09-26 06:00 | +39.67% | 7.64x | +47.84% | +0.91% | +64.32% | 1.14 | OI_LEAD + DELAYED_PROBE |
| PHA | +36.78% | 2026-09-25 12:00 | +12.30% | 12.15x | +42.19% | +35.67% | +39.31% | 1.04 | CONTINUOUS_OI_CASCADE |
| 2Z | +31.87% | 2026-09-26 06:00 | +14.50% | 32.89x | +4.22% | +11.13% | +32.26% | 1.24 | MICRO_FLOW + OI_CHASE |
| ARK | +28.88% | 2026-09-25 10:00 | +10.99% | 2.96x | +34.26% | +9.49% | +18.06% | 1.11 | OI_LEAD + PROBE_MEMORY |
| MUBARAK | +26.48% | 2026-09-22 16:00 | +20.21% | 2.55x | +36.05% | +5.32% | +4.28% | 1.06 | OI_LEAD / CONTINUOUS_BUILD |
| ENA | +24.30% | 2026-09-25 11:00 | +5.52% | 4.47x | +1.19% | +0.46% | +2.18% | 1.20 | DELAYED_PROBE → RVOL_BOS |
| VELODROME | +20.28% | 2026-09-25 16:00 | +7.45% | 8.80x | +0.47% | -0.42% | +3.83% | 1.21 | FLOW/RVOL_FIRST |
| AERO | +19.86% | 2026-09-25 16:00 | +5.98% | 3.71x | +7.53% | +3.37% | +6.22% | 1.23 | MIXED_OI + RVOL |
| KMNO | +16.33% | 2026-09-25 13:00 | +1.39% | 7.29x | +6.78% | +4.99% | +3.38% | 1.92 | TAKER_PULSE + OI_BUILD |
| REZ | +16.09% | 2026-09-25 10:00 | +4.59% | 11.97x | +2.86% | +2.89% | +5.48% | 1.74 | IMMEDIATE_RVOL_TAKER |
| PUMP | +15.90% | 2026-09-25 10:00 | +4.09% | 2.23x | +7.43% | +0.01% | -4.51% | 1.29 | BREAKOUT_WITHOUT_OI_CHASE |
| PROM | +15.86% | 2026-09-22 17:00 | +11.78% | 7.61x | +0.90% | +2.68% | -1.05% | 1.32 | FLOW/RVOL_FIRST |
| CC | +15.64% | 2026-09-24 16:00 | +1.21% | 9.97x | +4.46% | +0.67% | +0.72% | 1.69 | TAKER_PULSE + RVOL |

---

## 15m Probe Memory reverse trace

| Symbol | Probe age | Probe RVOL | Probe buy share | Post-probe avg vol / probe | Return probe→pre-T0 | Max drawdown after probe |
|---|---:|---:|---:|---:|---:|---:|
| RARE | 14.75H | 54.47x | 48.4% | 30.3% | -5.19% | -10.44% |
| PHA | 6.50H | 22.91x | 55.0% | 75.9% | +15.49% | -4.98% |
| 2Z | 0.75H | 9.92x | 58.8% | 110.5% | +3.34% | -0.52% |
| ARK | 9.50H | 12.97x | 46.5% | 27.2% | +14.76% | -5.13% |
| MUBARAK | 11.50H | 9.31x | 51.1% | 85.2% | +27.46% | -6.04% |
| ENA | 10.25H | 5.19x | 67.2% | 24.2% | -2.66% | -6.96% |
| VELODROME | 10.50H | 5.06x | 40.4% | 44.6% | +7.73% | -0.98% |
| AERO | 6.75H | 9.54x | 42.3% | 27.1% | +2.08% | -2.08% |
| KMNO | 1.75H | 4.85x | 57.1% | 70.6% | +3.67% | -0.84% |
| REZ | 0.25H | 12.33x | 67.2% | N/A | N/A | N/A |
| PUMP | 0.75H | 4.08x | 61.0% | 72.4% | -0.22% | -0.50% |
| PROM | 2.50H | 5.39x | 47.1% | 27.8% | +3.91% | -2.27% |
| CC | 1.75H | 4.07x | 45.6% | 57.1% | +0.93% | -1.96% |

### Immediate observation

The cohort splits into two broad probe behaviors:

1. **Delayed-probe / cooling route**
   - RARE
   - ARK
   - ENA
   - VELODROME
   - AERO
   - PROM

2. **Continuous / near-immediate expansion route**
   - PHA
   - 2Z
   - MUBARAK
   - KMNO
   - REZ
   - PUMP
   - CC

This supports keeping `POST_PROBE_VOLUME_DRY` route-specific rather than universal.

---

# Representative microstructure reverse traces

## RARE — OI Lead + Delayed Probe + Renewed BOS

### Historical probe

- probe: 2026-09-25 15:15 UTC
- 15m RVOL: 54.47x
- buy share: 48.4%
- probe close: 0.01638
- probe high: 0.01650
- probe→T0: 14.75H
- post-probe average volume: 30.3% of probe
- pre-T0 return from probe close: -5.19%
- max post-probe drawdown: -10.44%

### OI

- T-24H→T0: +47.84%
- T-6H→T0: +0.91%
- T0→+3H: +64.32%

This is not a simple last-minute OI build.

The larger derivative inventory was already present before the final ignition, then OI accelerated again after breakout.

### 1m pre-T0

- buy-share >=70%: 14 bars
- >=90%: 1 bar
- max buy share: 90.0%
- max 1m RVOL: 8.23x

### 5m ignition

Reference high:
- 0.01560

At 06:00 UTC:
- high: 0.01652
- close: 0.01644
- RVOL: 12.54x
- taker-buy share: 50.2%

Raid and close-BOS occurred on the same 5m candle.

### DNA

```
EARLY OI BUILD
→ HUGE VOLUME PROBE
→ DEEP RECOMPRESSION / VOLUME COOLING
→ MICRO FLOW ACTIVITY
→ CLOSE_BOS
→ POST-BOS OI CASCADE
```

Suggested tags:

- `OI_LEAD`
- `DELAYED_PROBE`
- `DEEP_RECOMPRESSION`
- `POST_BOS_OI_CASCADE`

---

## PHA — Continuous OI Cascade, not Volume-Dry

### Historical probe

- probe: 2026-09-25 05:30 UTC
- RVOL: 22.91x
- probe→T0: 6.5H
- post-probe average volume remained ~75.9% of probe volume
- price was already +15.49% versus probe close before the selected T0

This is **not** a delayed quiet-base setup.

### OI

- T-24H→T0: +42.19%
- T-6H→T0: +35.67%
- T0→+3H: +39.31%

### 1m final hour

- no >=70% buy-share cluster
- max buy share: ~69.3%
- max 1m RVOL: ~4.14x

### 5m BOS

Reference high:
- 0.06588

12:10 UTC:
- high: 0.06785
- close: 0.06713
- RVOL: 3.74x
- buy share: 54.6%

### DNA

```
OI BUILD
→ VOLUME EXPANSION
→ CONTINUOUS PRICE PROGRESS
→ CLOSE_BOS
→ FURTHER OI CASCADE
```

Suggested tags:

- `CONTINUOUS_OI_CASCADE`
- `NO_VOLUME_DRY_REQUIRED`
- `DERIVATIVES_LEAD`

---

## 2Z — Immediate Probe + Extreme Micro Flow + OI Chase

### Probe

- 05:15 UTC
- 15m RVOL: 9.92x
- probe→T0: only 45m
- volume did not cool; post-probe average was ~110.5% of probe

### OI

- T-24H→T0: +4.22%
- T-6H→T0: +11.13%
- T0→+3H: +32.26%

### 1m final hour

- buy-share >=70%: 18 bars
- >=90%: 7 bars
- >=95%: 2 bars
- max buy share: 95.9%
- max 1m RVOL: 40.42x

Notable:
- 05:21 UTC RVOL 40.42x / buy share 90.8%
- 05:07 UTC RVOL 15.28x / buy share 95.7%

### 5m BOS

Reference high:
- 0.06130

06:00 UTC:
- high: 0.06241
- close: 0.06161
- RVOL: 6.28x
- buy share: 61.4%

### DNA

```
SHORT OI BUILD
→ IMMEDIATE VOLUME PROBE
→ EXTREME MICRO BUY-PULSE CLUSTER
→ CLOSE_BOS
→ LARGE OI_CHASE
```

Suggested tags:

- `MICRO_FLOW_ASSISTED`
- `IMMEDIATE_PROBE`
- `OI_CHASE_CONFIRM`

---

## ENA — Delayed Probe + Volume Dry + BOS, little OI lead

### Probe

- 2026-09-25 00:45 UTC
- 15m RVOL: 5.19x
- buy share: 67.2%
- probe→T0: 10.25H
- post-probe average volume: 24.2% of probe
- return from probe close before T0: -2.66%
- maximum drawdown: -6.96%

### OI

- T-24H→T0: +1.19%
- T-6H→T0: +0.46%
- T0→+3H: +2.18%

OI was not the lead signal.

### 1m final hour

- >=70% buy-share bars: 4
- >=90%: 1
- max buy share: 90.1%
- max RVOL: 3.63x

Micro-flow existed, but there was no TAKE/CYPH-level extreme cluster.

### 5m ignition

Reference high:
- 0.22946

11:00 UTC:
- high: 0.23290
- close: 0.23266
- RVOL: 7.13x
- buy share: 58.8%

Raid and close-BOS occurred on the same bar.

### DNA

```
VOLUME_PROBE
→ DEEP RECOMPRESSION
→ VOLUME_DRY
→ MODEST FLOW REBUILD
→ RVOL REIGNITION
→ CLOSE_BOS
→ EXPANSION
```

Suggested tags:

- `DELAYED_PROBE`
- `VOLUME_DRY`
- `FLOW_FIRST`
- `RVOL_BOS`

---

# Cross-batch lessons

## 1. OI Lead remains a distinct family

Strong examples in this batch:

- RARE
- PHA
- ARK
- MUBARAK

These should not be forced into TAKE-like Flow-First logic.

## 2. Probe Memory remains useful, but cooling is not universal

Delayed cooling examples:

- RARE
- ARK
- ENA
- VELODROME
- AERO
- PROM

Continuous/near-immediate examples:

- PHA
- 2Z
- MUBARAK
- KMNO
- REZ
- PUMP
- CC

Therefore:

`POST_PROBE_VOLUME_DRY` = route-specific positive evidence, not a global requirement.

## 3. Micro buy-pulse cluster is also route-specific

Very strong:
- 2Z

Moderate:
- RARE
- ENA

Absent / not required:
- PHA

This reinforces the earlier TAKE-batch conclusion:

**micro buy flow is a weighted feature, not a universal gate.**

## 4. Taker at T0 itself is often unimpressive

Examples:
- RARE T0 taker ~1.08
- PHA ~1.02
- ARK ~1.06
- ENA ~0.92
- CC ~0.93

Therefore the scanner should compare:

- pre-T0 pulse window
- lower-TF flow
- BOS structure

instead of requiring T0 1H taker > 1.5.

## 5. Post-BOS OI expansion can be more informative than pre-BOS OI

Examples:
- RARE +64.32% after T0
- 2Z +32.26%
- PHA +39.31%
- ARK +18.06%

Use `OI_CHASE_CONFIRM` separately from `OI_LEAD`.

---

# Required failed-control study

For each successful route, collect failures from the same historical universe:

### OI-lead failure

```
OI_BUILD
→ no valid BOS
→ price stagnates / breaks down
```

### Delayed-probe failure

```
VOLUME_PROBE
→ recompression
→ volume dry
→ no close-BOS
```

### Micro-flow failure

```
extreme buy-pulse cluster
→ resistance holds
→ no follow-through
```

Compare:

- OI slope
- taker pulse timing
- probe age
- volume-dry ratio
- drawdown after probe
- distance to remembered high
- close-BOS quality
- post-BOS OI response
- MFE / MAE

Only after the failed-control study should these reverse-trace features affect production scanner weights.

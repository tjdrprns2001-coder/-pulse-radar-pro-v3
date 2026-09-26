# 2026-09-26 Live Surge Sample Batch

Source: Binance USDⓈ-M perpetual live scan  
Sampled at: 2026-09-26 KST  
Purpose: preserve observed surge signatures for PRE-SURGE research.  
Rule: raw observed values are preserved; later success/failure labels may be appended without deleting the original sample.

## Batch summary

| Symbol | 24H price | OI 24H | OI recent ~4H | 1H RVOL | Taker max | Observed archetype |
|---|---:|---:|---:|---:|---:|---|
| RARE | +63.491% | +306.248% | +151.376% | 6.57x | 1.3226 | OI explosion + RVOL displacement |
| PHA | +35.532% | +170.451% | -5.461% | 0.72x | 1.1908 | OI explosion then post-pump deleveraging |
| ARK | +28.681% | +71.182% | +7.681% | 1.25x | 1.2658 | persistent OI build + trend expansion |
| ENA | +24.871% | +28.104% | +1.101% | 0.73x | 1.2235 | gradual OI build + controlled trend |
| AERO | +20.391% | +31.108% | -2.496% | 1.64x | OI build then late-stage unwind |
| PUMP | +15.660% | +12.677% | +6.695% | 1.34x | moderate OI build + taker-assisted ignition |

## Detailed observations

### RARE
- 24H move: +63.491%
- OI 24H: +306.248%
- recent ~4H OI: +151.376%
- recent 1H taker: 1.3226, 0.9956, 0.9525, 1.1363, 1.0848, 1.0130
- taker max in sampled 24H: 1.3226
- 1H RVOL20: 6.57x
- recent 4H price move: +45.46%
- recent 12H price move: +34.99%
- interpretation: leverage/OI expansion and volume displacement were much stronger than taker extremity.

### PHA
- 24H move: +35.532%
- OI 24H: +170.451%
- recent ~4H OI: -5.461%
- taker max: 1.1908
- 1H RVOL20 at sample time: 0.72x
- recent 4H price move: -5.50%
- interpretation: historical OI explosion followed by post-surge deleveraging; current snapshot is late-stage, not PRE-SURGE.

### ARK
- 24H move: +28.681%
- OI 24H: +71.182%
- recent ~4H OI: +7.681%
- taker max: 1.2658
- 1H RVOL20: 1.25x
- recent 12H price move: +19.59%
- interpretation: persistent OI accumulation + orderly trend expansion.

### ENA
- 24H move: +24.871%
- OI 24H: +28.104%
- recent ~4H OI: +1.101%
- taker max: 1.2235
- 1H RVOL20: 0.73x
- interpretation: gradual OI build; aggressive taker values were not required for sustained expansion.

### AERO
- 24H move: +20.391%
- OI 24H: +31.108%
- recent ~4H OI: -2.496%
- taker max: 1.2265
- 1H RVOL20: 1.64x
- interpretation: prior OI build followed by OI contraction after price expansion; classify as late-stage/unwind sample.

### PUMP
- 24H move: +15.660%
- OI 24H: +12.677%
- recent ~4H OI: +6.695%
- taker max: 1.3908
- 1H RVOL20: 1.34x
- recent 4H price move: +5.01%
- interpretation: moderate OI build + taker support + continued expansion.

## New scanner deductions

1. **OI explosion route**
   - price still relatively contained
   - 4H OI > +3%
   - 12–24H OI > +10%
   - RVOL then expands
   - taker does not need to be extreme

2. **Volume ignition route**
   - 1H RVOL >= 1.5x or 15m RVOL >= 2–3x
   - structural break follows
   - OI confirms or accelerates

3. **Quiet-taker route**
   - taker 1.10–1.40 can be sufficient
   - if OI build and volume expansion are already strong

4. **Late-stage exclusion**
   - 24H price >= +15%
   - large 1H displacement already occurred
   - or OI turns down after a major surge
   - exclude from PRE-SURGE candidate ranking and keep only as training sample

## DNA labels
- RARE: OI_EXPLOSION_RVOL_DISPLACEMENT
- PHA: OI_EXPLOSION_POST_SURGE_DELEVERAGING
- ARK: PERSISTENT_OI_BUILD_TREND_EXPANSION
- ENA: GRADUAL_OI_BUILD_CONTROLLED_TREND
- AERO: OI_BUILD_LATE_STAGE_UNWIND
- PUMP: MODERATE_OI_TAKER_IGNITION

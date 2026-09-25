# PRE-IGNITION threshold calibration v1 — 2026-09-25

## Scope

Research-only calibration for the new `preIgnitionScore` direction.

Source archive:
- `research/surge-samples/2026-09-24-live-pump-batch.json`
- 16 historical surge/control records
- 8 records classified as `FRESH_PRE_T0`
- 8 records classified as `EXTENDED_PRE_T0`

The archive proxy uses only fields available before T0:
- T-6H price change
- T-24H price change
- T-6H OI change
- T-24H OI change
- T-6H taker ratio
- T-24H taker ratio

It does **not** use T0 candle return, T0 RVOL, breakout result, or the later snapshot state.

## Threshold replay

| Proxy cutoff | Selected | Fresh captured | Fresh recall | Extended selected | Extended leak |
|---:|---:|---:|---:|---:|---:|
| 60 | 9 | 8 / 8 | 100% | 1 / 8 | 12.5% |
| 70 | 6 | 6 / 8 | 75% | 0 / 8 | 0% |
| 80 | 4 | 4 / 8 | 50% | 0 / 8 | 0% |

### Cutoff 60

Fresh captures:
- BTWUSDT
- KMNOUSDT
- CAPUSDT
- STABLEUSDT
- LSKUSDT
- XNYUSDT
- TRIAUSDT
- STEEMUSDT

Extended leak:
- ZROUSDT

This is the best capture-oriented shadow threshold in the current archive replay.

### Cutoff 70

Fresh captures:
- BTWUSDT
- CAPUSDT
- STABLEUSDT
- XNYUSDT
- TRIAUSDT
- STEEMUSDT

Extended leaks:
- none

This is cleaner but misses two fresh reset/rebuild routes in this archive: KMNO and LSK.

### Cutoff 80

Fresh captures:
- CAPUSDT
- STABLEUSDT
- XNYUSDT
- STEEMUSDT

Extended leaks:
- none

This is too restrictive as a general discovery threshold on the current archive.

## Interpretation

For research shadowing:

- **60** = capture-oriented watch threshold
- **70** = cleaner/high-conviction sub-tier
- **80** = strict confirmation tier, not a discovery default

The current archive therefore supports keeping 60 as the shadow watch level while using 70 as a stronger quality tier. It does **not** support turning 80 into the general scanner cutoff.

## Important limitation

This is not a production threshold validation.

The archived batch is survivor-biased because it was built from names that had already surged or were selected as surge/control samples. It does not contain a representative set of failed PRE-SURGE candidates. Therefore precision, false-positive rate, expectancy, and live hit rate cannot be estimated from this replay.

Also, the archive proxy score is intentionally not identical to the production `preIgnitionScore`: historical v3/v2/ICT fields are incomplete in this archive.

For those reasons the calibration harness marks the result as **shadow-only** and does not change production filtering automatically.

## Next validation gate

Before promoting a hard production cutoff:

1. persist real production `preIgnitionScore` for all eligible and rejected candidates at decision time;
2. keep both successful and failed candidates;
3. evaluate at fixed forward horizons without rewriting the original snapshot;
4. compare 60 / 70 / 80 on an out-of-sample window;
5. only promote a cutoff when recall and false-positive behavior are stable across multiple days and market regimes.

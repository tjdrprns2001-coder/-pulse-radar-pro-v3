# PulseRadar Pro v3 Calibration Protocol

## Purpose
This protocol evaluates detector quality. It does not estimate future profit probability and does not simulate execution.

## Dataset split
- DEV: 55%. Pattern definitions, filters, parameter ranges, diagnostics and calibration proposals may change here.
- VALID: 20%. Used to score DEV proposals and decide whether a proposal is READY.
- HOLDOUT: 25%. Hidden by default. It is exposed only when both `pattern_engine_version` and `calibration_set_version` are explicitly pinned.

The API never uses HOLDOUT to generate parameter proposals. A durable one-run-only HOLDOUT lock would require persistent storage; the current serverless implementation provides a version-pinned logical gate and keeps HOLDOUT absent from the normal UI.

## Point-in-time requirements
Every historical detection must use only pivots with `confirmedAt <= asOf` and candle/ATR data available at the detection index. Each event records `firstSeenAt`, `detectedAt`, `confirmedAt`, engine version and calibration-set version through the response metadata.

## Baseline and Edge
For each split, direction and market regime, the validator builds an unconditional forward-return baseline on the same sampled timestamps. `Edge = direction-adjusted pattern return - matching baseline median`.

Regimes are intentionally coarse to reduce degrees of freedom:
- trend + high volatility
- trend + low volatility
- range + high volatility
- range + low volatility

## Walk-forward stability
DEV is divided into six chronological windows. The validator reports each window's median Edge, positive-window ratio and an OOS-retention diagnostic. These are detector-stability diagnostics, not a conventional strategy WFE claim.

## Uncertainty
Edge uses a deterministic moving-block bootstrap 90% interval so serial dependence is treated more conservatively than an iid t-statistic.

## Reliability score
Research score (0–100):
- sample quality: 20
- baseline-adjusted Edge: 25
- MFE/MAE quality: 20
- DEV walk-forward stability: 25
- bootstrap consistency: 10

The score is always shown with sample count and split diagnostics. It is never interpreted alone.

## Parameter budget
Each pattern family has at most three calibration-eligible parameters. Configuration is stored as one global profile plus timeframe deltas. The default calibration sample budget is 30 observations per free parameter and at least 20 VALID observations. Proposals are never auto-applied.

Calibration stages:
- INSUFFICIENT: sample budget not met
- CANDIDATE: sample budget met but validation/stability is not strong enough
- READY: sample budget, VALID score and walk-forward consistency pass; parameters may be frozen before a pinned HOLDOUT inspection

## Versioning
Current identifiers live in `lib/calibration-profile.js`:
- `ENGINE_VERSION`
- `CALIBRATION_VERSION`

Changing pattern definitions, structural filters, tunable ranges or accepted calibration values requires a new version identifier before HOLDOUT inspection.

## UI
The Calibration Lab displays current-TF VALID diagnostics and keeps HOLDOUT locked. The 4-TF matrix is loaded only on demand to limit serverless cost. Low-sample and weak-stability patterns remain research-only diagnostics.
# PulseRadar Pro v3 Calibration Protocol

## Purpose
This protocol evaluates pattern-detector quality. It does not estimate future profit probability and does not simulate order execution.

## Dataset split
- DEV 55%: pattern definitions, filters, diagnostics and bounded parameter proposals may change here.
- VALID 20%: scores DEV proposals and decides whether a proposal may become READY.
- HOLDOUT 25%: hidden from normal API/UI and exposed only by an explicit, version-pinned inspection request.

The validator never uses HOLDOUT to generate calibration proposals. A durable one-run-only lock needs persistent storage; the current serverless gate requires exact engine/calibration IDs plus an explicit inspection flag.

## Point-in-time contract
At historical index `asOf`:
- only pivots with `confirmedAt <= asOf` are canonical;
- detector candles and ATR arrays end at `asOf`;
- all pattern anchors must be `<= asOf`;
- event confirmation index must be `<= asOf`.

The runtime audit counts violations separately as `futurePivotUse`, `futureAnchorUse`, `futureConfirmationUse`, and `detectorFutureInputUse`. `pointInTime` is true only when all remain zero. Duplicate/overlapping detections suppressed by the event key are also counted.

## Multi-horizon outcomes
VALID diagnostics are computed at 10, 20 and 40 bars where available. The UI reports `Edge10`, `Edge20`, and `Edge40` so one horizon cannot dominate the interpretation.

## Baseline and Edge
For each split, direction, market regime and horizon, the validator builds an unconditional sampled-timestamp baseline.

`Edge(h) = direction-adjusted pattern return(h) - matching baseline median(h)`

Neutral patterns use absolute movement as a descriptive outcome rather than forcing a bullish/bearish label.

## Regimes
Regimes are intentionally coarse to reduce degrees of freedom:
- trend + high volatility
- trend + low volatility
- range + high volatility
- range + low volatility

Each VALID pattern summary includes sample count and Edge by regime.

## Walk-forward stability
DEV is divided into six chronological windows. The validator reports each window's median Edge, positive-window ratio and an OOS-retention diagnostic. This is an event-detector stability diagnostic, not a conventional strategy-WFE claim.

## Uncertainty
Edge40 uses a deterministic moving-block bootstrap 90% interval. Confidence bins (`<75`, `75–79`, `80+`) expose whether higher detector confidence is actually associated with stronger historical Edge.

## Reliability score
Research score 0–100:
- sample quality: 20
- baseline-adjusted Edge: 25
- MFE/MAE quality: 20
- DEV walk-forward stability: 25
- bootstrap consistency: 10

The score must always be read together with VALID sample count, Edge interval, regime breakdown and walk-forward diagnostics.

## Parameter budget
Each pattern family has at most three calibration-eligible parameters. Configuration uses a global profile plus timeframe deltas. Default budget is 30 observations per free parameter and at least 20 VALID observations.

Parameter metadata defines bounded step sizes. Calibration may only produce a proposal; `autoApply` remains false. Weak VALID/WF results propose conservative tightening, while exceptionally stable results may propose only a very small confidence-cut relaxation.

Calibration stages:
- INSUFFICIENT: sample budget not met
- CANDIDATE: sample budget met but validation/stability is not strong enough
- READY: sample budget, VALID score and walk-forward consistency pass; candidate may be frozen before HOLDOUT inspection

## Versioning
Identifiers live in `lib/calibration-profile.js`:
- `ENGINE_VERSION`
- `CALIBRATION_VERSION`

Changing pattern definitions, structural filters, tunable ranges, split protocol, outcome semantics or accepted calibration values requires a new calibration identifier before HOLDOUT inspection.

## UI
Calibration Lab v3 shows:
- point-in-time audit status and overlap suppression count;
- VALID Edge10/20/40, MFE and Reliability;
- walk-forward and bootstrap diagnostics;
- confidence calibration bins;
- bounded parameter proposals;
- regime-specific Edge;
- on-demand 15m/1h/4h/1d Pattern × TF matrix.

HOLDOUT remains absent from normal UI.

## Deployment workflow
Development is performed on `calibration-lab`, where Vercel deployment is disabled. Multiple code commits are accumulated there. After protocol checks pass, the finished branch is merged to `main` once so Production performs one deployment instead of a build per intermediate change.
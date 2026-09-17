# Signal Quality Foundation v1 Completion Design

## Goal
Complete the remaining PulseRadar Signal Quality Foundation gaps without changing the existing analysis engine semantics or adding automatic trading.

## Scope
1. Clock/Ordering Integrity: distinguish exchange event time from local receive time, measure skew/delay, detect out-of-order events and sequence gaps, and expose feed counters.
2. Data Provenance: retain source/market/fallback/timestamps/latency/state metadata and expose it through expandable UI details.
3. Outcome Recorder: add 50-bar outcomes and retain immutable snapshot context including regime/flow/pattern metadata so later segmentation is possible.
4. Calibration: add Wilson confidence intervals, explicit adequacy status, and optional metadata filtering while preserving Brier/ECE/reliability/saturation/Precision@Top20%.
5. Alert State: persist armed_at, triggered_at, confirmed_at, reason_changed and cooldown_until while keeping calibration pending as a hard ARMED/TRIGGERED/CONFIRMED gate.
6. Feature Drift: compare recent vs historical feature/outcome relationship with 30/90 day windows and emit insufficient/stable/warning states.
7. CEX/DEX Microstructure: keep separate feature builders and connect currently available snapshot flow fields without pretending unavailable DEX/CEX features exist.
8. UI: preserve the compact four-card summary and put provenance, clock/order health, drift, CI, and evidence in expandable details.

## Data Flow
Feed/fetch metadata -> Data Integrity + Clock Integrity -> Snapshot immutable record -> Structure/Flow/Regime/Microstructure metadata -> Outcome resolution at 5/10/20/50 bars -> Calibration + Drift -> Alert state -> compact UI.

## Safety/Truthfulness Constraints
- Never display raw pattern score as calibrated probability.
- When calibration is insufficient, ARMED/TRIGGERED/CONFIRMED are blocked.
- Missing data remains missing; no synthetic microstructure values are invented.
- No automatic order execution is added.
- Drift and regime outputs are diagnostics, not guarantees.

## Compatibility
Existing 15m/1h/4h/1d/1w analysis, snapshot rendering, and current quality cards remain available. New modules use the same browser/CommonJS dual-export style as existing signal-quality modules.
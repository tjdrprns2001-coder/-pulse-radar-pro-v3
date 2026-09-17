# Signal Quality v2 Operations Design

## Goal
Move PulseRadar from a safety-first Signal Quality Foundation into an operational research workflow that can accumulate usable evidence, explain performance, and connect discovery to validation without enabling automatic trading or external alerts.

## Scope
This iteration excludes Telegram, Discord, push notifications, and any automatic order execution. It includes hierarchical calibration backoff, historical outcome backfill, outcome/performance dashboards, conservative drift/regime policy gating, alert-state history, NO_SIGNAL analysis, SURGE-to-analysis one-click workflow, DEX microstructure expansion, reference-only position sizing/partial-exit calculations, and the missing 30/90-day Drift UI connection.

## 1. Historical Outcome Backfill
Historical backfill replays the existing signal-analysis logic across already available OHLCV history and records outcomes at 5/10/20/50-bar horizons.

Historical samples MUST be labeled `BACKTESTED` and live samples MUST be labeled `LIVE_VALIDATED`. The two populations are stored and reported separately. They may be shown side by side, but a live-validated probability must never silently include backtested observations.

Backfill snapshots keep the same core schema as live snapshots: symbol, timeframe, pattern, regime, venue, signal score, feature values, entry, invalidation, targets, provenance, and subsequent outcomes. Backfill should be idempotent by deterministic snapshot key so reruns do not duplicate the same historical event.

## 2. Hierarchical Calibration Backoff
Calibration resolution uses the most specific bucket that has enough observations, then broadens only as necessary. The initial fallback chain is:

1. symbol + TF + pattern + regime + venue
2. TF + pattern + regime + venue
3. pattern + regime + venue
4. pattern + venue
5. venue
6. global

Each result exposes `bucketLevel`, `bucketLabel`, `sampleSource`, `N`, probability, Wilson 90% CI, adequacy state, Brier, ECE, and whether the displayed result came from a broader bucket.

`LIVE_VALIDATED` is preferred. If live data is insufficient, the UI may show a separate `BACKTESTED` estimate as supporting evidence, but it must not be relabeled as live calibration. ARMED gating may use an explicitly configured broader live bucket; backtested-only evidence can support research views but must not independently unlock live ARMED states.

## 3. Outcome / Performance Dashboard
Add a dedicated performance view that aggregates by pattern, timeframe, regime, venue, alert state, and validation source.

Metrics include sample count, hit rate, average return, median return, average R when invalidation is available, drawdown proxy, Brier, ECE, precision@top20, Wilson interval, 30/90-day drift status, and live-vs-backtested separation.

The dashboard supports filtering and drilldown to individual snapshots so tuning decisions can be traced to source observations.

## 4. Drift / Regime Policy Layer
Drift is initially advisory for model weights. It does not automatically rewrite feature coefficients.

Conservative actions are allowed:
- `insufficient`: do not claim stability; keep calibration gate requirements.
- `warning`: mark feature/bucket degraded and require fresh calibration evidence before escalation beyond WATCH when that feature is materially contributing.
- `stable`: no additional restriction.

This policy is deterministic, visible in the UI, and records the reason for any state cap. It must never silently weaken risk controls.

## 5. 30/90-day Drift UI
The snapshot quality panel must call `compareWindows()` rather than the 30-day-only helper. It displays both 30-day and 90-day windows with status and sample counts. If either window lacks sufficient resolved outcomes, that window displays `insufficient` rather than inventing a stable/warning state.

Drift inputs remain resolved outcomes plus stored feature values, not raw price movement alone.

## 6. Alert-State History
Persist and display state transitions with timestamp, previous state, next state, reason, evidence count, calibration bucket, drift status, integrity status, and cooldown metadata.

The detail page provides a recent timeline and summary counts for WATCH, ARMED, TRIGGERED, CONFIRMED, INVALIDATED, EXPIRED, and NO_SIGNAL. State-history analytics compare outcomes by state while preserving live/backtested separation.

## 7. NO_SIGNAL / Abstain Analysis
Record abstention snapshots when evidence is incomplete, integrity fails, calibration is unavailable, or policy gates block escalation.

Outcome analysis compares accepted signals versus abstained cases over 20/50 bars. The system reports abstention rate and counterfactual outcome distribution as research diagnostics, not as a claim that skipped trades would have been profitable.

## 8. SURGE -> Validation One-Click Workflow
Scanner rows and SURGE candidates gain direct actions that preserve symbol and relevant context when opening the unified shell, detailed structure analysis, snapshot analysis, ICT/SMC view, and performance history.

The flow becomes: discover candidate -> inspect structure/flow -> inspect calibration and drift -> inspect historical performance -> inspect alert history, without re-entering the symbol.

## 9. DEX Microstructure Expansion
Extend DEX features with swap-volume acceleration, swap imbalance, pool liquidity delta, LP net flow, price impact, liquidity/market-cap ratio when available, unique-trader acceleration, and whale-swap concentration.

Each feature carries provenance and freshness. Missing DEX data remains null/unknown instead of being converted into neutral scores. DEX and CEX components remain separate in storage and presentation.

## 10. Reference-Only Position Sizing / Partial Exit Calculator
Add a research calculator based on user-entered account size, maximum risk percentage, entry, invalidation, and targets. It calculates risk amount, stop distance, notional/quantity estimate, reward-to-risk, and optional staged exits.

This calculator is explicitly reference-only: no exchange keys, no order placement, no automated execution, and no default recommendation to take a trade. Suggested staged exits are configurable examples rather than prescriptive instructions.

## 11. Data Model Additions
Outcome snapshots gain `validationSource` (`LIVE_VALIDATED` or `BACKTESTED`), deterministic `snapshotKey`, and optional `alertStateAtCapture`.

Calibration results gain `bucketLevel`, `bucketLabel`, `broaderBucket`, and `validationSource`.

Alert history stores policy reasons and calibration/drift context at each transition.

## 12. Safety / Fail-Safe Rules
- No auto-order capability.
- No external notification integration in this iteration.
- Backtested and live-validated evidence never merge silently.
- Missing data produces `unknown`, `insufficient`, or `NO_SIGNAL`, never fabricated confidence.
- Backtested-only calibration never unlocks live ARMED/TRIGGERED/CONFIRMED states.
- Drift warnings can only keep or tighten gates, never loosen them automatically.
- Raw pattern scores remain distinct from calibrated probability.

## 13. Testing
Add tests for:
- deterministic historical backfill and duplicate prevention
- live/backtested population separation
- hierarchical bucket selection and broader-bucket labeling
- ARMED gating with broader live calibration versus backtested-only evidence
- 30/90-day Drift UI contract
- drift warning policy caps
- alert-history persistence
- abstention outcome capture
- scanner deep links preserving symbol/context
- DEX feature null/provenance behavior
- position sizing arithmetic and no-order contract
- dashboard aggregation correctness

Known-value statistical sanity tests must include Wilson 90% interval for 60/100 successes and fixed Brier/ECE examples.

## 14. Delivery Order
1. Historical backfill + validation-source separation
2. Hierarchical calibration backoff
3. 30/90-day Drift UI + policy gate
4. Outcome/performance dashboard
5. Alert history + NO_SIGNAL analysis
6. SURGE one-click workflow
7. DEX microstructure expansion
8. Reference-only position sizing / staged-exit calculator
9. Full verification and deployment validation

## Non-Goals
Telegram, Discord, push notifications, automatic model-weight rewriting, automatic order execution, exchange-key custody, and portfolio execution are out of scope for this iteration.
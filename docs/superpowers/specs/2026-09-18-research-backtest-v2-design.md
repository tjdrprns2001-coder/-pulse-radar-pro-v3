# Research Backtest v2 Design

Date: 2026-09-18

## Goal
Build a reproducible historical research pipeline that can produce a formal dataset from mechanically collected signal events without hindsight selection. The system must separate feature generation from future outcome labeling, enforce immutable train/validation boundaries, and preserve enough metadata to audit every event later.

This is a research/evaluation subsystem. It does not place trades, connect wallets, size positions, or claim predictive certainty.

## Hard Rules
These rules are versioned and may not be bypassed by UI or later calibration code.

1. **Feature cutoff is signal-candle close.**
   - Every feature snapshot is calculated only from fully closed market data whose close time is `<= signalCandleCloseTs`.
   - Future 3H/6H/12H/24H/3D bars are outcome-only data.
   - Feature snapshots are immutable after creation.

2. **Event collection is mechanical and exhaustive within the declared universe.**
   - Run the same screener over every eligible symbol and every evaluation timestamp in the requested historical range.
   - Persist every event that satisfies the frozen screener configuration.
   - Do not hand-pick successes or failures.
   - If historical universe completeness is limited, persist and display the limitation explicitly.

3. **Outcome definitions are fixed before evaluation.**
   - Primary labels for v1:
     - `Hit_6H_8pct`: whether future high reaches or exceeds (`>=`) entry price × 1.08 within 6 hours.
     - `Hit_24H_12pct`: whether future high reaches or exceeds (`>=`) entry price × 1.12 within 24 hours.
   - Store point return, MFE, MAE, and RR for 3H, 6H, 12H, 24H, and 3D.
   - Zero/threshold boundary behavior is deterministic and documented.
   - Outcome definitions are versioned; changing a threshold creates a new outcome schema version instead of rewriting prior labels.

4. **Train/Validation isolation is strict.**
   - Default split:
     - TRAIN: 2021-01-01T00:00:00Z through 2024-12-31T23:59:59.999Z.
     - VALIDATION: 2025-01-01T00:00:00Z through the configured validation end timestamp.
   - Threshold search/tuning is allowed only in TRAIN.
   - Before VALIDATION evaluation, the threshold manifest is frozen.
   - Validation statistics cannot mutate the frozen threshold manifest.
   - Any post-validation retune requires a new manifest/version and a new validation run.

## Dataset Model

### Event Record
Each mechanically detected event stores:

- `eventId`
- `symbol`
- `signalCandleOpenTs`
- `signalCandleCloseTs`
- `entryPrice`
- `datasetSplit`: `train | validation | excluded`
- `universeVersion`
- `featureSchemaVersion`
- `screenerConfigVersion`
- `outcomeSchemaVersion`
- `thresholdManifestVersion`
- `source`: `historical-replay`
- `numericFeatures`
- optional explanatory tags:
  - A0-D
  - PRE-SURGE / ACCUMULATION-PRE / etc.
  - sector
- `createdAt`

The explanatory tags are never treated as the original research data. Numeric features are the canonical feature representation.

### Numeric Feature Vector
The first schema should preserve raw numeric measurements already available in PulseRadar and add normalized research fields where available:

- returns: 5m / 15m / 1h / 4h / 24h
- quote volume and normalized volume ratios
- 5m / 15m / 1h / 4h volume acceleration
- taker ratio / buy-pressure metrics
- RSI
- MACD histogram
- Stoch RSI
- KDJ values
- OBV-derived numeric measurements where available
- ATR
- ribbon width normalized by ATR
- distance to moving averages normalized by ATR
- structure / breakout measurements encoded numerically
- liquidity / market-cap proxies where historical data is actually available
- volatility and range measurements
- current scanner score/confidence retained as observational fields, not ground truth

Missing historical features must be `null` plus an availability flag rather than reconstructed from future data.

## Outcome Model
Outcome data is stored separately from the immutable feature event.

For each horizon `3H | 6H | 12H | 24H | 3D`:
- target end timestamp
- point return at horizon
- MFE percent
- MAE percent
- RR
- max-price timestamp
- min-price timestamp
- data status: `evaluated | unavailable`

Primary labels:
- `Hit_6H_8pct`
- `Hit_24H_12pct`

Recommended RR definition for v1:
- `RR_horizon = MFE_pct / abs(MAE_pct)` when MAE < 0.
- If MAE is exactly 0, store RR as `null` and a dedicated `noAdverseExcursion=true` flag rather than infinity.

MFE/MAE use the full high/low path from immediately after the signal candle close through the horizon end. The signal candle itself is not part of the future outcome window.

## Mechanical Event Collection
The research runner evaluates a declared historical universe and a deterministic timestamp grid.

The collector:
1. resolves symbols eligible at the simulated timestamp;
2. fetches only candles fully closed by the signal timestamp;
3. builds the numeric feature snapshot;
4. executes the frozen screener predicate;
5. persists every matching event with a deterministic ID;
6. does not inspect future returns before deciding whether to persist the event;
7. evaluates outcomes in a separate phase.

The collector must support checkpoint/resume and deterministic dedupe.

## Historical Universe / Survivorship Bias
Universe provenance is mandatory.

Preferred mode:
- reconstruct listing/delisting availability by historical exchange metadata where obtainable.

Fallback mode:
- if only currently known symbols are available, mark the run:
  - `universeMode = current-survivors-only`
  - `survivorshipSafe = false`

Such runs may be used for exploratory research but must not be presented as unbiased validation.

Each event/run stores:
- `universeVersion`
- `universeMode`
- listing availability source
- known `listedAt` / `delistedAt` where available
- `survivorshipSafe`

## Hypothesis-only Samples
All manually discovered or historically selected “interesting pumps” collected before this formal pipeline are stored outside the formal dataset, tagged `hypothesis-only`.

Rules:
- may inform candidate feature engineering;
- must not contribute to formal hit rates;
- must not contribute to train/validation sample counts;
- must not contribute to threshold selection;
- must not be silently converted to backtest events.

## Threshold Manifest
A versioned manifest defines all screener thresholds and event predicates, e.g.:
- volume multiple thresholds
- ATR/ribbon thresholds
- taker thresholds
- structure requirements
- momentum requirements

Fields:
- `manifestVersion`
- `createdAt`
- `derivedFromSplit: train`
- threshold values
- feature schema version
- screener version
- `frozen=true`
- `signalTimeframe`
- `evaluationGridMs`
- optional training statistics supporting the choice

Validation code must reject an unfrozen manifest. Event timestamps must come only from the manifest-defined signal candle close grid; changing `signalTimeframe` or `evaluationGridMs` requires a new manifest version.

## Statistical Analysis
Formal analysis compares mechanically collected successes and failures.

For each numeric feature:
- sample count
- missing-rate
- mean
- median
- standard deviation where meaningful
- p10 / p25 / p50 / p75 / p90
- success-group vs failure-group differences
- train vs validation drift
- optional effect-size metric

Do not introduce sector-specific threshold optimization until the configured sector sample minimum is reached.

A0-D and other semantic classes remain explanatory grouping dimensions only.

## Versioning
The following are immutable identifiers stored with every event:
- `featureSchemaVersion`
- `screenerConfigVersion`
- `thresholdManifestVersion`
- `outcomeSchemaVersion`
- `universeVersion`

A change to feature calculations, event predicates, success thresholds, split dates, or universe construction requires a new version. Existing records are never silently rewritten.

## Storage
Use a separate research namespace from live signal-performance data.

Suggested logical prefixes:
- `research-v2/runs/`
- `research-v2/events/`
- `research-v2/outcomes/`
- `research-v2/manifests/`
- `research-v2/universes/`
- `research-v2/stats/`
- `research-v2/checkpoints/`

The existing live scanner and signal-performance subsystem continue to operate independently.

## API Surface
Add bounded APIs:

- `GET /api/research-backtest/status`
  - run/checkpoint/universe/split/manifest status.

- `POST /api/research-backtest/run`
  - admin-authenticated bounded historical collection batch.

- `POST /api/research-backtest/evaluate`
  - admin-authenticated bounded outcome evaluation batch.

- `GET /api/research-backtest/stats`
  - train/validation statistics and labels.

- `GET /api/research-backtest/events`
  - paged event inspection without secret configuration exposure.

Admin POST endpoints remain locked if an admin token is not configured.

## UI
Add a Korean `정식 백테스트` view next to `성과 검증`.

Display:
- dataset version and frozen manifest
- universe mode / survivorship warning
- TRAIN vs VALIDATION sample counts
- Hit_6H_8pct
- Hit_24H_12pct
- 3H / 6H / 12H / 24H / 3D return distributions
- MFE / MAE / RR distributions
- feature success/failure comparison
- missing-feature rates
- train-vs-validation drift
- hypothesis-only samples explicitly excluded
- validation threshold freeze status

Do not label historical hit rate as future probability.

## TDD / Integrity Gates
Required tests:

1. partially open candle is rejected from feature construction;
2. any candle with close time after signalCandleCloseTs is rejected;
3. future outcome candles never affect event eligibility;
4. all matching events are persisted, not only successes;
5. success/failure labels are computed after event persistence;
6. Hit_6H_8pct exact-boundary behavior;
7. Hit_24H_12pct exact-boundary behavior;
8. MFE/MAE exclude the signal candle;
9. 3H/6H/12H/24H/3D return math;
10. RR zero-MAE handling;
11. deterministic event IDs/dedupe;
12. checkpoint resume;
13. hypothesis-only samples excluded from formal stats;
14. TRAIN and VALIDATION dates are mutually exclusive and exhaustive for in-range events;
15. validation cannot run with an unfrozen manifest;
16. validation cannot mutate manifest thresholds;
17. stats are separated by train/validation;
18. current-survivors-only run surfaces survivorship warning;
19. missing features remain null and do not become zero;
20. formal research failures never break `/api/coin-scan`;
21. Netlify Functions v2/Blob wiring;
22. mobile UI regression;
23. full existing `npm run verify` regression.

## Rollout
1. research data contracts and split/version modules;
2. immutable feature snapshot builder;
3. deterministic event collector;
4. multi-horizon outcome engine;
5. historical universe provenance;
6. frozen threshold manifest;
7. train/validation statistics;
8. APIs;
9. Korean mobile backtest UI;
10. full CI/review;
11. merge and production smoke tests;
12. only after formal sample accumulation, consider a separate threshold-search module restricted to TRAIN.

## Success Criteria
The subsystem is complete when:
- a run can mechanically scan the declared historical universe without hand-selected examples;
- every formal event is decided using only closed data available at signal time;
- feature snapshots and future outcomes are physically/logically separated;
- Hit_6H_8pct and Hit_24H_12pct plus 3H/6H/12H/24H/3D MFE/MAE/RR are reproducible;
- train and validation are independently queryable;
- validation uses only a frozen threshold manifest and cannot tune it;
- survivorship limitations are explicit;
- old hand-picked pump samples do not contaminate formal statistics;
- the existing production scanner remains unaffected by research subsystem failures.

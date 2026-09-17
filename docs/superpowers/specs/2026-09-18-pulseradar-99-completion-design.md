# PulseRadar 99% Completion Design

## Goal
Bring the current PulseRadar scanner/performance system to a production-grade, evidence-driven state without destabilizing the existing scanner. The target is not guaranteed prediction accuracy; it is operational completeness, reproducible evaluation, calibrated confidence, transparent evidence, and resilient deployment.

## Non-goals
- No automatic order execution, wallet connection, leverage, or position sizing.
- No fabricated news/meta evidence.
- No claim of guaranteed profit or prediction certainty.
- No calibration from future data or from samples below the minimum gate.

## Architecture
Keep `coin-scan` as the primary scanner and place all learning/evaluation functions beside it as isolated modules. Any failure in history, backfill, calibration, meta/news, alerting, or persistence must degrade those modules only and never make `coin-scan` unavailable.

Primary subsystems:
1. Signal outcome store and evaluator
2. Historical backfill engine
3. Calibration and false-positive penalty engine
4. Meta/news evidence engine
5. State-transition alert engine
6. Performance/health API and mobile dashboard
7. Operational retry, dedupe, and release verification

Persistent storage remains Netlify Blobs behind Netlify Functions v2 adapters. Binance remains the price/candle source for outcome evaluation. External news/meta evidence must be source-backed and timestamped.

## 1. Historical Backfill
Add a bounded backfill service that can replay historical Binance candles through the same scanner rules used by live classification, producing immutable synthetic signal snapshots marked `source=backfill`.

Rules:
- Fixed date windows and symbols per run.
- Never use candles after the simulated signal timestamp for classification.
- Evaluate 15m/1h/4h/24h outcomes only after the corresponding future candle becomes available within the historical dataset.
- Backfill records must be namespaced separately from live records and must not overwrite them.
- Job checkpoints allow restart without duplicating completed windows.
- Rate limits and per-run maximums prevent Netlify timeouts.

Backfill is used to seed statistics, not to silently replace live validation. Dashboard must distinguish `live` and `backfill` samples.

## 2. Calibration
Maintain calibration stats by `scanClass × horizon` and optionally by market regime when sample size is sufficient.

Metrics:
- sample count
- positive-return rate
- mean and median return
- p25/p75 return
- best/worst return
- false-positive rate
- Brier score only where the source signal contains an explicit probability-like confidence
- calibration error / bucket reliability where statistically meaningful

Minimum sample gate: 30 completed outcomes for any calibration adjustment. Below 30, display `표본 부족` and do not modify live confidence.

Calibration never changes raw scanner evidence. It produces a separate `calibratedConfidence` plus explanatory fields such as `sampleCount`, `historicalHitRate`, and `calibrationStatus`.

## 3. False-positive Penalty
Create a deterministic penalty layer based only on completed historical/live outcomes.

Examples of penalty dimensions:
- class frequently positive initially but negative by 4h/24h
- late-chase characteristics
- weak taker confirmation
- weak volume persistence
- repeated failed breakout behavior
- low-liquidity concentration

Penalties are capped and reversible. They cannot upgrade blocked classes (`POST-SURGE`, `DISTRIBUTION-RISK`, `PUMP-RISK`, `STALE`) into actionable candidates. Raw score, penalty, and calibrated score remain separately visible.

## 4. Meta / News Evidence
Add a source-backed evidence model for `META-PRE` rather than inferring narrative from price alone.

Evidence object:
- canonical title/summary
- source URL/domain
- published/observed timestamp
- affected symbols/sectors
- evidence type: official project, exchange, protocol, regulatory, ecosystem, credible news
- confidence/strength derived from source type and corroboration count
- dedupe key

Requirements:
- At least one explicit source for `META-PRE`; stronger status requires corroboration.
- Stale evidence expires.
- Conflicting evidence is retained and surfaced, not silently discarded.
- If evidence collection fails, `META-PRE` cannot be newly created from news logic; scanner falls back to price/flow classifications.

## 5. State-transition Alerts
Alert on meaningful class transitions instead of every scan.

Priority transitions:
- `ACCUMULATION-PRE → PRE-SURGE`
- `ANOMALY → PRE-SURGE`
- `META-PRE → PRE-SURGE`
- `SECTOR-ROTATION → PRE-SURGE`
- any candidate class → `DISTRIBUTION-RISK` or `PUMP-RISK`

Rules:
- transition dedupe window
- minimum evidence quality
- cooldown per symbol/transition
- alert payload includes previous/current class, score/confidence changes, supporting evidence, and invalidation/risk notes
- alerts are observation alerts, not trade instructions

Initial delivery can be an in-app alert/event feed. External push channels are optional follow-up integrations, not required for core completion.

## 6. Health and Reliability
Expose one health summary that distinguishes:
- scanner data health
- Binance provider health
- Blob persistence health
- outcome resolver health
- backfill progress
- calibration sample health
- meta/news freshness
- alert event health

Operational rules:
- exponential retry with bounded attempts for non-critical fetches
- circuit-style temporary suppression after repeated provider failures
- idempotent writes and deterministic dedupe keys
- explicit `partial` responses when auxiliary modules degrade
- scanner endpoint remains usable whenever Binance scanner data itself is usable

## 7. API Surface
Extend or add bounded endpoints under `/api`:
- `signal-performance`: existing performance summaries, recent outcomes, live/backfill distinction
- `signal-backfill`: start/read bounded checkpointed jobs
- `signal-calibration`: class/horizon calibration summaries
- `signal-alerts`: recent transition events
- `signal-health`: consolidated auxiliary-system health

All Netlify adapters that need Blobs use Functions v2 and statically import `@netlify/blobs` at the adapter boundary.

## 8. Dashboard
Mobile-first Korean UI additions:
- 성과 검증: live/backfill sample split, 15m/1h/4h/24h tabs
- 보정 신뢰도: raw confidence vs calibrated confidence, sample gate status
- 오탐 분석: top penalty reasons and class-specific failure patterns
- 상태전환: recent transition events
- 메타 근거: source-backed evidence with timestamps
- 시스템 상태: compact green/yellow/red module health without exposing secrets

Do not represent historical hit rate as future probability. Wording must state it is historical observed performance.

## 9. Data Integrity
Hard constraints:
- immutable signal snapshot after creation
- outcomes stored separately
- no future candle access during signal generation
- target horizon resolved with first valid candle at/after target time
- live and backfill source flags mandatory
- timestamps stored in UTC milliseconds
- null/invalid prices/times rejected rather than coerced to zero
- unavailable outcome remains distinct from pending

## 10. Testing / Release Gates
TDD for each subsystem. Required regression coverage:
- backfill future-data leakage
- checkpoint resume/dedupe
- live/backfill separation
- calibration sample gate
- false-positive penalty caps and blocked-class protection
- source-backed META-PRE requirements and evidence expiry
- transition alert dedupe/cooldown
- auxiliary provider failure isolation
- Blob Functions v2 wiring
- API contracts
- mobile UI wiring
- existing coin-scan regression suite

Final release gate:
1. all new tests RED before production implementation where practical
2. `npm run verify` GREEN on final PR head
3. manual PR diff review
4. merge to `main`
5. Netlify production deploy must point at merge commit and be `ready`
6. live checks: `coin-scan`, `signal-performance`, health endpoint return non-error responses
7. existing scanner remains operational with auxiliary modules intentionally failed in tests

## Rollout Strategy
Implement in stages on one feature branch but keep subsystem commits independently reviewable:
1. data model + health foundation
2. backfill
3. calibration + penalty
4. meta/news evidence contract
5. transition alerts
6. APIs + dashboard
7. resilience and final release verification

No automatic calibration mutation is enabled until the minimum sample gates are satisfied. Backfilled statistics are visible immediately but separately labeled so users can distinguish simulated historical evidence from live accumulated evidence.

## Success Criteria
The phase is considered complete when:
- production scanner remains healthy under auxiliary failures
- historical and live outcome datasets are persisted and separable
- 15m/1h/4h/24h performance can be queried by class
- calibration is gated by sample size and never leaks future data
- false-positive penalties are explainable and bounded
- META-PRE requires source-backed evidence
- meaningful state transitions are deduped and recorded
- mobile dashboard exposes performance, calibration, evidence, alerts, and health
- final CI and production smoke checks pass on the deployed merge commit

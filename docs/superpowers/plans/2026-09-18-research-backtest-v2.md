# Research Backtest v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible, mechanically collected historical research dataset with immutable signal-close feature snapshots, fixed multi-horizon outcomes, strict train/validation isolation, survivorship provenance, and a Korean research dashboard without destabilizing the live scanner.

**Architecture:** Add a new `lib/research-backtest-v2` subsystem and a separate Blob namespace/store. The collector decides event eligibility using only fully closed data at the signal timestamp, persists every matching event before any future outcome is inspected, and a separate evaluator computes fixed labels/MFE/MAE/RR. Train/validation rules and a frozen threshold manifest are enforced at the core contract layer and cannot be overridden by APIs or UI.

**Tech Stack:** Node.js CommonJS core modules, Netlify Functions v2 ESM adapters, `@netlify/blobs` 11.1.0, Binance spot REST klines, vanilla HTML/CSS/JS, GitHub Actions `npm run verify`.

**Spec:** `docs/superpowers/specs/2026-09-18-research-backtest-v2-design.md`

## Global Constraints
- Feature cutoff is `signalCandleCloseTs`; only candles with `closeTime <= signalCandleCloseTs` may enter features.
- Formal collection is mechanical over the declared symbol universe and manifest-defined timestamp grid.
- Persist the event before reading or computing any future outcome.
- Primary v1 labels are `Hit_6H_8pct` and `Hit_24H_12pct`, with exact threshold boundary counted as a hit.
- Store point return, MFE, MAE, and RR for 3H/6H/12H/24H/3D.
- TRAIN is 2021-01-01 through 2024-12-31 UTC; VALIDATION begins 2025-01-01 UTC.
- Validation requires a frozen threshold manifest and cannot mutate it.
- Hypothesis-only/manual samples never enter formal stats.
- Missing numeric features remain `null`, never zero-filled.
- Current-survivors-only runs must surface `survivorshipSafe=false`.
- A0-D / scanner classes are explanatory tags only; numeric features are canonical.
- Existing `coin-scan` and `signal-performance` behavior must remain independent and operational.

---

### Task 1: Research contracts, split rules, manifest, and isolated store

**Files:**
- Create: `lib/research-backtest-v2/contracts.js`
- Create: `lib/research-backtest-v2/store.js`
- Create: `scripts/verify-research-contracts.js`

**Interfaces:**
- `splitForTimestamp(ts, validationEndTs) -> 'train'|'validation'|'excluded'`
- `createFrozenManifest(input) -> immutable manifest`
- `assertValidationManifest(manifest) -> true | throws`
- `eventId({symbol, signalCandleCloseTs, screenerConfigVersion}) -> string`
- `createMemoryResearchStore()`
- `createBlobResearchStore({getStore})`

- [ ] **Step 1: Write failing contract tests** covering mutually exclusive split dates, deterministic event IDs, immutable frozen manifest, validation rejection for unfrozen manifests, null preservation, and namespace separation.
- [ ] **Step 2: Run** `node scripts/verify-research-contracts.js`; expect failure because modules do not exist.
- [ ] **Step 3: Implement contracts** with constants:
  - `FEATURE_SCHEMA_VERSION='research-features-v1'`
  - `OUTCOME_SCHEMA_VERSION='research-outcomes-v1'`
  - TRAIN cutoff `2025-01-01T00:00:00.000Z`
  - v1 outcome thresholds 8%/6h and 12%/24h.
- [ ] **Step 4: Implement isolated store** using Blob store name `pulse-research-backtest-v2` and prefixes `research-v2/events/`, `outcomes/`, `runs/`, `manifests/`, `universes/`, `stats/`, `checkpoints/`.
- [ ] **Step 5: Run GREEN** and commit `feat: add research backtest v2 contracts`.

### Task 2: Immutable signal-close feature snapshot builder

**Files:**
- Create: `lib/research-backtest-v2/features.js`
- Create: `scripts/verify-research-features.js`

**Interfaces:**
- `trimClosedFrames(frames, signalCandleCloseTs)`
- `buildFeatureSnapshot({symbol,frames,signalCandleCloseTs,manifest,universe,scannerItem})`
- Returns immutable event-ready feature payload with `numericFeatures` and `featureAvailability`.

- [ ] **Step 1: Write failing tests** proving partially open candles and any candle closing after signal cutoff are excluded; future rows cannot alter features; missing values stay null; signal candle open/close timestamps are recorded.
- [ ] **Step 2: Run RED** with `node scripts/verify-research-features.js`.
- [ ] **Step 3: Implement closed-frame trimming** using Binance array closeTime index 6 and object `closeTime`.
- [ ] **Step 4: Build numeric features** from current historical scanner outputs: price returns, quoteVolume24h, volumeAcceleration/4h/1h/15m, takerRatio, RSI/MACD/Stoch RSI/KDJ, breakout flag encoded 0/1, structure encoded -1/0/1, scanner score/confidence observational fields; unavailable features explicitly null.
- [ ] **Step 5: Run GREEN** and commit `feat: add immutable research feature snapshots`.

### Task 3: Mechanical event collector and historical universe provenance

**Files:**
- Create: `lib/research-backtest-v2/collector.js`
- Create: `lib/research-backtest-v2/universe.js`
- Create: `scripts/verify-research-collector.js`
- Modify: `lib/coin-scan/binance-provider.js`

**Interfaces:**
- `createUniverseSnapshot({exchangeInfo, version, mode, observedAt})`
- `createCollector({provider,store,buildFeatures,screen,now,maxStepsPerRun})`
- `collector.run({runId,manifest,universe,startTs,endTs}) -> {status,processedSteps,matchedEvents,checkpoint,errors}`

- [ ] **Step 1: Write failing tests** where multiple timestamps/symbols contain both future winners and losers; assert all screener matches are persisted and future outcome data is never requested during collection.
- [ ] **Step 2: Test checkpoint/resume and deterministic dedupe**, plus `current-survivors-only` => `survivorshipSafe=false`.
- [ ] **Step 3: Run RED**.
- [ ] **Step 4: Add provider historical frame helper** that fetches only enough data ending at the simulated cutoff; do not add future outcome fetches to collector.
- [ ] **Step 5: Implement timestamp grid** from frozen `manifest.evaluationGridMs` / `signalTimeframe`; collector rejects manifest changes mid-run.
- [ ] **Step 6: Persist event before any evaluator phase**, checkpoint after each complete timestamp, and record universe provenance on run/event.
- [ ] **Step 7: Run GREEN** and commit `feat: collect formal historical research events`.

### Task 4: Multi-horizon outcome engine and fixed labels

**Files:**
- Create: `lib/research-backtest-v2/outcomes.js`
- Create: `scripts/verify-research-outcomes.js`

**Interfaces:**
- Horizons: `h3=3h, h6=6h, h12=12h, h24=24h, d3=72h`.
- `evaluateEvent({event,futureBars}) -> outcome`
- `createOutcomeEvaluator({provider,store,maxEventsPerRun})`
- `evaluator.run({runId,limit})`

- [ ] **Step 1: Write failing tests** for exact +8%/+12% boundary hits, 3H/6H/12H/24H/3D point returns, MFE/MAE, max/min timestamps, and exclusion of the signal candle.
- [ ] **Step 2: Write RR tests**: `MFE / abs(MAE)` when MAE<0; MAE=0 => `rr=null`, `noAdverseExcursion=true`.
- [ ] **Step 3: Run RED**.
- [ ] **Step 4: Implement evaluator** that reads persisted event first, then fetches future bars strictly after `signalCandleCloseTs`; unavailable windows remain unavailable.
- [ ] **Step 5: Persist outcome separately** without mutating event records.
- [ ] **Step 6: Run GREEN** and commit `feat: add fixed multi-horizon research outcomes`.

### Task 5: Formal train/validation statistics and leakage guards

**Files:**
- Create: `lib/research-backtest-v2/stats.js`
- Create: `scripts/verify-research-stats.js`

**Interfaces:**
- `buildStats({events,outcomes,manifest,split})`
- `compareFeatureDistributions(successRows,failureRows)`
- `assertFormalEvent(event)`

- [ ] **Step 1: Write failing tests** excluding `hypothesis-only` and survivorship-unsafe validation from unbiased summary, separating TRAIN/VALIDATION counts, computing primary label hit rates, return/MFE/MAE/RR quantiles, missing rates, and success/failure feature distributions.
- [ ] **Step 2: Add leakage guard tests** proving stats do not write manifest thresholds and validation fails when manifest is unfrozen.
- [ ] **Step 3: Run RED**.
- [ ] **Step 4: Implement quantiles p10/p25/p50/p75/p90**, means/medians, missing rates, simple standardized effect-size where both groups have variance, and train-vs-validation median drift.
- [ ] **Step 5: Keep sector analysis disabled until a configurable minimum sample count (default 30) is met.**
- [ ] **Step 6: Run GREEN** and commit `feat: add formal train validation research stats`.

### Task 6: Research runtime, bounded APIs, and Functions v2

**Files:**
- Create: `lib/research-backtest-v2/runtime.js`
- Create: `api/research-backtest.js`
- Create: `netlify/functions/research-backtest.mjs`
- Create: `scripts/verify-research-api.js`
- Modify: `netlify.toml`
- Modify: `scripts/verify-netlify-temp.js`

**Interfaces:**
- `GET /api/research-backtest?action=status`
- `GET /api/research-backtest?action=stats&split=train|validation`
- `GET /api/research-backtest?action=events&split=...&limit=...`
- `POST /api/research-backtest?action=run`
- `POST /api/research-backtest?action=evaluate`

- [ ] **Step 1: Write RED API tests** for read-only GET routes, bounded limits, validation of split/action, and locked POST when `RESEARCH_BACKTEST_ADMIN_TOKEN` is absent.
- [ ] **Step 2: Verify POST requires `x-research-admin-token`** and validation collection rejects unfrozen manifests.
- [ ] **Step 3: Run RED**.
- [ ] **Step 4: Implement shared handler/runtime** using isolated research store and Binance provider.
- [ ] **Step 5: Add Netlify v2 adapter** with static `@netlify/blobs` import and `getStore` injection.
- [ ] **Step 6: Add redirect** before generic routes and verify wiring.
- [ ] **Step 7: Run GREEN** and commit `feat: expose bounded research backtest APIs`.

### Task 7: Korean formal-backtest dashboard and final release gate

**Files:**
- Create: `research-backtest.html`
- Create: `ui/research-backtest.js`
- Create: `ui/research-backtest.css`
- Create: `scripts/verify-research-ui.js`
- Create: `scripts/verify-research-backtest-v2.js`
- Modify: `signal-performance.html`
- Modify: `package.json`

**Interfaces/UI text:**
- `정식 백테스트`
- `TRAIN`, `VALIDATION`
- `Hit_6H_8pct`, `Hit_24H_12pct`
- `MFE`, `MAE`, `RR`
- `임계값 동결`
- `생존편향 경고`
- `가설용 샘플 제외`

- [ ] **Step 1: Write RED UI tests** checking mobile layout, split selector, manifest freeze display, survivorship warning, label cards, five-horizon outcome distribution, feature comparison, missing-rate display, and language that avoids “future probability”.
- [ ] **Step 2: Implement dashboard** with independent error states for status/stats/events; no admin token exposed client-side.
- [ ] **Step 3: Link from `성과 검증` to `정식 백테스트`.**
- [ ] **Step 4: Add aggregator `verify-research-backtest-v2.js`** running all new research tests.
- [ ] **Step 5: Add `test:research-backtest-v2` to `package.json` and include it in `test:radar`.**
- [ ] **Step 6: Run focused new tests, existing signal tests, and full `npm run verify`.**
- [ ] **Step 7: Review final diff against the spec**, specifically future-data leakage, post-persistence labeling, split freeze, survivorship flags, and hypothesis-only exclusion.
- [ ] **Step 8: Commit** `feat: add formal research backtest dashboard`.
- [ ] **Step 9: PR → final Foundation Verify → squash merge → Netlify production `ready` with merge commit → live GET smoke tests for status/stats/events and mobile page. Do not execute admin POST in production unless a secret token is explicitly configured.**

# PulseRadar 99% Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PulseRadar's evidence loop from live signal capture through historical backfill, calibration, false-positive penalties, source-backed meta evidence, transition alerts, mobile observability, and production verification without destabilizing the scanner.

**Architecture:** Keep `coin-scan` as the primary scanner and extend the existing `lib/signal-performance` subsystem with isolated modules for backfill, calibration, evidence, alerts, and health. All persistence uses the existing Netlify Blobs boundary through Functions v2 adapters; all auxiliary failures degrade only their module and must never make the scanner unavailable.

**Tech Stack:** Node.js CommonJS core modules, Netlify Functions v2 ESM adapters, `@netlify/blobs` 11.1.0, Binance spot REST, vanilla HTML/CSS/JS, existing `npm run verify` GitHub Actions gate.

**Spec:** `docs/superpowers/specs/2026-09-18-pulseradar-99-completion-design.md`

## Global Constraints
- No automatic order execution, wallet connection, leverage, or position sizing.
- No fabricated news/meta evidence; `META-PRE` requires explicit source-backed evidence.
- Live and backfill records are always separable by `source`.
- No future candle may influence signal generation; outcome resolution uses the first valid candle at or after the target timestamp.
- Calibration applies only at `>=30` evaluated samples per `scanClass × horizon`; otherwise status is `표본 부족` and raw confidence is unchanged.
- Historical observed hit rate must never be labeled or presented as future probability.
- `POST-SURGE`, `DISTRIBUTION-RISK`, `PUMP-RISK`, and `STALE` can never be upgraded into actionable candidates by calibration.
- Any history, backfill, calibration, evidence, alert, or Blob failure must not fail `/api/coin-scan`.
- Null/invalid prices or timestamps are rejected rather than coerced to zero.
- All persisted timestamps are UTC milliseconds.

## File Map
Create focused modules: `lib/signal-performance/backfill.js`, `calibration.js`, `penalty.js`, `evidence.js`, `alerts.js`, `health.js`; API handlers `api/signal-backfill.js`, `signal-calibration.js`, `signal-alerts.js`, `signal-health.js`; Netlify v2 adapters for those APIs; verification scripts for each subsystem.
Modify existing `lib/signal-performance/core.js`, `store.js`, `service.js`, `lib/coin-scan/scanner-core.js`, `scan-service.js`, `api/coin-scan.js`, `signal-performance.html`, `ui/signal-performance.js`, `ui/signal-performance.css`, `netlify.toml`, `package.json`, and Netlify/UI regression scripts.

---

### Task 1: Data model + namespaced persistence + health foundation

**Files:** Modify `lib/signal-performance/core.js`, `store.js`; create `lib/signal-performance/health.js`, `scripts/verify-signal-health.js`.

**Interfaces:**
- `buildSnapshot(input)` gains `source: 'live'|'backfill'` and rejects non-finite `capturedAt`/`entryPrice`.
- Store gains `putCheckpoint/getCheckpoint`, `putAlert/listAlerts`, `putEvidence/listEvidence`, `putHealth/getHealth` using deterministic prefixes.
- `createHealthTracker({now})` produces `mark(module,status,detail)` and `snapshot()`.

- [ ] **Step 1: Write RED tests** for live/backfill source preservation, invalid price/time rejection, prefix separation, idempotent checkpoint writes, and health statuses `ok|degraded|down`.

```js
const snap=Core.buildSnapshot({symbol:'BTCUSDT',scanClassKey:'PRE-SURGE',capturedAt:1000,entryPrice:10,source:'backfill'});
assert.equal(snap.source,'backfill');
assert.throws(()=>Core.buildSnapshot({symbol:'BTCUSDT',scanClassKey:'PRE-SURGE',capturedAt:null,entryPrice:10}),/capturedAt/);
assert.throws(()=>Core.buildSnapshot({symbol:'BTCUSDT',scanClassKey:'PRE-SURGE',capturedAt:1000,entryPrice:null}),/entryPrice/);
```

- [ ] **Step 2: Run RED** with `node scripts/verify-signal-health.js`; expect failed assertions/missing APIs.
- [ ] **Step 3: Implement minimal model/store/health code** with prefixes `signal-checkpoints/`, `signal-alerts/`, `signal-evidence/`, `signal-health/`; do not change existing snapshot/outcome keys.
- [ ] **Step 4: Run GREEN** and existing signal-performance core/store tests.
- [ ] **Step 5: Commit** `feat: add signal data namespaces and health tracking`.

### Task 2: Historical backfill engine with no future leakage

**Files:** Create `lib/signal-performance/backfill.js`, `scripts/verify-signal-backfill.js`.

**Interfaces:**
- `createBackfillService({provider,store,classifyAt,now,maxBarsPerRun=1200})`.
- `run({jobId,symbols,startTs,endTs,stepMs}) -> {status,processed,recorded,checkpoint,errors}`.
- Backfill snapshots use `source:'backfill'` and IDs namespaced by source so live snapshots are never overwritten.

- [ ] **Step 1: Write RED tests** proving classifier receives only candles with timestamp `<= simulatedTs`, future candles are unavailable until target time, restart resumes from checkpoint, repeated run creates no duplicates, and live snapshot remains untouched.

```js
await svc.run({jobId:'j1',symbols:['AAAUSDT'],startTs:0,endTs:3600000,stepMs:900000});
const cp=await store.getCheckpoint('j1');
assert(cp.nextTs>0);
assert.equal((await store.listSnapshots()).filter(x=>x.source==='live').length,1);
```

- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement bounded replay** by slicing historical frames to `bar.openTime <= simulatedTs`; use the same `Core.classifyV2` evidence contract through injected `classifyAt` rather than a second classification algorithm.
- [ ] **Step 4: Persist checkpoint after each completed simulation step**; cap work per invocation and return `status:'partial'` when more remains.
- [ ] **Step 5: Run GREEN** and commit `feat: add checkpointed historical signal backfill`.

### Task 3: Calibration + bounded false-positive penalty

**Files:** Create `lib/signal-performance/calibration.js`, `penalty.js`, `scripts/verify-signal-calibration.js`; modify `service.js`.

**Interfaces:**
- `buildCalibration(rows,{minSamples:30})` returns per class/horizon `sampleCount,positiveRatio,mean,median,p25,p75,brier,reliability,status`.
- `calibrateConfidence({rawConfidence,scanClassKey,horizon,stats})` returns raw unchanged below 30 samples; otherwise bounded 0..100 adjustment.
- `penaltyFor(snapshot,outcomes)` returns `{points,reasons}` capped at 20 points.

- [ ] **Step 1: RED tests**: 29 samples => raw unchanged/`표본 부족`; 30 completed samples enables calibration; penalties are capped; blocked classes never upgrade; live/backfill sample counts are reported separately.

```js
assert.deepEqual(calibrateConfidence({rawConfidence:78,stats:{sampleCount:29}}),{rawConfidence:78,calibratedConfidence:78,status:'표본 부족'});
assert(penaltyFor(sample,outcomes).points<=20);
```

- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement quantiles, reliability buckets and optional Brier score** only when finite probability-like raw confidence is present.
- [ ] **Step 4: Implement deterministic penalty reasons** for weak taker persistence, late-chase, failed breakout, weak volume persistence, and low-liquidity concentration using only stored snapshot/outcome fields.
- [ ] **Step 5: Extend performance service output** with `calibration`, `rawConfidence`, `calibratedConfidence`, `penaltyPoints`, `penaltyReasons`, while keeping raw scanner classification unchanged.
- [ ] **Step 6: Run GREEN** and commit `feat: add gated calibration and false positive penalties`.

### Task 4: Source-backed meta/news evidence contract

**Files:** Create `lib/signal-performance/evidence.js`, `scripts/verify-signal-evidence.js`; modify `scanner-core.js`, `scan-service.js` only at the evidence boundary.

**Interfaces:**
- `normalizeEvidence({title,url,domain,publishedAt,symbols,sectors,type})` rejects missing URL/time/title.
- `rankEvidence(items,{now,ttlMs=21600000})` dedupes canonical URL/title, marks stale/conflict, and returns `{strength,sources,items}`.
- `classifyV2` continues to require `metaEvidence.strength==='strong' && sources>=1`; no price-only fallback creates META-PRE.

- [ ] **Step 1: RED tests**: source-less evidence rejected; stale evidence excluded from strong count; duplicate URLs count once; contradictory evidence retained with `conflict:true`; no evidence => no META-PRE.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement evidence normalization/ranking** with types `official-project|exchange|protocol|regulatory|ecosystem|news` and deterministic source weighting; store only factual metadata, not generated claims.
- [ ] **Step 4: Add optional provider context pass-through** so scanner can consume `ctx.metaEvidence` when available; evidence provider failure returns null and falls back to non-meta classifications.
- [ ] **Step 5: Run GREEN** and commit `feat: require source backed meta evidence`.

### Task 5: Meaningful state-transition alert engine

**Files:** Create `lib/signal-performance/alerts.js`, `scripts/verify-signal-alerts.js`; modify `service.js` or scan composition to invoke best-effort alert recording.

**Interfaces:**
- `createAlertService({store,now,cooldownMs=1800000})`.
- `observe(items)` records only approved transitions: accumulation/anomaly/meta/sector -> pre-surge, and candidate -> distribution/pump risk.
- Alert key `${symbol}:${from}:${to}:${bucket}`.

- [ ] **Step 1: RED tests** for approved transitions, ignored same-state scans, 30-minute dedupe/cooldown, risk transition priority, and store failure isolation.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement state memory** using persisted latest symbol state plus alert events containing previous/current class, raw/calibrated confidence when available, reasons, invalidations, and timestamp.
- [ ] **Step 4: Ensure alert failure cannot throw through scanner**.
- [ ] **Step 5: Run GREEN** and commit `feat: add deduped scanner transition alerts`.

### Task 6: Operational retry/circuit isolation

**Files:** Create `lib/signal-performance/resilience.js`, `scripts/verify-signal-resilience.js`; modify auxiliary services to use it.

**Interfaces:**
- `retry(fn,{attempts=3,baseDelayMs=50,shouldRetry})` bounded exponential backoff.
- `createCircuit({failureThreshold=3,cooldownMs=60000,now})` returns `run(fn)` and `state()`.

- [ ] **Step 1: RED tests**: retry stops at configured attempts; permanent 4xx-style errors are not retried; circuit opens after threshold and closes after cooldown; scanner test with every auxiliary dependency throwing still returns scanner data.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Apply resilience only to auxiliary network/storage work**, never wrap scanner classification in a circuit that hides valid Binance failures.
- [ ] **Step 4: Surface `partial:true` and module health instead of throwing when auxiliary modules fail**.
- [ ] **Step 5: Run GREEN** and commit `feat: isolate auxiliary failures with bounded resilience`.

### Task 7: APIs and Netlify Functions v2

**Files:** Create `api/signal-backfill.js`, `signal-calibration.js`, `signal-alerts.js`, `signal-health.js`; create matching `netlify/functions/*.mjs`; modify `netlify.toml`, `scripts/verify-netlify-temp.js`, `package.json`.

**HTTP contracts:**
- `GET /api/signal-backfill?job=...` returns checkpoint; `POST`-equivalent mutation is intentionally not exposed in browser v1—bounded backfill is invoked by authenticated/admin execution path only. Public endpoint remains read-only.
- `GET /api/signal-calibration?class=&horizon=`.
- `GET /api/signal-alerts?symbol=&limit=`.
- `GET /api/signal-health`.

- [ ] **Step 1: RED API/wiring tests** for status codes, filters, readonly backfill public contract, Functions v2 default export, static `@netlify/blobs` import, and `getStore` injection.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement CommonJS shared handlers** with injected services, no secrets in responses, and `Cache-Control: no-store` for operational endpoints.
- [ ] **Step 4: Implement `.mjs` Netlify adapters** using:

```js
import {getStore} from '@netlify/blobs';
export default async function handler(req){ /* bridge req/res and inject name=>getStore(name) */ }
```

- [ ] **Step 5: Add redirects and test scripts to `test:radar`** without removing existing tests.
- [ ] **Step 6: Run GREEN** and commit `feat: expose signal intelligence operations APIs`.

### Task 8: Mobile Korean dashboard completion

**Files:** Modify `signal-performance.html`, `ui/signal-performance.js`, `ui/signal-performance.css`; create/update `scripts/verify-signal-performance-ui.js`.

**UI sections:** `성과 검증`, `보정 신뢰도`, `오탐 분석`, `상태전환`, `메타 근거`, `시스템 상태`.

- [ ] **Step 1: RED UI test** requiring live/backfill split, horizon tabs, raw vs calibrated confidence, historical wording, penalty reasons, alert feed, source links/timestamps, health chips, and mobile single-column layout.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement parallel fetches** to performance/calibration/alerts/health APIs; each panel handles its own failure and never blanks the whole page.
- [ ] **Step 4: Label observed metrics explicitly**: `과거 상승 비율`, `과거 평균 수익률`; never `예측 확률`, `정확도`, or guaranteed language.
- [ ] **Step 5: Escape all external evidence strings/URLs** and show source domain/published time.
- [ ] **Step 6: Run GREEN** at mobile breakpoints and commit `feat: complete mobile signal intelligence dashboard`.

### Task 9: Full TDD regression + release review

**Files:** Modify `package.json` and verification scripts only as required.

- [ ] **Step 1: Add focused scripts** `test:signal-backfill`, `test:signal-calibration`, `test:signal-evidence`, `test:signal-alerts-v2`, `test:signal-health`, `test:signal-resilience`; append them to `test:radar`.
- [ ] **Step 2: Run all new focused tests** and require PASS.
- [ ] **Step 3: Run existing scanner/performance regressions**: coin scan core/deep/provider/api/ui, signal performance core/store/resolver/service/api/ui, Netlify wiring.
- [ ] **Step 4: Run `npm run verify`** and require exit code 0.
- [ ] **Step 5: Review final diff** against the spec: future leakage, source separation, sample gate, blocked-class protection, evidence source requirement, alert dedupe, health isolation, no secret exposure.
- [ ] **Step 6: Fix review findings with regression tests before merge**.

### Task 10: PR, merge, production deploy, smoke verification

**Production:** `https://pulseradar-pro-v3-temp.netlify.app`; site ID `0837f386-e7b7-4ba8-b74b-c16f2e8c9dc2`.

- [ ] **Step 1: Create PR** `feat: complete PulseRadar evidence and calibration loop`.
- [ ] **Step 2: Require final-head Foundation Verify `success`**.
- [ ] **Step 3: Squash merge to `main`** only if head SHA matches verified head.
- [ ] **Step 4: Verify Netlify production deploy** is `ready`, branch `main`, and `commit_ref` equals merge SHA.
- [ ] **Step 5: Confirm Functions v2 runtime** for every Blob-backed new function.
- [ ] **Step 6: Live smoke checks**: `/api/coin-scan?mode=summary&limit=3`, `/api/signal-performance`, `/api/signal-calibration`, `/api/signal-alerts`, `/api/signal-health` all return non-error responses.
- [ ] **Step 7: Verify dashboard loads on mobile** and auxiliary API failure is represented per-panel without breaking scanner navigation.
- [ ] **Step 8: Final completion claim only after fresh CI + production evidence**.

## Self-Review
- Spec coverage: historical backfill, calibration, penalties, source-backed meta evidence, transition alerts, health/retry, API, mobile UI, data integrity, release gates are all mapped.
- Placeholder scan: no TBD/TODO/open implementation holes.
- Type consistency: `source` is `live|backfill`; horizon keys are `m15|h1|h4|h24`; calibration gate is exactly 30 completed outcomes; blocked classes remain blocked.
- Scope safety: no auto execution or wallet integration; no historical metric is presented as guaranteed future performance.

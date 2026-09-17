# Signal Outcome Backtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist eligible scanner signals, evaluate exact 15m/1h/4h/24h forward returns without future leakage, and expose Korean historical performance statistics without changing live signal confidence.

**Architecture:** Add a focused `lib/signal-performance` subsystem: pure math, storage abstraction with Netlify Blobs production adapter, Binance historical resolver, bounded recorder/evaluator service, `/api/signal-performance`, and Korean dashboard. Scanner recording is best-effort so persistence/evaluation failure never breaks `/api/coin-scan`.

**Tech Stack:** Node.js CommonJS, Netlify Functions, Netlify Blobs, Binance spot klines, vanilla HTML/CSS/JS, existing `npm run verify` CI.

**Spec:** `docs/superpowers/specs/2026-09-18-signal-outcome-backtest-design.md`

## Global Constraints
- Eligible: `PRE-SURGE`, `ACCUMULATION-PRE`, `META-PRE`, `SECTOR-ROTATION`, `ANOMALY` only.
- Exclude from positive samples: `POST-SURGE`, `DISTRIBUTION-RISK`, `PUMP-RISK`, `STALE`.
- Deduplicate by `symbol + scanClassKey + 30-minute bucket`.
- Horizons: 15m, 1h, 4h, 24h exactly.
- Never use a candle earlier than horizon target; never substitute latest price for missing historical data.
- Snapshot immutable; outcomes stored separately.
- `<30` evaluated samples => `표본 부족`.
- Historical stats must not modify live confidence/classes/thresholds in v1.
- Performance failures must not fail scanner.
- UI labels Korean-first.

## File Map
Create: `lib/signal-performance/core.js`, `store.js`, `binance-resolver.js`, `service.js`, `api/signal-performance.js`, `netlify/functions/signal-performance.js`, `signal-performance.html`, `ui/signal-performance.js`, `ui/signal-performance.css`, and six `scripts/verify-signal-performance-*.js` tests.
Modify: `lib/coin-scan/scan-service.js`, scanner composition root, `coin-scan.html`, `netlify.toml`, `package.json`, Netlify wiring tests.

---

### Task 1: Pure snapshot/outcome core
**Files:** Create `lib/signal-performance/core.js`, `scripts/verify-signal-performance-core.js`; modify `package.json`.
**Produces:** `isEligibleClass`, `bucketStart`, `snapshotId`, `buildSnapshot`, `targetTimestamps`, `returnPct`, `aggregate`.

- [ ] Write RED tests proving eligible/excluded classes, 30-minute bucket IDs, exact targets `{m15:+900000,h1:+3600000,h4:+14400000,h24:+86400000}`, correct return math, immutable snapshot, and `<30 => 표본 부족`.
- [ ] Run `node scripts/verify-signal-performance-core.js`; expect module-not-found/failed assertions.
- [ ] Implement minimal core. `snapshotId` must be `${symbol}:${scanClassKey}:${bucketStart}`. `buildSnapshot` stores symbol/class label/capturedAt/entryPrice/tradeSignal/candidateScore/sector/priceChange24h/volume/taker/momentum/reasons/targets/version and returns a frozen object.
- [ ] `aggregate(records,30)` returns `sampleCount,evaluatedCount,pendingCount,positiveRatio,meanReturnPct,medianReturnPct,bestReturnPct,worstReturnPct,sampleState`.
- [ ] Run test GREEN, add `test:signal-performance-core`, commit `feat: add signal outcome core`.

### Task 2: Storage abstraction + Netlify Blobs
**Files:** Create `lib/signal-performance/store.js`, `scripts/verify-signal-performance-store.js`; modify package files if dependency absent.
**Produces:** `createMemoryStore()` and `createBlobStore({getStore})`, each with `putSnapshot,getSnapshot,putOutcome,getOutcome,listSnapshots,listOutcomes`.

- [ ] RED test: first `putSnapshot` true; same ID second write false; original snapshot unchanged; outcomes may update; list works.
- [ ] Run RED.
- [ ] Implement keys `signal-snapshots/<id>.json`, `signal-outcomes/<id>.json`; production store name `pulse-signal-performance`.
- [ ] Add/pin `@netlify/blobs` only if absent; regenerate lockfile.
- [ ] Run GREEN and commit `feat: add persistent signal performance store`.

### Task 3: No-future-leak Binance resolver
**Files:** Create `lib/signal-performance/binance-resolver.js`, `scripts/verify-signal-performance-resolver.js`.
**Produces:** `createBinanceResolver({fetchKlines}).resolve(symbol,targetTs,nowTs)`.

- [ ] RED tests: before due => `{status:'pending'}`; with candles at 900/1000/1060 for target 1000 choose 1000, never 900; no valid candle => `unavailable`.
- [ ] Run RED.
- [ ] Implement production request using Binance spot `1m` klines with `startTime=targetTs`, small limit; choose first row where open time `>=targetTs` and use its open price.
- [ ] Run GREEN and commit `feat: add leak-safe outcome price resolver`.

### Task 4: Recorder + bounded evaluator service
**Files:** Create `lib/signal-performance/service.js`, `scripts/verify-signal-performance-service.js`.
**Produces:** `createSignalPerformanceService({store,resolver,now,maxEvaluationsPerRun=12})`, with `recordItems`, `evaluateDue`, `getPerformance`.

- [ ] RED tests: duplicate same class/bucket creates one snapshot; class transition creates another; risk/post/stale excluded; due 15m evaluates while 1h pending; resolver/store errors are returned as subsystem errors rather than uncaught failures.
- [ ] Run RED.
- [ ] Implement `recordItems`: require live data, eligible class, finite positive entry price; call `Core.buildSnapshot`; count recorded/duplicate/skipped/errors.
- [ ] Implement `evaluateDue`: cap horizon slots per call; if not due keep pending; if resolver evaluated, store price/timestamp/`Core.returnPct`; unavailable remains unavailable, never estimated.
- [ ] Implement `getPerformance`: group by class and horizon and include aggregates + recent signal rows.
- [ ] Run GREEN and commit `feat: record and evaluate scanner outcomes`.

### Task 5: Performance API + Netlify function
**Files:** Create `api/signal-performance.js`, `netlify/functions/signal-performance.js`, `scripts/verify-signal-performance-api.js`; modify `netlify.toml`, `package.json` as needed.
**HTTP:** `GET /api/signal-performance?class=PRE-SURGE&horizon=h1&symbol=ONEUSDT&limit=50`.

- [ ] RED tests: valid GET returns 200/status ok; invalid horizon returns 400; service failure returns 503 for this endpoint only.
- [ ] Run RED.
- [ ] Implement GET-only handler. Valid horizons `m15,h1,h4,h24`; clamp limit 1..200. Run bounded `evaluateDue()` then `getPerformance()`; evaluation errors may be surfaced in response without hiding stats.
- [ ] Add Netlify wrapper following existing `coin-scan` function style and route only if generic router does not already cover it.
- [ ] Run GREEN and commit `feat: expose signal performance API`.

### Task 6: Scanner integration with failure isolation
**Files:** Modify `lib/coin-scan/scan-service.js`, scanner composition root/API wiring, `scripts/verify-coin-scan-api.js`.
**Interface:** extend `createScanService({provider,now,performanceRecorder=null})` backwards-compatibly.

- [ ] RED: injected recorder throws `blob down`, yet deep scan still returns `status:'ok'`; deep item must expose finite `lastPrice` from ticker.
- [ ] Run RED.
- [ ] Extend ticker evidence with `lastPrice:num(t.lastPrice)` and expose it on items without changing classification thresholds.
- [ ] After deep classification/sector rotation, call recorder inside `try/catch`; never let it break scanner.
- [ ] Run `node scripts/verify-coin-scan-api.js` and service tests GREEN.
- [ ] Commit `feat: record scanner signals without blocking scans`.

### Task 7: Korean performance dashboard
**Files:** Create `signal-performance.html`, `ui/signal-performance.js`, `ui/signal-performance.css`, `scripts/verify-signal-performance-ui.js`; modify `coin-scan.html`.

- [ ] RED UI test requires strings: `성과 검증`, `15분`, `1시간`, `4시간`, `24시간`, `표본 부족`, `평가 대기`, `평균 수익률`, `중앙값`, `최고`, `최악`; requires `/api/signal-performance`; forbids historical ratio label `정확도`; requires responsive CSS and scanner link.
- [ ] Run RED.
- [ ] Build Korean-first page. Intro text must say historical outcomes do not guarantee future returns.
- [ ] Render per-class sample/evaluated/pending counts and each horizon's 상승 비율/평균/중앙값/최고/최악. Unfinished horizons show `평가 대기`.
- [ ] Escape all API strings or use `textContent`.
- [ ] Add mobile-friendly `성과 검증` link in scanner page.
- [ ] Run GREEN and commit `feat: add Korean signal performance dashboard`.

### Task 8: Full regression gate
**Files:** Modify `package.json` and Netlify/wiring verification scripts only as required.

- [ ] Add six scripts: core/store/resolver/service/api/ui.
- [ ] Append them to `test:radar` before `test:netlify-temp`; do not remove existing tests.
- [ ] Run focused suite: all six new scripts; expect all PASS.
- [ ] Run scanner regressions: `test:coin-scan-core`, `deep`, `provider`, `api`, `ui`; expect all PASS.
- [ ] Run `npm run verify`; require exit code 0 and no failing subtest.
- [ ] Commit `test: gate signal performance rollout`.

### Task 9: Review, merge, deploy, live verification
**Production:** `https://pulseradar-pro-v3-temp.netlify.app`; Netlify site ID `0837f386-e7b7-4ba8-b74b-c16f2e8c9dc2`.

- [ ] Review diff against checklist: immutable snapshot; separate outcome; 30m dedupe; exact four targets; no candle before target; risk/post/stale excluded; `<30 => 표본 부족`; scanner survives persistence failure; stats do not alter live confidence.
- [ ] Create PR `feat: add persistent scanner outcome validation`.
- [ ] Do not merge until final-head Foundation Verify concludes `success`.
- [ ] Squash merge to main.
- [ ] Verify Netlify production deploy is `ready` and `commit_ref` equals merge SHA.
- [ ] Smoke check `/api/signal-performance` returns 200/status ok with zero samples allowed.
- [ ] Smoke check `/api/coin-scan?mode=summary&limit=3` still returns status ok.
- [ ] When first eligible real signal is recorded, verify recent list contains immutable snapshot and not-yet-due horizons show `평가 대기`; do not fabricate completed outcomes.

## Self-Review
- Spec coverage: persistence, dedupe, future-leak prevention, aggregation, failure isolation, Korean UI, sample threshold, calibration boundary, rollout all mapped to Tasks 1–9.
- Placeholder scan: no TBD/TODO/unspecified edge handling remains.
- Type consistency: class key is `scanClassKey`; horizon keys are `m15/h1/h4/h24`; return field is `returnPct`; sample state is `sampleState`.
- Scope: measurement-only v1; no auto trading, no confidence recalibration.

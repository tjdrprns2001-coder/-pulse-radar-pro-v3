# Automatic Full-Coin Scanner Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automatic Binance Spot USDT scanner that scans the full tradable universe, deep-analyzes only candidates, classifies every result into Korean signal-state categories, and exposes a mobile-first dashboard with sector filters and snapshot-analysis links.

**Architecture:** Add a focused `lib/coin-scan` subsystem with pure scoring/classification functions, an injectable Binance data provider with bounded concurrency and TTL caches, a dedicated `/api/coin-scan` endpoint, and a standalone `coin-scan.html` dashboard. Reuse `lib/analysis/presurge-v2.js`, `lib/signal-quality/data-integrity.js`, and the existing `ui/radar-themes.js` registry instead of duplicating PRE-SURGE, freshness, or theme logic. Stage 1 scans the full Binance Spot USDT universe with low-cost inputs; Stage 2 runs the six-timeframe deep analysis only for selected candidates.

**Tech Stack:** Node.js CommonJS modules, browser JavaScript, Binance public REST APIs, Netlify Functions, static HTML/CSS, existing GitHub Actions verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-17-auto-coin-scanner-classification-design.md`

## Global Constraints

- Universe means all currently tradable Binance Spot pairs whose quote asset is `USDT` after explicit leverage/invalid-symbol exclusion.
- Scan order is `1W → 1D → 4H → 1H → 15m → 5m`; Stage 2 is candidate-only so six-timeframe requests are never made for the full universe on every refresh.
- Main categories are exactly `급등 전조 강함`, `급등 전조 관찰`, `거래량 이상징후`, `매수세 유입`, `눌림·재축적`, `이미 급등함`, `약세·이탈`, `데이터 부족·판정 보류`.
- `stale`, `failed`, `reconnecting`, `backfill`, and `verifying` always block live signal classification; `delayed` may not become `급등 전조 강함`.
- Missing OI, funding, or other unavailable metrics remain `null`/unknown and are never coerced to zero.
- Reuse existing `PRE-SURGE v2`, data-integrity, and theme-registry code; do not maintain a second copy of those rules.
- One failed symbol must not fail the whole scan. Partial results must report `partial: true` and preserve per-symbol error/data state.
- No trading execution, exchange order API keys, automated buying/selling, or user-funds position sizing.
- UI copy is descriptive research status, not a buy/sell recommendation or guaranteed direction claim.
- Final release requires focused tests, full `npm run verify`, successful `Foundation Verify`, merged `main`, and Netlify production `ready` for the merge commit.

---

### Task 1: Pure universe, Stage-1 scoring, and classification core

**Files:**
- Create: `lib/coin-scan/scanner-core.js`
- Create: `scripts/verify-coin-scan-core.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Binance `exchangeInfo.symbols`, 24h ticker rows, normalized fast/deep evidence, `PulseDataIntegrity` state strings, and optional theme metadata.
- Produces:
  - `filterUniverse(exchangeInfo, tickers) -> Array<{symbol,baseAsset,quoteAsset,tradable,ticker}>`
  - `fastScore(input) -> {candidateScore,fastReasons,alreadySurged,volumeAnomaly,buyPressure}`
  - `classify(input) -> {category,priority,reasons,dataState}`
  - `beginnerSummary(item) -> string`
  - `CATEGORY_ORDER` constant with the eight approved categories.

- [ ] **Step 1: Write the failing core behavior test**

Create `scripts/verify-coin-scan-core.js` with assertions equivalent to:

```js
const assert=require('assert');
const core=require('../lib/coin-scan/scanner-core.js');

const exchangeInfo={symbols:[
  {symbol:'XLMUSDT',baseAsset:'XLM',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'BTCUPUSDT',baseAsset:'BTCUP',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'OLDUSDT',baseAsset:'OLD',quoteAsset:'USDT',status:'BREAK',isSpotTradingAllowed:true}
]};
const tickers=[{symbol:'XLMUSDT',lastPrice:'0.3',quoteVolume:'10000000',priceChangePercent:'2'}];
const universe=core.filterUniverse(exchangeInfo,tickers);
assert.deepEqual(universe.map(x=>x.symbol),['XLMUSDT']);

assert.equal(core.classify({dataState:'stale'}).category,'데이터 부족·판정 보류');
assert.equal(core.classify({dataState:'live',alreadySurged:true}).category,'이미 급등함');
assert.equal(core.classify({dataState:'live',structure:'bearish',takerRatio:.7}).category,'약세·이탈');
assert.equal(core.classify({dataState:'live',preSurge:{label:'가능성 높음'}}).category,'급등 전조 강함');
assert.equal(core.classify({dataState:'delayed',preSurge:{label:'가능성 높음'}}).category,'급등 전조 관찰');
assert.equal(core.classify({dataState:'live',volumeAcceleration:2.1,takerRatio:1}).category,'거래량 이상징후');
assert.equal(core.classify({dataState:'live',takerRatio:1.3,priceChange1h:1.2}).category,'매수세 유입');
assert.equal(core.classify({dataState:'live',structure:'bullish',pullback:true,reaccumulating:true}).category,'눌림·재축적');
assert(!core.beginnerSummary({category:'급등 전조 관찰',structure:'bullish',dataState:'live',reasons:['1H 거래량 증가']}).includes('매수하세요'));
```

- [ ] **Step 2: Run focused test to confirm RED**

Run: `node scripts/verify-coin-scan-core.js`
Expected: FAIL with module-not-found for `lib/coin-scan/scanner-core.js`.

- [ ] **Step 3: Implement minimal pure core**

`filterUniverse` must require `status === 'TRADING'`, `quoteAsset === 'USDT'`, spot trading enabled when the field exists, a matching ticker row, and reject leveraged-token suffixes including `UP`, `DOWN`, `BULL`, `BEAR` before `USDT`. `fastScore` must use explicit finite-number parsing and return a 0-100 score without inventing missing inputs. `classify` must apply the approved priority order exactly, including the delayed cap. `beginnerSummary` must mention structure, current evidence/category reason, and data state in neutral Korean.

- [ ] **Step 4: Run focused test to confirm GREEN**

Run: `node scripts/verify-coin-scan-core.js`
Expected: PASS and print `coin scan core PASS`.

- [ ] **Step 5: Wire the focused test into repository scripts**

Add:

```json
"test:coin-scan-core": "node scripts/verify-coin-scan-core.js"
```

and include `npm run test:coin-scan-core` in `test:radar` before UI-level scanner tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add lib/coin-scan/scanner-core.js scripts/verify-coin-scan-core.js package.json
git commit -m "feat: add full coin scanner classification core"
```

### Task 2: Six-timeframe deep-analysis adapter with PRE-SURGE v2

**Files:**
- Create: `lib/coin-scan/deep-scan.js`
- Create: `scripts/verify-coin-scan-deep.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{symbol, frames, dataState, oiChangePct, fundingPct, alertState}` where `frames` contains optional raw Binance kline arrays keyed by `1w`, `1d`, `4h`, `1h`, `15m`, `5m`.
- Produces: `analyzeDeep(input) -> {symbol,dataState,structure,momentum,takerRatio,volumeAcceleration,oiChangePct,fundingPct,preSurge,tfState,pullback,reaccumulating,reasons,updatedAt}`.
- Calls `require('../analysis/presurge-v2.js').evaluate(...)`; does not duplicate PRE-SURGE thresholds.

- [ ] **Step 1: Write failing deep-analysis test**

Create deterministic synthetic kline fixtures and assert:

```js
const assert=require('assert');
const deep=require('../lib/coin-scan/deep-scan.js');
const mk=(open,close,vol,buyQuote=vol*.55)=>[0,String(open),String(Math.max(open,close)*1.01),String(Math.min(open,close)*.99),String(close),String(vol),Date.now()-1000,String(vol*close),100,String(vol*.55),String(buyQuote),0];
const up=Array.from({length:90},(_,i)=>mk(100+i,101+i,1000+i*10));
const frames={'1w':up,'1d':up,'4h':up,'1h':up,'15m':up,'5m':up};
const out=deep.analyzeDeep({symbol:'XLMUSDT',frames,dataState:'live',oiChangePct:null,fundingPct:null,alertState:'WATCH'});
assert.equal(out.symbol,'XLMUSDT');
assert.deepEqual(Object.keys(out.tfState),['1w','1d','4h','1h','15m','5m']);
assert.equal(out.oiChangePct,null);
assert.equal(out.fundingPct,null);
assert(out.preSurge && typeof out.preSurge.label==='string');
assert.notEqual(out.takerRatio,0);
const blocked=deep.analyzeDeep({symbol:'XLMUSDT',frames,dataState:'stale'});
assert.equal(blocked.preSurge.label,'판정 보류');
```

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-coin-scan-deep.js`
Expected: FAIL because `deep-scan.js` is missing.

- [ ] **Step 3: Implement deterministic timeframe metrics**

For each timeframe compute only scanner-required features: close trend/structure, recent return, recent-vs-baseline volume acceleration, taker buy/sell ratio from quote/taker-buy quote fields, pullback/reaccumulation hints, and compact state labels. Aggregate higher-timeframe structure from 1w/1d/4h, momentum from 1h/15m/5m, and call PRE-SURGE v2 with nullable OI/funding values preserved as null.

- [ ] **Step 4: Run and confirm GREEN**

Run: `node scripts/verify-coin-scan-deep.js`
Expected: PASS and print `coin scan deep PASS`.

- [ ] **Step 5: Add test script**

Add `test:coin-scan-deep` and include it in `test:radar` immediately after `test:coin-scan-core`.

- [ ] **Step 6: Commit Task 2**

```bash
git add lib/coin-scan/deep-scan.js scripts/verify-coin-scan-deep.js package.json
git commit -m "feat: add candidate deep scan analysis"
```

### Task 3: Binance provider, TTL cache, and bounded worker pool

**Files:**
- Create: `lib/coin-scan/binance-provider.js`
- Create: `lib/coin-scan/cache.js`
- Create: `scripts/verify-coin-scan-provider.js`
- Modify: `package.json`

**Interfaces:**
- `createTtlCache({now}) -> {get(key),set(key,value,ttlMs),delete(key),clear()}`.
- `createBinanceProvider({fetchImpl,now,concurrency=4,cache})` returns:
  - `getUniverse()`
  - `getTickers()`
  - `getKlines(symbol, interval, limit=120)`
  - `mapLimit(items, worker)`
  - `scanDeepCandidates(symbols, intervals)` returning `{results,errors}` without throwing for one-symbol failure.
- Provider uses public endpoints only and tries Binance public bases in order; no API key.

- [ ] **Step 1: Write failing cache/provider tests**

Use an injected fake fetch that records URLs. Assert universe/ticker responses cache, `getKlines` preserves received data, worker pool never exceeds the configured concurrency, and one 502 symbol produces an `errors` entry while successful symbols remain in `results`.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-coin-scan-provider.js`
Expected: FAIL because provider/cache modules are missing.

- [ ] **Step 3: Implement TTL cache and provider**

Use these initial TTLs:
- exchange info: `300000` ms
- all 24h tickers: `30000` ms
- Stage-2 kline request: `45000` ms for 5m/15m/1h and `120000` ms for 4h/1d/1w.

Use default worker concurrency `4`; retry alternate Binance public bases for transport/non-2xx failures. Return structured errors `{symbol,interval,error}` rather than rejecting the batch.

- [ ] **Step 4: Run and confirm GREEN**

Run: `node scripts/verify-coin-scan-provider.js`
Expected: PASS and print `coin scan provider PASS`.

- [ ] **Step 5: Add test script and commit**

Add `test:coin-scan-provider` to `package.json`/`test:radar`, then commit:

```bash
git add lib/coin-scan/binance-provider.js lib/coin-scan/cache.js scripts/verify-coin-scan-provider.js package.json
git commit -m "feat: add bounded Binance scan provider"
```

### Task 4: Scanner orchestration and API contract

**Files:**
- Create: `lib/coin-scan/scan-service.js`
- Create: `api/coin-scan.js`
- Create: `netlify/functions/coin-scan.js`
- Create: `scripts/verify-coin-scan-api.js`
- Modify: `netlify.toml`
- Modify: `package.json`

**Interfaces:**
- `createScanService({provider,now})` exposes `run({mode='summary',category=null,sector=null,limit=100})`.
- Stage 1 evaluates all universe rows from exchangeInfo + all-ticker data and selects deep candidates by `candidateScore`, explicit anomaly flags, and a fixed maximum deep-candidate budget of `40` per uncached run.
- Stage 2 requests six timeframes only for deep candidates and classifies results with `scanner-core.classify`.
- Sector metadata is derived through existing `ui/radar-themes.js` `classifyMarket({symbol,baseAsset})`, mapped for display without affecting signal classification.
- API success schema:

```js
{
  status:'ok',
  updatedAt: 0,
  scanCount: 0,
  deepScanCount: 0,
  partial: false,
  dataHealth:{live:0,delayed:0,blocked:0,errors:0},
  categories:{},
  items:[]
}
```

- [ ] **Step 1: Write failing service/API contract test**

Use a fake provider and assert: full-universe `scanCount`, capped candidate `deepScanCount`, partial=true when one symbol fails, category counts, `category` and `sector` filters, `limit`, and item fields `symbol/category/sector/priority/dataState/reasons/tfState/summary/updatedAt`. Assert a failed symbol appears as `데이터 부족·판정 보류` rather than disappearing silently.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-coin-scan-api.js`
Expected: FAIL because `scan-service.js`/`api/coin-scan.js` do not exist.

- [ ] **Step 3: Implement scanner orchestration**

Stage 1 must keep all universe rows represented in final results: non-deep rows receive a conservative classification from available fast evidence, while deep candidates receive the richer six-TF evidence. If a deep scan fails, keep the row and set blocked data state/reason. Maintain a process-local last-good scan cache; on complete upstream failure return last-good items with `partial:true` and `dataState:'delayed'` metadata if available, otherwise return a clear 502 JSON error.

- [ ] **Step 4: Implement dedicated endpoint and Netlify bridge**

`api/coin-scan.js` adapts `req.query` to the service and sets `Cache-Control: s-maxage=15, stale-while-revalidate=45`. `netlify/functions/coin-scan.js` follows the existing `radar.js` bridge shape. Add before the generic API redirects:

```toml
[[redirects]]
  from = "/api/coin-scan*"
  to = "/.netlify/functions/coin-scan:splat"
  status = 200
  force = true
```

- [ ] **Step 5: Run and confirm GREEN**

Run: `node scripts/verify-coin-scan-api.js`
Expected: PASS and print `coin scan api PASS`.

- [ ] **Step 6: Add test script and commit**

Add `test:coin-scan-api` to `package.json`/`test:radar`, then commit:

```bash
git add lib/coin-scan/scan-service.js api/coin-scan.js netlify/functions/coin-scan.js netlify.toml scripts/verify-coin-scan-api.js package.json
git commit -m "feat: expose automatic coin scan API"
```

### Task 5: Mobile-first classification dashboard

**Files:**
- Create: `coin-scan.html`
- Create: `ui/coin-scan.js`
- Create: `ui/coin-scan.css`
- Create: `scripts/verify-coin-scan-ui.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `/api/coin-scan?mode=summary&limit=250`.
- Produces browser state `{category,sector,query,items,lastUpdated,loading,error}` and renders category tabs, sector filter, health counters, and cards.
- Auto-refresh interval: `60000` ms, with manual refresh button; abort/ignore overlapping refreshes.
- Snapshot deep link: `/snapshot-analysis-restored.html?symbol=<SYMBOL>`.

- [ ] **Step 1: Write failing UI contract test**

Assert `coin-scan.html` loads the new JS/CSS and contains Korean controls for `전체`, `급등 전조`, `거래량 이상`, `매수세`, `눌림`, `이미 급등`, `약세`, `보류`; sector choices include AI/MEME/RWA/DeFi/L1/L2/Gaming/Infrastructure/기타 display equivalents. Assert the JS references `/api/coin-scan`, `60000`, `snapshot-analysis-restored.html`, and safely escapes text. Assert CSS contains mobile rules at <=650px and no fixed-width card that forces horizontal overflow.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-coin-scan-ui.js`
Expected: FAIL because the dashboard files are missing.

- [ ] **Step 3: Implement dashboard markup and rendering**

Top area shows last scan time, total scan count, deep-scan count, live/delayed/blocked/error counts, and refresh state. Tabs apply client-side filtering instantly to the latest response. Cards show symbol, category, priority, sector, data state, 4H/1H/15m state, up to three reasons, a neutral Korean summary, and a `스냅샷 분석` link.

- [ ] **Step 4: Implement resilient refresh behavior**

On request failure keep last rendered items, show an error/degraded badge, and never replace existing results with an empty list unless the API explicitly returns a valid empty scan. Use `cache:'no-store'` and a single in-flight request guard.

- [ ] **Step 5: Run and confirm GREEN**

Run: `node scripts/verify-coin-scan-ui.js`
Expected: PASS and print `coin scan ui PASS`.

- [ ] **Step 6: Add test script and commit**

Add `test:coin-scan-ui` to `package.json`/`test:radar`, then commit:

```bash
git add coin-scan.html ui/coin-scan.js ui/coin-scan.css scripts/verify-coin-scan-ui.js package.json
git commit -m "feat: add mobile coin classification dashboard"
```

### Task 6: Unified shell navigation without replacing the legacy scanner

**Files:**
- Modify: `pulse-unified.html`
- Modify: `ui/pulse-shell.js`
- Create: `scripts/verify-coin-scan-shell.js`
- Modify: `package.json`

**Interfaces:**
- Adds shell view key `autoscan` with path `/coin-scan.html`, title `자동 코인 분류`, and description `바이낸스 현물 USDT 전체 자동 스캔 · 상태별 분류`.
- Keeps existing `scanner` `/index.html` and `radar` `/radar.html` unchanged.

- [ ] **Step 1: Write failing shell test**

Assert `pulse-unified.html` contains a Core navigation button `data-view="autoscan"` and `ui/pulse-shell.js` maps `autoscan` to `/coin-scan.html`. Assert existing `scanner` and `radar` mappings still exist.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-coin-scan-shell.js`
Expected: FAIL because `autoscan` does not exist.

- [ ] **Step 3: Add navigation entry**

Place `자동 코인 분류` directly after `시장 스캐너` in the Core group. Do not remove or repoint any legacy view.

- [ ] **Step 4: Run and confirm GREEN**

Run: `node scripts/verify-coin-scan-shell.js`
Expected: PASS and print `coin scan shell PASS`.

- [ ] **Step 5: Add test script and commit**

Add `test:coin-scan-shell` to `package.json`/`test:radar`, then commit:

```bash
git add pulse-unified.html ui/pulse-shell.js scripts/verify-coin-scan-shell.js package.json
git commit -m "feat: expose automatic scanner in unified shell"
```

### Task 7: Full regression, PR, merge, and production verification

**Files:**
- Modify only if verification reveals a concrete contract gap: `.github/workflows/foundation-verify.yml`, `scripts/verify-netlify-temp.js`, or deployment config.

**Interfaces:**
- Consumes all prior tasks.
- Produces a merge-ready PR and a verified production deploy matching the final merge SHA.

- [ ] **Step 1: Run all focused scanner tests**

Run:

```bash
npm run test:coin-scan-core
npm run test:coin-scan-deep
npm run test:coin-scan-provider
npm run test:coin-scan-api
npm run test:coin-scan-ui
npm run test:coin-scan-shell
```

Expected: all PASS.

- [ ] **Step 2: Run full repository verification**

Run: `npm run verify`
Expected: exit code 0 with all existing radar/chart/calibration/release gates passing.

- [ ] **Step 3: Open PR and wait for Foundation Verify**

Create a PR from `feat/auto-coin-scanner-classification` to `main` summarizing the two-stage scan architecture, eight categories, data-integrity gating, null-preserving optional metrics, mobile dashboard, and no-order scope. Mark ready only after focused verification is green. Expected GitHub Actions job: `Foundation Verify` conclusion `success` on the final head SHA.

- [ ] **Step 4: Merge the verified PR**

Merge only if the PR is mergeable and final CI is successful. Capture the merge commit SHA and verify GitHub reports `merged: true`.

- [ ] **Step 5: Verify Netlify production deploy**

Confirm site `pulseradar-pro-v3-temp` (`0837f386-e7b7-4ba8-b74b-c16f2e8c9dc2`) has a production deploy with `state: ready` and `commit_ref` equal to the merge SHA.

- [ ] **Step 6: Smoke-check deployed paths**

Verify production responds for `/coin-scan.html` and `/api/coin-scan?mode=summary&limit=5`; response must contain the documented schema and the dashboard must reference the production endpoint without exposing order controls.

- [ ] **Step 7: Completion report**

Report only verified facts: merged PR number, merge SHA, `Foundation Verify` status, Netlify deploy state/ID, and live dashboard URL. If any production check is pending, state exactly what is pending instead of claiming completion.

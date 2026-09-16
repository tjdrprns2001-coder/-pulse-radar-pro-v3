# Derivatives + Microstructure Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend ALTCOIN FLOW RADAR with public derivatives and market-microstructure evidence while preserving backward compatibility, null safety, partial-failure behavior, and multi-source false-positive gates.

**Architecture:** Keep `api/market-flow.js` as the orchestration layer and add two focused normalizers, `lib/market-flow/derivatives.js` and `lib/market-flow/microstructure.js`. Use candidate-first deep collection for a bounded set of assets, feed normalized evidence into `lib/market-flow/coin-anomaly.js`, and surface only neutral activity/crowding/confirmation summaries in `ui/radar-altcoin-flow.js`.

**Tech Stack:** Node.js 24 CommonJS, browser JavaScript, existing Netlify/Vercel API wrappers, public exchange REST/WebSocket-compatible market data, existing GitHub Actions verification pipeline.

**Spec:** `docs/superpowers/specs/2026-09-17-derivatives-microstructure-radar-design.md`

## Global Constraints

- Public market data only; no user API keys.
- No order execution, automated trading, wallet signing, leverage control, or personalized buy/sell recommendation.
- Funding and long/short metrics are crowding/overheat evidence, not directional predictions.
- PRE-SURGE requires at least 3 independent evidence dimensions and at least 2 source families.
- SURGE requires at least 4 independent evidence dimensions, real price/volume activity, and at least 3 source families.
- Funding/long-short alone, order-book imbalance alone, or OI change alone must never create PRE-SURGE/SURGE.
- Missing numeric evidence remains `null`; never coerce missing values to zero.
- Stale evidence is excluded from scoring.
- Provider failure must degrade independently and must not fail the entire `/api/market-flow` response.
- Existing response fields and LIVE RADAR/on-chain/market-flow behavior remain backward compatible.
- Deep lookup candidate cap defaults to 40 assets.
- Microstructure raw samples are bounded; no unbounded high-frequency history.
- All user-facing copy stays neutral: activity anomaly, crowding, overheating, confirmation, degraded.

---

## File Map

- Create `lib/market-flow/derivatives.js` — null-safe derivatives normalization, rolling OI/funding history helpers, crowding transforms, freshness/confidence handling.
- Create `lib/market-flow/microstructure.js` — order-book/trade normalization, spread/depth/trade imbalance math, stale filtering helpers.
- Modify `api/market-flow.js` — stage-1 candidate selection, stage-2 public deep collectors, provider health, rolling evidence cache, new API fields.
- Modify `lib/market-flow/coin-anomaly.js` — derivatives/microstructure evidence aggregation, source-family accounting, stricter PRE-SURGE/SURGE gates, risk supplements.
- Modify `ui/radar-altcoin-flow.js` — OI/funding/taker/book/spread/freshness details and top-level confirmation counters.
- Modify `radar.html` — summary metric containers and cache-busted asset versions if required.
- Modify `ui/radar-altcoin-flow.css` — compact desktop/mobile evidence layout.
- Create `scripts/verify-market-flow-derivatives.js` — derivatives normalization/history tests.
- Create `scripts/verify-market-flow-microstructure.js` — microstructure math/null/stale tests.
- Create `scripts/verify-altcoin-evidence-gates.js` — false-positive and source-family gate tests.
- Modify `scripts/verify-altcoin-flow-api.js` — extended API contract and backward compatibility assertions.
- Modify `scripts/verify-radar-altcoin-flow-ui.js` — new UI labels/degraded-state assertions.
- Modify `package.json` — add new test scripts into `test:radar`.
- Modify `.github/workflows/foundation-verify.yml` only if current path filters do not already cover `lib/**`, `api/**`, `ui/**`, `scripts/**`, `radar.html`, and `package.json`.

---

### Task 1: Derivatives normalization and rolling baselines

**Files:**
- Create: `lib/market-flow/derivatives.js`
- Create: `scripts/verify-market-flow-derivatives.js`

**Interfaces:**
- Produces: `finite(value) -> number|null`
- Produces: `normalizeDerivativesEvidence(raw, venue, context) -> DerivativesEvidence|null`
- Produces: `deriveOiChanges(history, current, now) -> {openInterestChange5m,openInterestChange15m}`
- Produces: `fundingCrowding(rate, baselineSamples) -> {fundingZScore,crowdingScore}`
- Produces: `isFresh(record, now, maxAgeMs) -> boolean`
- Produces normalized fields exactly matching the spec: `venue,symbol,baseAsset,marketType,openInterest,openInterestUsd,openInterestChange5m,openInterestChange15m,fundingRate,fundingZScore,longShortRatio,takerBuySellRatio,updatedAt,freshnessMs,confidence`.

- [ ] **Step 1: Write the failing derivatives tests**

```js
const assert=require('assert');
const d=require('../lib/market-flow/derivatives');

assert.strictEqual(d.finite(null),null);
assert.strictEqual(d.finite(''),null);
assert.strictEqual(d.finite('12.5'),12.5);

const n=d.normalizeDerivativesEvidence({symbol:'SOLUSDT',openInterest:'1000',markPrice:'150',fundingRate:'0.0002',longShortRatio:'1.4',takerBuySellRatio:'1.25',updatedAt:100000},'Binance',{now:100500});
assert.strictEqual(n.baseAsset,'SOL');
assert.strictEqual(n.openInterest,1000);
assert.strictEqual(n.openInterestUsd,150000);
assert.strictEqual(n.fundingRate,0.0002);
assert.strictEqual(n.longShortRatio,1.4);
assert.strictEqual(n.takerBuySellRatio,1.25);

const missing=d.normalizeDerivativesEvidence({symbol:'ABCUSDT',openInterest:null,fundingRate:null},'Binance',{now:1000});
assert.strictEqual(missing.openInterest,null);
assert.strictEqual(missing.openInterestUsd,null);
assert.strictEqual(missing.fundingRate,null);

const h=[{ts:0,value:100},{ts:300000,value:120},{ts:900000,value:150}];
const delta=d.deriveOiChanges(h,180,900000);
assert(Math.abs(delta.openInterestChange5m-.5)<1e-9);
assert(Math.abs(delta.openInterestChange15m-.8)<1e-9);

const crowd=d.fundingCrowding(.001,[0,.0001,-.0001,.00005,-.00005]);
assert(crowd.crowdingScore>0);
assert(Number.isFinite(crowd.fundingZScore));
assert.strictEqual(d.isFresh({updatedAt:1000},1100,500),true);
assert.strictEqual(d.isFresh({updatedAt:1000},2000,500),false);
console.log('market flow derivatives PASS');
```

- [ ] **Step 2: Run the new test and confirm failure**

Run: `node scripts/verify-market-flow-derivatives.js`
Expected: FAIL with module-not-found for `../lib/market-flow/derivatives`.

- [ ] **Step 3: Implement `lib/market-flow/derivatives.js` minimally and null-safely**

Implement CommonJS exports with:

```js
const finite=v=>v==null||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(Number(n))?Number(n):0));
```

Use symbol parsing that removes only known quote suffixes `USDT|USDC|USD|FDUSD|PERP`, computes USD OI only when both contract OI and a reliable USD-like mark/index price are present, keeps unknown-unit OI as `openInterest` only, computes percentage OI deltas as `(current-baseline)/baseline`, and computes funding z-score from finite baseline values with a zero-variance guard returning `null` z-score rather than Infinity.

- [ ] **Step 4: Run the derivatives test**

Run: `node scripts/verify-market-flow-derivatives.js`
Expected: `market flow derivatives PASS`.

- [ ] **Step 5: Commit**

```bash
git add lib/market-flow/derivatives.js scripts/verify-market-flow-derivatives.js
git commit -m "feat: add derivatives evidence normalization"
```

---

### Task 2: Microstructure normalization and stale evidence handling

**Files:**
- Create: `lib/market-flow/microstructure.js`
- Create: `scripts/verify-market-flow-microstructure.js`

**Interfaces:**
- Produces: `bookMetrics({bids,asks,midPrice,depthLevels}) -> {bidDepthUsd,askDepthUsd,bookImbalance,topSpreadBps}`
- Produces: `tradeMetrics(trades) -> {tradeBuyUsd,tradeSellUsd,tradeImbalance}`
- Produces: `normalizeMicrostructureEvidence(raw, venue, context) -> MicrostructureEvidence|null`
- Produces: `isFresh(record, now, maxAgeMs) -> boolean`

- [ ] **Step 1: Write failing microstructure tests**

```js
const assert=require('assert');
const m=require('../lib/market-flow/microstructure');
const book=m.bookMetrics({bids:[[100,2],[99,1]],asks:[[101,1],[102,2]],depthLevels:2});
assert.strictEqual(book.bidDepthUsd,299);
assert.strictEqual(book.askDepthUsd,305);
assert(Math.abs(book.bookImbalance-((299-305)/(299+305)))<1e-12);
assert(book.topSpreadBps>0);
const empty=m.bookMetrics({bids:[],asks:[]});
assert.strictEqual(empty.bookImbalance,null);
assert.strictEqual(empty.topSpreadBps,null);
const trades=m.tradeMetrics([{side:'buy',price:100,size:2},{side:'sell',price:100,size:1}]);
assert.strictEqual(trades.tradeBuyUsd,200);
assert.strictEqual(trades.tradeSellUsd,100);
assert(Math.abs(trades.tradeImbalance-(1/3))<1e-12);
const n=m.normalizeMicrostructureEvidence({symbol:'SOLUSDT',bids:[[100,2]],asks:[[101,2]],trades:[],updatedAt:1000},'Binance',{now:1100,sampleWindowMs:15000});
assert.strictEqual(n.baseAsset,'SOL');
assert.strictEqual(n.sampleWindowMs,15000);
assert.strictEqual(m.isFresh(n,1200,1000),true);
assert.strictEqual(m.isFresh(n,5000,1000),false);
console.log('market flow microstructure PASS');
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node scripts/verify-market-flow-microstructure.js`
Expected: FAIL with module-not-found for `../lib/market-flow/microstructure`.

- [ ] **Step 3: Implement the microstructure module**

Normalize prices/sizes with `finite`, compute depth USD using `price * size`, use only the configured top-N levels, compute spread as `((bestAsk-bestBid)/mid)*10000`, normalize trade sides to buy/sell without guessing unknown sides, and return null for unavailable denominators.

- [ ] **Step 4: Run the microstructure test**

Run: `node scripts/verify-market-flow-microstructure.js`
Expected: `market flow microstructure PASS`.

- [ ] **Step 5: Commit**

```bash
git add lib/market-flow/microstructure.js scripts/verify-market-flow-microstructure.js
git commit -m "feat: add microstructure evidence normalization"
```

---

### Task 3: Candidate-first deep collection in market-flow API

**Files:**
- Modify: `api/market-flow.js`
- Modify: `scripts/verify-altcoin-flow-api.js`

**Interfaces:**
- Consumes: `normalizeDerivativesEvidence`, `deriveOiChanges`, `fundingCrowding`, `normalizeMicrostructureEvidence`.
- Produces: `selectDeepCandidates({coinFlows,dexFlows,cexFlows,limit=40}) -> string[]`
- Produces: `/api/market-flow` optional arrays `derivativesFlows` and `microstructureFlows`.
- Produces coverage fields `derivativesMarkets,microstructureMarkets,derivativesVenues,microstructureVenues`.
- Produces provider-health entries with independent live/degraded/down state per deep provider.

- [ ] **Step 1: Extend API verification before implementation**

Add assertions to `scripts/verify-altcoin-flow-api.js` using `_buildFrom` and a new exported `_selectDeepCandidates`:

```js
assert(Array.isArray(p.derivativesFlows));
assert(Array.isArray(p.microstructureFlows));
assert('derivativesMarkets' in p.coverage);
assert('microstructureMarkets' in p.coverage);
const picked=api._selectDeepCandidates({coinFlows:[
  {baseAsset:'AAA',signal:'PRE-SURGE',anomalyScore:80,confidence:80},
  {baseAsset:'BBB',signal:'WATCH',anomalyScore:10,confidence:20}
],dexFlows:[],cexFlows:[],limit:40});
assert(picked.includes('AAA'));
assert.strictEqual(picked.includes('BBB'),false);
```

Also verify old fields `updatedAt,stale,providerHealth,dexFlows,cexFlows,tokenFlows,themeFlows,coinFlows,coinFlowCoverage,coverage,confidence` still exist.

- [ ] **Step 2: Run API test and confirm failure**

Run: `node scripts/verify-altcoin-flow-api.js`
Expected: FAIL because deep-evidence fields/select function are absent.

- [ ] **Step 3: Implement stage-1 candidate selection**

Use existing `coinFlows`, DEX 5m activity, CEX breadth, and anomaly/confidence. Default cap is exactly 40. Exclude stablecoins/BTC/ETH from alt-only deep candidate priority, and exclude low-confidence WATCH-only assets unless DEX/CEX volume evidence is materially non-empty.

- [ ] **Step 4: Add bounded provider collectors**

Add internal helpers for Binance, Bybit, and OKX public derivatives/microstructure lookups. Use `Promise.allSettled`, bounded batches/concurrency, per-request abort timeout, short-lived cache, and independent health states. Do not throw the full endpoint when a provider fails. Normalize all successful responses through the new modules before aggregation.

- [ ] **Step 5: Add rolling OI/funding history**

Maintain bounded in-memory maps keyed by `venue:baseAsset`; retain only the samples needed for 5m/15m deltas plus a small safety margin. Prune stale assets and cap total keys to avoid unbounded growth.

- [ ] **Step 6: Extend `_buildFrom` and the public response**

Accept optional `derivativesFlows=[]` and `microstructureFlows=[]`; pass them into anomaly construction and return them in the response. Extend `coverage` without deleting or renaming existing keys.

- [ ] **Step 7: Run API tests**

Run: `node scripts/verify-altcoin-flow-api.js`
Expected: `altcoin flow api PASS`.

- [ ] **Step 8: Commit**

```bash
git add api/market-flow.js scripts/verify-altcoin-flow-api.js
git commit -m "feat: collect deep public market evidence"
```

---

### Task 4: Evidence aggregation and false-positive gates

**Files:**
- Modify: `lib/market-flow/coin-anomaly.js`
- Create: `scripts/verify-altcoin-evidence-gates.js`

**Interfaces:**
- Consumes new input arrays `derivativesFlows` and `microstructureFlows`.
- Produces per-coin fields: `openInterestChange5m,openInterestChange15m,fundingRate,fundingCrowdingScore,longShortRatio,takerBuySellRatio,bookImbalance,topSpreadBps,tradeImbalance,derivativesVenueBreadth,evidenceCount,sourceFamilyCount,derivativesConfirmed,microstructureConfirmed,crowdingRisk,freshnessMs`.

- [ ] **Step 1: Write gate tests first**

```js
const assert=require('assert');
const {buildCoinFlows}=require('../lib/market-flow/coin-anomaly');
const base={dexFlows:[],cexFlows:[{baseAsset:'AAA',venue:'Binance',marketType:'spot',quoteVolumeUsd:1000000}],liveRows:[{baseAsset:'AAA',marketType:'spot',venue:'Binance',change1m:.5,change5m:1,volumeDelta1m:500000,volumeDelta5m:900000}],historyByAsset:{AAA:{volume1m:[100000,120000,110000],volume5m:[300000,320000,310000]}},onchainByAsset:{},themeForAsset:()=> 'Other / Unclassified'};
const oiOnly=buildCoinFlows({...base,derivativesFlows:[{baseAsset:'AAA',venue:'Binance',openInterestChange5m:.8,confidence:90,freshnessMs:1000}],microstructureFlows:[]})[0];
assert(!['PRE-SURGE','SURGE'].includes(oiOnly.signal));
const bookOnly=buildCoinFlows({...base,derivativesFlows:[],microstructureFlows:[{baseAsset:'AAA',venue:'Binance',bookImbalance:.9,confidence:90,freshnessMs:1000}]})[0];
assert(!['PRE-SURGE','SURGE'].includes(bookOnly.signal));
const confirmed=buildCoinFlows({...base,dexFlows:[{baseAsset:'AAA',venue:'raydium',volume5mUsd:300000,volume1hUsd:600000,buys5m:80,sells5m:20,liquidityUsd:500000}],derivativesFlows:[{baseAsset:'AAA',venue:'Binance',openInterestChange5m:.35,takerBuySellRatio:1.5,fundingRate:.0004,confidence:90,freshnessMs:1000}],microstructureFlows:[{baseAsset:'AAA',venue:'Binance',bookImbalance:.35,tradeImbalance:.4,topSpreadBps:4,confidence:90,freshnessMs:1000}]})[0];
assert(confirmed.evidenceCount>=3);
assert(confirmed.sourceFamilyCount>=2);
assert(['WATCH','PRE-SURGE','SURGE','RISK'].includes(confirmed.signal));
const stale=buildCoinFlows({...base,derivativesFlows:[{baseAsset:'AAA',venue:'Binance',openInterestChange5m:5,confidence:100,freshnessMs:999999}],microstructureFlows:[]})[0];
assert.strictEqual(stale.derivativesConfirmed,false);
console.log('altcoin evidence gates PASS');
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node scripts/verify-altcoin-evidence-gates.js`
Expected: FAIL because the new fields/gates do not exist.

- [ ] **Step 3: Aggregate derivatives evidence per asset**

Use confidence/freshness-weighted finite records only. Derivatives source family contributes at most one family regardless of venue count. Venue breadth is still exposed separately. Funding/long-short contribute crowding/risk, while OI and taker imbalance contribute activity evidence.

- [ ] **Step 4: Aggregate microstructure evidence per asset**

Use bounded confidence/freshness weighting for `bookImbalance`, `tradeImbalance`, and `topSpreadBps`. Treat thin/very wide books as risk evidence, not positive activity confirmation.

- [ ] **Step 5: Enforce exact signal gates**

PRE-SURGE: `evidenceCount >= 3 && sourceFamilyCount >= 2 && anomalyScore >= 60`, with at least one non-crowding activity dimension.

SURGE: `evidenceCount >= 4 && sourceFamilyCount >= 3 && anomalyScore >= 78 && hasPriceChange && !muted`, with at least one short-window volume/participation activity dimension.

RISK may override when extreme crowding, very wide spread/thin depth, low-quality data, or severe liquidity drop is detected.

- [ ] **Step 6: Run core and gate tests**

Run: `node scripts/verify-altcoin-flow-core.js && node scripts/verify-altcoin-evidence-gates.js`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/market-flow/coin-anomaly.js scripts/verify-altcoin-evidence-gates.js
git commit -m "feat: add multi-source anomaly evidence gates"
```

---

### Task 5: ALTCOIN FLOW RADAR evidence UI

**Files:**
- Modify: `ui/radar-altcoin-flow.js`
- Modify: `ui/radar-altcoin-flow.css`
- Modify: `radar.html`
- Modify: `scripts/verify-radar-altcoin-flow-ui.js`

**Interfaces:**
- Consumes per-coin evidence fields from Task 4.
- Produces top summary counts: derivatives-confirmed, order-book-confirmed, 3+ source-family confirmed, crowding-risk.
- Produces detail labels for OI 5m/15m, Funding, Taker ratio, Book imbalance, Spread bps, derivatives breadth, evidence/source-family count, freshness.

- [ ] **Step 1: Extend UI verification before UI code**

Add assertions that `radar.html` and `ui/radar-altcoin-flow.js` contain neutral labels `OI 5m`, `OI 15m`, `Funding`, `Taker`, `Book`, `Spread`, `소스 패밀리`, `교차확인`, and no user-facing `매수 추천`, `상승 확정`, or `급등 확정` strings.

- [ ] **Step 2: Run the UI test and confirm failure**

Run: `node scripts/verify-radar-altcoin-flow-ui.js`
Expected: FAIL on missing evidence labels/summary containers.

- [ ] **Step 3: Add summary counters to `radar.html`**

Add a compact summary strip inside `#altcoinFlow` with four counters and stable IDs:

```html
<b id="altDerivConfirmed">0</b>
<b id="altBookConfirmed">0</b>
<b id="altMultiConfirmed">0</b>
<b id="altCrowdingRisk">0</b>
```

Include Korean neutral labels next to each count.

- [ ] **Step 4: Render evidence details null-safely**

In `ui/radar-altcoin-flow.js`, add formatters that display unavailable values as `-`, never `0`. Render OI deltas as percentages only when finite, funding as rate, taker ratio as `x`, book/trade imbalance as signed percentage, spread as bps, and freshness as seconds/minutes old.

- [ ] **Step 5: Render summary counts**

Count only current displayed/fresh rows according to the server evidence flags. `3+ source-family confirmed` means `sourceFamilyCount >= 3`; crowding risk means the explicit `crowdingRisk` field.

- [ ] **Step 6: Add responsive CSS**

Keep the existing four-column compact mobile row. Put deep evidence under the existing `<details>` block and make the summary strip wrap without horizontal overflow at `max-width:760px`.

- [ ] **Step 7: Run the UI test**

Run: `node scripts/verify-radar-altcoin-flow-ui.js`
Expected: `radar altcoin flow ui PASS`.

- [ ] **Step 8: Commit**

```bash
git add radar.html ui/radar-altcoin-flow.js ui/radar-altcoin-flow.css scripts/verify-radar-altcoin-flow-ui.js
git commit -m "feat: show derivatives and book confirmations"
```

---

### Task 6: Reliability, partial failure, and package verification wiring

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-altcoin-flow-api.js`
- Modify: `.github/workflows/foundation-verify.yml` only if needed.

**Interfaces:**
- Adds npm scripts `test:market-flow-derivatives`, `test:market-flow-microstructure`, `test:altcoin-evidence-gates`.
- Includes all three in `test:radar` before UI/API integration tests.

- [ ] **Step 1: Add package test entries**

Add exactly:

```json
"test:market-flow-derivatives": "node scripts/verify-market-flow-derivatives.js",
"test:market-flow-microstructure": "node scripts/verify-market-flow-microstructure.js",
"test:altcoin-evidence-gates": "node scripts/verify-altcoin-evidence-gates.js"
```

and insert them into the `test:radar` chain.

- [ ] **Step 2: Add partial-failure API test**

Expose a pure helper or injectable collector path in `api/market-flow.js` so the test can verify one rejected deep-provider promise still returns HTTP-compatible payload with successful evidence from another provider and marks only the failed provider degraded/down.

- [ ] **Step 3: Run focused verification**

Run: `npm run test:market-flow-derivatives && npm run test:market-flow-microstructure && npm run test:altcoin-evidence-gates && npm run test:altcoin-flow-api && npm run test:radar-altcoin-flow-ui`
Expected: all PASS.

- [ ] **Step 4: Confirm CI path filters**

Read `.github/workflows/foundation-verify.yml`. If `lib/**`, `api/**`, `ui/**`, `scripts/**`, `radar.html`, and `package.json` already trigger the workflow, make no change. Otherwise add only the missing path filters.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/verify-altcoin-flow-api.js .github/workflows/foundation-verify.yml
git commit -m "test: add derivatives radar quality gates"
```

---

### Task 7: Full regression verification and PR

**Files:**
- No product-code changes unless a failing regression requires a separate TDD fix.

**Interfaces:**
- Final branch must preserve every existing verification target and pass the new ones.

- [ ] **Step 1: Run full repository verification**

Run: `npm run verify`
Expected: exit code 0 and every radar/foundation/calibration/release gate reports PASS.

- [ ] **Step 2: Inspect branch diff for safety invariants**

Confirm no private keys/API secrets, no trading execution endpoint, no removed backward-compatible API field, no missing-value-to-zero coercion in new evidence fields, and no directional recommendation copy.

- [ ] **Step 3: Open PR from `feat/derivatives-microstructure-radar` to `main`**

PR title: `feat: add derivatives and microstructure radar evidence`

PR body must summarize: public-only data, candidate-first cap 40, independent source-family gates, null/stale handling, partial-provider degradation, and full verification result.

- [ ] **Step 4: Wait for GitHub Actions and verify success**

Fetch the workflow run for the final head SHA and confirm `verify` job conclusion is `success`.

- [ ] **Step 5: Merge only the verified head SHA**

Use the PR merge action with `expected_head_sha` equal to the verified branch head.

- [ ] **Step 6: Verify `main` CI**

Fetch the workflow run for the merge commit and confirm conclusion `success`.

---

### Task 8: Production deployment verification

**Files:**
- No source changes.

**Interfaces:**
- Production site: `pulseradar-pro-v3-temp`.
- Required production functions remain `api-index`, `market-flow`, `onchain-flow`, and `radar`.

- [ ] **Step 1: Fetch current Netlify production deploy**

Verify `state=ready`, `context=production`, `branch=main`, and `commit_ref` equals the merge commit from Task 7.

- [ ] **Step 2: Verify deployed functions**

Confirm available functions include `api-index`, `market-flow`, `onchain-flow`, and `radar`.

- [ ] **Step 3: Verify the production radar URL**

Confirm the production alias is `https://pulseradar-pro-v3-temp.netlify.app` and the radar route remains `/radar`.

- [ ] **Step 4: Final completion report**

Report only verified results: merge commit, CI PASS, Netlify READY, production radar URL, and the major delivered capabilities. Do not claim a percentage-based reliability or prediction accuracy unless measured by a dedicated historical validation dataset.

---

## Self-Review

- Spec coverage: derivatives normalization, microstructure normalization, candidate-first collection, evidence/source-family gates, risk safeguards, history/baselines, reliability/partial failure, API extension, UI fields, mobile state, backward compatibility, full CI, PR merge, and Netlify verification are each mapped to Tasks 1–8.
- Placeholder scan: no TBD/TODO/implement-later placeholders remain.
- Type consistency: API evidence fields and UI names use the exact normalized properties defined in Tasks 1–4; source-family/evidence counters are defined before UI consumption.
- Scope safety: no execution, leverage control, wallet signing, or personalized trading recommendation is introduced.

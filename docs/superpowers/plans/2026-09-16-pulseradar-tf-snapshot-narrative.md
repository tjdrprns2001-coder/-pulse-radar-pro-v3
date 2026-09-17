# PulseRadar TF Snapshot + Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `snapshot-analysis.html` flow so `15m`, `1h`, `4h`, and `1d` each produce a synchronized chart snapshot, structural scenario model, Korean narrative, and optional derivatives Flow summary without inventing unsupported levels.

**Architecture:** Keep `snapshot-analysis.html` as the canonical route, move orchestration into `ui/snapshot/snapshot-analysis.js`, and split analytical responsibilities into focused modules under `lib/analysis/`. Existing Structure/SMC/Liquidity/ICT outputs stay authoritative; the new feature only composes, filters, and renders them. Milestone 3.3 annotation/collision logic remains the final visibility gate for chart annotations.

**Tech Stack:** Vanilla JavaScript, browser DOM/canvas, existing PulseRadar APIs/modules, Node `node:test`, GitHub Actions, Vercel Preview.

**Spec:** `docs/superpowers/specs/2026-09-16-pulseradar-tf-snapshot-narrative-design.md`

## Global Constraints

- Supported selected timeframes are exactly `15m`, `1h`, `4h`, and `1d` in v1.
- The selected timeframe is always the primary analytical frame; HTF data is context only.
- No synthetic structure event, interest zone, invalidation level, or target may be invented to fill UI fields.
- Existing Structure/SMC/Liquidity/ICT outputs are authoritative and must be reused rather than redefined.
- Flow data is optional and must fail independently from snapshot/narrative rendering.
- Maximum displayed structural targets: 3.
- Default validation for scenario invalidation is selected-timeframe close, not wick touch.
- 390px mobile viewport must not horizontally overflow.
- Preview screenshot/manual review is required before merge.
- Automatic order placement, personalized sizing, recommendation scoring, Telegram delivery, image export/share, and simultaneous four-TF narrative cards are out of scope.

---

## File Structure

- Modify: `snapshot-analysis.html` — page shell only; load external snapshot modules, expose stable DOM targets, remove duplicated inline analysis logic as each module migrates.
- Create: `ui/snapshot/snapshot-analysis.js` — selected symbol/TF state, API orchestration, module composition, DOM rendering, isolated loading/error states.
- Create: `lib/analysis/tf-analysis-engine.js` — selected-TF scenario composition from authoritative source objects.
- Create: `lib/analysis/snapshot-builder.js` — curated chart overlay display model and annotation candidate generation.
- Create: `lib/analysis/flow-summary-engine.js` — normalize optional OI/Funding/Taker/volume/CVD inputs.
- Create: `lib/analysis/narrative-renderer.js` — source-backed Korean narrative generation.
- Create: `tests/tf-analysis-engine.test.js`
- Create: `tests/snapshot-builder.test.js`
- Create: `tests/flow-summary-engine.test.js`
- Create: `tests/narrative-renderer.test.js`
- Create: `tests/snapshot-analysis-ui-contract.test.js`
- Modify: `scripts/verify-milestone3-3.js` — add all new tests so the existing CI gate covers this milestone extension.
- Modify: `RELEASE_CHECKLIST.md` — add TF snapshot manual verification gates.

---

### Task 1: Lock the selected-timeframe scenario contract

**Files:**
- Create: `tests/tf-analysis-engine.test.js`
- Create: `lib/analysis/tf-analysis-engine.js`

**Interfaces:**
- Consumes: `buildTfScenario({symbol, tf, candles, structure, smc, liquidity, ictContext, htfContext, currentPrice})`
- Produces: `{symbol, tf, status, bias, confidence, interestZone, invalidation, targets, confirmations, warnings, htfConflict, sourceIds}`

- [ ] **Step 1: Write failing contract tests**

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildTfScenario}=require('../lib/analysis/tf-analysis-engine.js');

test('selected timeframe stays authoritative when HTF conflicts',()=>{
  const out=buildTfScenario({
    symbol:'JUPUSDT', tf:'15m', currentPrice:0.24,
    candles:[{close:0.24}],
    structure:{bias:'bearish',sourceIds:['s-15m']},
    smc:{zones:[]}, liquidity:{levels:[]}, ictContext:null,
    htfContext:{bias:'bullish',sourceIds:['s-4h']}
  });
  assert.equal(out.tf,'15m');
  assert.equal(out.bias,'bearish');
  assert.equal(out.htfConflict,true);
});

test('does not synthesize zone invalidation or targets when sources are absent',()=>{
  const out=buildTfScenario({symbol:'JUPUSDT',tf:'4h',currentPrice:0.24,candles:[{close:0.24}],structure:{bias:'neutral',sourceIds:[]},smc:{zones:[]},liquidity:{levels:[]},ictContext:null,htfContext:null});
  assert.equal(out.interestZone,null);
  assert.equal(out.invalidation,null);
  assert.deepEqual(out.targets,[]);
});
```

- [ ] **Step 2: Run to verify RED**

Run: `node --test tests/tf-analysis-engine.test.js`
Expected: FAIL because module/function does not exist.

- [ ] **Step 3: Implement the minimal scenario builder**

```js
function buildTfScenario(input){
  const bias=input.structure?.bias||'neutral';
  const htfBias=input.htfContext?.bias||null;
  return {
    symbol:input.symbol,
    tf:input.tf,
    status:'confirmed',
    bias,
    confidence:bias==='neutral'?'low':'medium',
    interestZone:null,
    invalidation:null,
    targets:[],
    confirmations:[],
    warnings:[],
    htfConflict:Boolean(htfBias&&bias!=='neutral'&&htfBias!==bias),
    sourceIds:[...(input.structure?.sourceIds||[])]
  };
}
module.exports={buildTfScenario};
```

- [ ] **Step 4: Run test GREEN**

Run: `node --test tests/tf-analysis-engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/tf-analysis-engine.test.js lib/analysis/tf-analysis-engine.js
git commit -m "feat: add selected timeframe scenario contract"
```

---

### Task 2: Add source-backed interest zone, invalidation, and targets

**Files:**
- Modify: `tests/tf-analysis-engine.test.js`
- Modify: `lib/analysis/tf-analysis-engine.js`

**Interfaces:**
- Interest-zone candidates: `{low, high, side, type, active, sourceId, confluenceScore?}`
- Invalidation candidates: `{price, side, kind, confirmed, sourceId}`
- Target candidates: `{price, type, side, active, sourceId}`

- [ ] **Step 1: Add failing tests for real-source selection and de-duplication**

```js
test('uses active source-backed zone and preserves source ids',()=>{
  const out=buildTfScenario({symbol:'JUPUSDT',tf:'4h',currentPrice:0.2467,candles:[{close:0.2467}],structure:{bias:'bearish',sourceIds:['st']},smc:{zones:[{low:0.252,high:0.256,side:'bearish',type:'OB',active:true,sourceId:'ob-1'}]},liquidity:{levels:[{price:0.2294,type:'EQL',side:'sell',active:true,sourceId:'liq-1'},{price:0.2295,type:'swing-low',side:'sell',active:true,sourceId:'liq-2'}]},ictContext:{invalidationCandidates:[{price:0.2565,side:'bearish',kind:'swing-high',confirmed:true,sourceId:'inv-1'}]},htfContext:null});
  assert.deepEqual(out.interestZone,{low:0.252,high:0.256,side:'bearish',sourceId:'ob-1',type:'OB'});
  assert.equal(out.invalidation.price,0.2565);
  assert.equal(out.targets.length,1);
  assert.equal(out.targets[0].sourceId,'liq-1');
  assert.ok(out.sourceIds.includes('ob-1'));
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/tf-analysis-engine.test.js`
Expected: FAIL on missing zone/target/invalidation selection.

- [ ] **Step 3: Implement candidate filtering**

Implementation rules:
- reject `active:false` zones/targets;
- bearish scenario prefers bearish zone above current price; bullish prefers bullish zone below current price;
- invalidation uses first confirmed candidate matching scenario side;
- target direction: bearish => prices below current price, bullish => prices above;
- sort target candidates by absolute distance from current price;
- merge targets within `0.15%` of price, preserving the first higher-priority candidate;
- keep at most three targets;
- append all selected `sourceId` values to `sourceIds` without duplicates.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/tf-analysis-engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/tf-analysis-engine.test.js lib/analysis/tf-analysis-engine.js
git commit -m "feat: derive structural scenario levels from source objects"
```

---

### Task 3: Build curated snapshot overlays through the 3.3 annotation policy

**Files:**
- Create: `tests/snapshot-builder.test.js`
- Create: `lib/analysis/snapshot-builder.js`

**Interfaces:**
- Consumes: `buildSnapshotModel({tf, candles, structure, smc, liquidity, scenario, viewportLevel})`
- Produces: `{tf, candles, overlays, annotations}`
- Every annotation: `{type, category, priority, barIndex, price, side, collisionGroup, allowOffset, maxOffset, viewportLevel, tf, sourceId}`

- [ ] **Step 1: Write failing tests**

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSnapshotModel}=require('../lib/analysis/snapshot-builder.js');

test('keeps selected tf and preserves source ids on overlays',()=>{
  const out=buildSnapshotModel({tf:'1h',candles:[{close:1}],structure:{annotations:[{type:'MSS',barIndex:0,price:1,sourceId:'mss-1'}]},smc:{zones:[]},liquidity:{annotations:[]},scenario:{interestZone:null,invalidation:null,targets:[]},viewportLevel:'focused'});
  assert.equal(out.tf,'1h');
  assert.equal(out.annotations[0].sourceId,'mss-1');
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/snapshot-builder.test.js`
Expected: FAIL because builder does not exist.

- [ ] **Step 3: Implement builder with curated budgets**

Use the spec budgets before final layout:
- Structure max 3
- Sweep/Grab max 2
- EQH/EQL max 2
- FVG/OB max 2
- interest zone 1
- invalidation 1
- targets max 3

Map candidates to the existing Milestone 3.3 annotation shape and call the repository's annotation layout/policy function instead of inventing a parallel collision algorithm.

- [ ] **Step 4: Run GREEN plus existing annotation regressions**

Run: `node --test tests/snapshot-builder.test.js tests/annotation-layout.test.js tests/annotation-regression-fixtures.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/snapshot-builder.test.js lib/analysis/snapshot-builder.js
git commit -m "feat: build curated timeframe snapshot overlays"
```

---

### Task 4: Add deterministic Korean narrative generation

**Files:**
- Create: `tests/narrative-renderer.test.js`
- Create: `lib/analysis/narrative-renderer.js`

**Interfaces:**
- Consumes: `renderNarrative({symbol, tf, scenario, htfContext, btcContext})`
- Produces: `{title, lines}` where `lines` is an array of Korean strings.

- [ ] **Step 1: Write failing tests for TF wording and unsupported price prevention**

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderNarrative}=require('../lib/analysis/narrative-renderer.js');

test('names selected timeframe and only prints scenario prices',()=>{
  const out=renderNarrative({symbol:'JUPUSDT',tf:'4h',scenario:{bias:'bearish',confidence:'medium',interestZone:{low:0.252,high:0.256},invalidation:{price:0.2565},targets:[{price:0.2294}],htfConflict:false,warnings:[]},htfContext:null,btcContext:null});
  const text=[out.title,...out.lines].join(' ');
  assert.match(text,/4시간봉/);
  assert.match(text,/0\.2565/);
  assert.match(text,/0\.2294/);
  assert.doesNotMatch(text,/0\.2050/);
});

test('uses unconfirmed wording when levels are absent',()=>{
  const out=renderNarrative({symbol:'JUPUSDT',tf:'15m',scenario:{bias:'neutral',confidence:'low',interestZone:null,invalidation:null,targets:[],htfConflict:false,warnings:[]},htfContext:null,btcContext:null});
  assert.match(out.lines.join(' '),/미확정|부족|확인/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/narrative-renderer.test.js`
Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement deterministic templates**

Required TF labels:
- `15m` => `15분봉`
- `1h` => `1시간봉`
- `4h` => `4시간봉`
- `1d` => `일봉`

Generate lines in this order when data exists: structure → preservation/change condition → interest zone → targets → invalidation → HTF conflict/alignment → verified BTC context. Never use certainty language such as `확실히 상승/하락`.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/narrative-renderer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/narrative-renderer.test.js lib/analysis/narrative-renderer.js
git commit -m "feat: render source-backed timeframe narratives"
```

---

### Task 5: Normalize optional Flow data with isolated degradation

**Files:**
- Create: `tests/flow-summary-engine.test.js`
- Create: `lib/analysis/flow-summary-engine.js`

**Interfaces:**
- Consumes: `summarizeFlow({oi, oi24h, funding, takerRatio, volumeImpulse, cvdBias})`
- Produces: `{available, oi, oiChange24h, funding, takerRatio, volumeImpulse, cvdBias, text}`

- [ ] **Step 1: Write failing partial-data test**

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeFlow}=require('../lib/analysis/flow-summary-engine.js');

test('keeps available flow values when CVD is unavailable',()=>{
  const out=summarizeFlow({oi:15000000,oi24h:9.1,funding:-0.0016,takerRatio:0.82,cvdBias:null});
  assert.equal(out.available,true);
  assert.match(out.text,/OI/);
  assert.match(out.text,/funding/);
  assert.match(out.text,/taker/);
  assert.doesNotMatch(out.text,/CVD/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/flow-summary-engine.test.js`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement normalization**

Rules:
- `available=false` only when every supported field is null/undefined/non-finite;
- format OI using compact USD;
- treat funding input as percentage-point value and preserve its sign;
- omit unavailable fields rather than throwing;
- include CVD only when explicitly supplied.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/flow-summary-engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/flow-summary-engine.test.js lib/analysis/flow-summary-engine.js
git commit -m "feat: add degradable derivatives flow summary"
```

---

### Task 6: Externalize snapshot page orchestration and enforce TF synchronization

**Files:**
- Create: `tests/snapshot-analysis-ui-contract.test.js`
- Create: `ui/snapshot/snapshot-analysis.js`
- Modify: `snapshot-analysis.html`

**Interfaces:**
- Page state: `{symbol, tf, requestId, status}`
- Orchestration function: `runSnapshotAnalysis({symbol, tf})`
- Rendering functions: `renderSnapshot(model)`, `renderScenario(scenario)`, `renderNarrativeBlock(narrative)`, `renderFlow(flow)`

- [ ] **Step 1: Write failing DOM/TF contract tests**

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('snapshot-analysis.html','utf8');
const js=fs.readFileSync('ui/snapshot/snapshot-analysis.js','utf8');

test('snapshot page exposes all four supported timeframe controls',()=>{
  for(const tf of ['15m','1h','4h','1d']) assert.match(html,new RegExp(`data-tf=["']${tf}["']`));
});

test('orchestrator uses selected tf for primary API request and result model',()=>{
  assert.match(js,/runSnapshotAnalysis/);
  assert.match(js,/selectedTf|state\.tf|tf/);
  assert.doesNotMatch(js,/primaryTf\s*=\s*['"]4h['"]/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/snapshot-analysis-ui-contract.test.js`
Expected: FAIL because external orchestrator file does not exist yet.

- [ ] **Step 3: Move orchestration out of inline HTML**

Implement:
- clicking a TF button updates one authoritative `state.tf`;
- the same `state.tf` is passed to candle/structure loading, `buildTfScenario`, `buildSnapshotModel`, and `renderNarrative`;
- stale requests are ignored using `requestId`;
- Flow and HTF context requests use `Promise.allSettled()` and cannot reject the primary selected-TF render;
- keep the existing route and user-facing controls.

- [ ] **Step 4: Run GREEN plus page contract**

Run: `node --test tests/snapshot-analysis-ui-contract.test.js tests/tf-analysis-engine.test.js tests/snapshot-builder.test.js tests/narrative-renderer.test.js tests/flow-summary-engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add snapshot-analysis.html ui/snapshot/snapshot-analysis.js tests/snapshot-analysis-ui-contract.test.js
git commit -m "feat: synchronize snapshot page to selected timeframe"
```

---

### Task 7: Add mobile narrative/Flow UI and isolated failure states

**Files:**
- Modify: `snapshot-analysis.html`
- Modify: `ui/snapshot/snapshot-analysis.js`
- Modify: `tests/snapshot-analysis-ui-contract.test.js`

**Interfaces:**
- Required DOM targets: `#snapshotNarrative`, `#snapshotFlow`, `#snapshotScenario`, `#snapshotContext`, `#snapshotStatus`

- [ ] **Step 1: Add failing UI tests**

```js
test('page contains dedicated narrative flow and failure-state containers',()=>{
  for(const id of ['snapshotNarrative','snapshotFlow','snapshotScenario','snapshotContext','snapshotStatus']){
    assert.match(html,new RegExp(`id=["']${id}["']`));
  }
});

test('mobile CSS prevents horizontal overflow',()=>{
  assert.match(html,/max-width:\s*650px|@media\s*\(max-width:\s*650px\)/);
  assert.match(html,/overflow-wrap|word-break|min-width:\s*0/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/snapshot-analysis-ui-contract.test.js`
Expected: FAIL for missing result containers/mobile contract.

- [ ] **Step 3: Implement responsive result cards**

Mobile order at <=650px must be controls → chart → narrative → Flow → supporting details. Flow failure renders `Flow 데이터 없음` inside `#snapshotFlow` while chart/narrative remain untouched. Missing zone/target/invalidation display `미확정`, not placeholder prices.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/snapshot-analysis-ui-contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add snapshot-analysis.html ui/snapshot/snapshot-analysis.js tests/snapshot-analysis-ui-contract.test.js
git commit -m "feat: add responsive snapshot narrative cards"
```

---

### Task 8: Add the new tests to the Milestone 3.3 verification gate

**Files:**
- Modify: `scripts/verify-milestone3-3.js`

**Interfaces:**
- Existing runner remains the single CI entry point used by `npm run verify`.

- [ ] **Step 1: Add the five new test files to the runner**

Add exactly:
```js
  'tests/tf-analysis-engine.test.js',
  'tests/snapshot-builder.test.js',
  'tests/narrative-renderer.test.js',
  'tests/flow-summary-engine.test.js',
  'tests/snapshot-analysis-ui-contract.test.js'
```

- [ ] **Step 2: Run the milestone gate**

Run: `npm run test:milestone3-3`
Expected: PASS with all existing and new test files.

- [ ] **Step 3: Run full verification**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-milestone3-3.js
git commit -m "ci: gate tf snapshot narrative feature"
```

---

### Task 9: Release checklist and Preview validation

**Files:**
- Modify: `RELEASE_CHECKLIST.md`

**Interfaces:**
- No code interface. This task defines the release gate for the feature branch.

- [ ] **Step 1: Add manual verification items**

Add checklist entries for:
- `15m`, `1h`, `4h`, `1d` each show matching chart title, candles, scenario, and narrative;
- no unsupported price appears in narrative;
- Flow failure leaves snapshot/narrative usable;
- 390px width has no horizontal overflow;
- Structure/SMC/Liquidity labels have no obvious overlap regression;
- selected-TF and HTF context are visually distinguished;
- Vercel Preview loads without white screen or console-blocking error.

- [ ] **Step 2: Run fresh full verification**

Run: `npm run verify`
Expected: PASS on the exact release candidate HEAD.

- [ ] **Step 3: Confirm GitHub Actions is green for the same HEAD**

Expected: `Foundation Verify` conclusion `success`.

- [ ] **Step 4: Confirm Vercel Preview succeeds for the same HEAD**

Expected: Vercel status `success` with a Preview URL. If build-rate-limit blocks deployment, stop here; do not merge.

- [ ] **Step 5: Perform manual Preview checks**

On desktop and 390px mobile, verify all four timeframes plus one Flow-unavailable case. Capture screenshots for the final visual review.

- [ ] **Step 6: Commit checklist update if not already committed**

```bash
git add RELEASE_CHECKLIST.md
git commit -m "docs: add tf snapshot narrative release gates"
```

---

## Self-Review Results

- Spec coverage: all v1 requirements map to Tasks 1–9.
- Placeholder scan: no `TBD`, `TODO`, vague “handle edge cases”, or undefined implementation steps remain.
- Type consistency: `buildTfScenario`, `buildSnapshotModel`, `renderNarrative`, and `summarizeFlow` signatures are used consistently across tasks.
- Scope remains v1-only: no order execution, trade sizing, recommendation scoring, Telegram, image export, or four-card simultaneous narrative view.

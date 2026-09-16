# PulseRadar Milestone 2 Unified Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a new Lightweight Charts 5.2.1 based canonical chart workspace with multi-pane support and a detachable plugin contract, while reusing existing `/api/structure` outputs and keeping the current canvas analysis page available as a fallback.

**Architecture:** Add a new `unified-chart.html` workspace rather than rewriting `technique-lab.html` in place. The new chart consumes the existing `/api/structure` endpoint for candle/structure/trendline data, renders candlesticks and indicator panes through Lightweight Charts 5.2.1, and loads Structure/Dante behavior through small plugins. The Milestone 1 shell points `analysis` to the new workspace only after deterministic contract tests pass; `technique-lab.html` remains reachable as the rollback path.

**Tech Stack:** Static HTML/CSS/JavaScript, Lightweight Charts 5.2.1 standalone browser build, Node.js built-in test runner/assertions, existing Vercel API routes.

**Spec:** `docs/superpowers/specs/2026-09-16-pulseradar-unified-analysis-v2-design.md`

## Global Constraints

- Pin Lightweight Charts to exact version `5.2.1`; do not use an unversioned CDN URL.
- Reuse `/api/structure`; do not rewrite structure detection formulas in Milestone 2.
- Keep `technique-lab.html` reachable as the legacy fallback throughout this milestone.
- Do not introduce SMC v2 definitions, confluence scoring, derivatives panes, Volume Profile, or alerts in Milestone 2.
- New chart plugins must not own global symbol/timeframe state.
- Plugin lifecycle interface is exactly `id`, `version`, `requiredData`, `mount(chartContext)`, `update(analysisState)`, `setVisible(bool)`, `dispose()`.
- Price/candlestick pane remains visually dominant.
- RSI, MACD, and Stochastic RSI use separate panes and may collapse via preset policy.
- Existing API contracts and existing calibration/release gates remain compatible.
- Mobile must not introduce a second product navigation shell or floating control that covers candles.

---

## File Structure for Milestone 2

Create:

- `unified-chart.html` — new chart-first analysis workspace and fallback affordance.
- `ui/chart/chart-core.js` — Lightweight Charts adapter, pane ownership, resize/crosshair handling, plugin host.
- `ui/chart/chart-data.js` — `/api/structure` fetch/normalization and deterministic indicator series helpers used only for rendering.
- `ui/chart/chart-plugins.js` — plugin registry and lifecycle validation.
- `ui/chart/plugins/structure-plugin.js` — canonical swing/event/trendline overlay adapter.
- `ui/chart/plugins/dante-plugin.js` — EMA 5/20/60/112/224/256/448 overlay adapter.
- `ui/chart/unified-chart.css` — chart workspace layout and mobile behavior.
- `tests/chart-core.test.js` — plugin host and lifecycle contract tests.
- `tests/chart-data.test.js` — candle normalization and EMA/indicator rendering helper tests.
- `tests/unified-chart-contract.test.js` — static contract tests for pinned library, fallback, panes, route, and no nested shell.
- `scripts/verify-milestone2.js` — Milestone 2 test gate.

Modify:

- `ui/pulse-shell.js` — point `analysis` at `/unified-chart.html`, preserving symbol/preset query state.
- `package.json` — add `test:chart` and include it in `verify` before calibration/release gates.
- `RELEASE_CHECKLIST.md` — add Milestone 2 chart parity checks.

---

### Task 1: Define chart migration contracts

**Files:**
- Create: `tests/unified-chart-contract.test.js`
- Create: `tests/chart-core.test.js`
- Create: `tests/chart-data.test.js`
- Create: `scripts/verify-milestone2.js`

**Interfaces:**
- Produces `node --test` contracts before production code exists.

- [ ] **Step 1: Write failing static workspace contract tests**

`tests/unified-chart-contract.test.js` must assert:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const shell = fs.readFileSync('ui/pulse-shell.js', 'utf8');
const legacy = fs.readFileSync('technique-lab.html', 'utf8');

function readUnified(){
  return fs.existsSync('unified-chart.html') ? fs.readFileSync('unified-chart.html', 'utf8') : '';
}

test('new workspace pins Lightweight Charts 5.2.1', () => {
  assert.match(readUnified(), /lightweight-charts@5\.2\.1/);
});

test('new workspace exposes legacy fallback', () => {
  assert.match(readUnified(), /technique-lab\.html/);
});

test('canonical analysis route moves to unified chart only after implementation', () => {
  assert.match(shell, /analysis:\{[^}]*path:'\/unified-chart\.html'/s);
});

test('legacy analysis page remains present', () => {
  assert.match(legacy, /PulseRadar/);
});
```

- [ ] **Step 2: Write failing plugin contract tests**

`tests/chart-core.test.js` must require `../ui/chart/chart-plugins` and verify:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginRegistry, validatePlugin } = require('../ui/chart/chart-plugins');

const plugin = {
  id:'structure', version:'1.0.0', requiredData:['candles','canonicalSwings'],
  mount(){}, update(){}, setVisible(){}, dispose(){}
};

test('valid plugin contract is accepted', () => assert.equal(validatePlugin(plugin), true));

test('plugin missing dispose is rejected', () => {
  const bad = {...plugin}; delete bad.dispose;
  assert.throws(() => validatePlugin(bad), /dispose/);
});

test('registry preserves insertion order and prevents duplicate ids', () => {
  const registry=createPluginRegistry();
  registry.register(plugin);
  assert.equal(registry.list()[0].id,'structure');
  assert.throws(()=>registry.register({...plugin}), /duplicate/i);
});
```

- [ ] **Step 3: Write failing data helper tests**

`tests/chart-data.test.js` must verify deterministic candle mapping and EMA output:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCandles, emaSeries } = require('../ui/chart/chart-data');

test('normalizes millisecond candle timestamps to Lightweight Charts seconds', () => {
  const out=normalizeCandles([{time:1700000000000,open:1,high:2,low:.5,close:1.5,volume:10}]);
  assert.deepEqual(out.candles[0], {time:1700000000,open:1,high:2,low:.5,close:1.5});
  assert.deepEqual(out.volume[0], {time:1700000000,value:10});
});

test('EMA helper uses canonical alpha 2/(period+1)', () => {
  const rows=[1,2,3,4].map((close,i)=>({time:1700000000000+i*60000,open:close,high:close,low:close,close,volume:1}));
  const out=emaSeries(rows,3);
  assert.deepEqual(out.map(x=>Number(x.value.toFixed(4))), [1,1.5,2.25,3.125]);
});
```

- [ ] **Step 4: Run tests and verify RED**

```bash
node --test tests/unified-chart-contract.test.js tests/chart-core.test.js tests/chart-data.test.js
```

Expected: FAIL because the new workspace/modules do not exist and the shell still points to the legacy page.

- [ ] **Step 5: Add verification runner**

Create `scripts/verify-milestone2.js`:

```js
const { spawnSync } = require('node:child_process');
const files = [
  'tests/unified-chart-contract.test.js',
  'tests/chart-core.test.js',
  'tests/chart-data.test.js'
];
const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
process.exit(r.status ?? 1);
```

- [ ] **Step 6: Commit red contracts**

```bash
git add tests/unified-chart-contract.test.js tests/chart-core.test.js tests/chart-data.test.js scripts/verify-milestone2.js
git commit -m "test: define Milestone 2 chart contracts"
```

---

### Task 2: Build deterministic chart data adapter

**Files:**
- Create: `ui/chart/chart-data.js`
- Test: `tests/chart-data.test.js`

**Interfaces:**
- Produces:
  - `normalizeCandles(rows): { candles, volume }`
  - `emaSeries(rows, period): Array<{time,value}>`
  - `rsiSeries(rows, period=14): Array<{time,value}>`
  - `macdSeries(rows, fast=12, slow=26, signal=9): { macd, signal, histogram }`
  - `stochRsiSeries(rows, rsiPeriod=14, stochPeriod=14, k=3, d=3): { k, d }`
  - `fetchStructure({symbol, interval, limit=500, fetchImpl=fetch}): Promise<object>`

- [ ] **Step 1: Implement normalization and EMA only**

Rules:
- Accept candle objects from `/api/structure` with millisecond `time`.
- Convert to integer Unix seconds for Lightweight Charts.
- Drop rows missing finite OHLC values.
- Preserve volume only when finite.
- EMA seed is first finite close and alpha is exactly `2/(period+1)`.

- [ ] **Step 2: Run chart-data tests**

```bash
node --test tests/chart-data.test.js
```

Expected: PASS for normalization/EMA tests.

- [ ] **Step 3: Add deterministic RSI/MACD/Stoch RSI tests before implementation**

Use a fixed 40-candle monotonically rising fixture and assert:
- RSI last value is finite and above 50.
- MACD, signal, and histogram end values are finite.
- Stoch RSI K/D contain finite values after warmup.
- Input rows are not mutated.

- [ ] **Step 4: Implement indicator helpers and `/api/structure` fetch**

`fetchStructure` must build:

```txt
/api/structure?symbol=<ENCODED>&interval=<ENCODED>&limit=<INTEGER>
```

and throw a descriptive error when HTTP status is not OK or response `ok` is false.

These helpers are rendering-only and must not feed or overwrite current scoring/calibration outputs.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
node --test tests/chart-data.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/chart/chart-data.js tests/chart-data.test.js
git commit -m "feat: add unified chart data adapter"
```

---

### Task 3: Build plugin registry and chart core

**Files:**
- Create: `ui/chart/chart-plugins.js`
- Create: `ui/chart/chart-core.js`
- Test: `tests/chart-core.test.js`

**Interfaces:**
- `createPluginRegistry()` returns `{register, mountAll, updateAll, setVisible, disposeAll, list}`.
- `createUnifiedChart({container, library, preset})` returns a `chartContext` with:
  - `chart`
  - `pricePane`
  - `candlesSeries`
  - `volumeSeries`
  - `indicatorPanes`
  - `series`
  - `setData(snapshot)`
  - `resize()`
  - `dispose()`

- [ ] **Step 1: Implement plugin contract validator and registry**

Validation must require all exact contract fields and reject duplicate ids.

- [ ] **Step 2: Run plugin contract tests**

```bash
node --test tests/chart-core.test.js
```

Expected: plugin tests PASS.

- [ ] **Step 3: Add chart-core tests with a fake Lightweight Charts library**

The fake library must verify that the core:
- creates one dominant price pane,
- creates candlestick and volume series,
- creates separate indicator panes only when requested by the preset,
- calls `remove()` or equivalent disposal exactly once.

No browser DOM implementation is required in Node tests; use dependency injection through the `library` argument.

- [ ] **Step 4: Implement chart core**

Use Lightweight Charts v5 API conventions:
- main candlestick series on price pane,
- volume histogram on price pane with its own price scale,
- RSI/MACD/Stoch RSI on independent panes,
- ResizeObserver in browser with a window-resize fallback,
- no global symbol/timeframe ownership.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
node --test tests/chart-core.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/chart/chart-plugins.js ui/chart/chart-core.js tests/chart-core.test.js
git commit -m "feat: add unified chart core and plugin host"
```

---

### Task 4: Add Structure and Dante renderer plugins

**Files:**
- Create: `ui/chart/plugins/structure-plugin.js`
- Create: `ui/chart/plugins/dante-plugin.js`
- Modify: `tests/chart-core.test.js`

**Interfaces:**
- Both plugins implement the exact plugin lifecycle contract.
- Structure plugin consumes existing API fields where present: `candles`, `canonicalSwings`, `events`, `trendlines`, `bias`.
- Dante plugin consumes normalized candles and uses `emaSeries()` for display-only EMA series.

- [ ] **Step 1: Add failing plugin-specific tests**

Structure plugin tests verify:
- no more than the preset rendering budget is emitted,
- absent optional fields produce no exception,
- `setVisible(false)` hides/removes its visual objects without mutating analysis data.

Dante plugin tests verify exact periods:

```txt
5, 20, 60, 112, 224, 256, 448
```

and that periods with insufficient history are skipped instead of fabricating values.

- [ ] **Step 2: Implement Structure plugin**

Render only visual translations of existing API data:
- swing markers,
- BOS/CHoCH event markers when provided,
- support/resistance trendline segments when provided.

Do not classify MSS/EQH/EQL or new SMC semantics in this milestone.

Apply `window.PulsePresets.prioritizeOverlays` when available for capped overlays; otherwise use the preset `maxZones` hard cap.

- [ ] **Step 3: Implement Dante plugin**

Render EMA lines for 5/20/60/112/224/256/448.

Visibility policy:
- `clean`: hidden
- `structure`: hidden
- `smc`: hidden
- `dante`: visible
- `full`: visible

Long EMA series must not render until enough candles exist for their period.

- [ ] **Step 4: Run plugin tests**

```bash
node --test tests/chart-core.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/chart/plugins/structure-plugin.js ui/chart/plugins/dante-plugin.js tests/chart-core.test.js
git commit -m "feat: add structure and Dante chart plugins"
```

---

### Task 5: Build the new Unified Chart workspace

**Files:**
- Create: `unified-chart.html`
- Create: `ui/chart/unified-chart.css`
- Modify: `tests/unified-chart-contract.test.js`

**Interfaces:**
- Query parameters: `symbol`, `preset`, `tf`, `shell`.
- Default timeframe: `1h`.
- Workspace emits `pulse:chart-ready` and `pulse:chart-error` browser events.

- [ ] **Step 1: Create semantic workspace markup**

Include:
- symbol input,
- timeframe selector `15m / 1h / 4h / 1d`,
- preset badge/current preset display,
- data-state badge,
- dominant `#unifiedChart` container,
- collapsible indicator pane controls,
- compact status line,
- explicit `기존 분석 화면` fallback link to `/technique-lab.html` preserving symbol and timeframe.

- [ ] **Step 2: Pin the standalone library**

Load exact version:

```html
<script src="https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js"></script>
```

Do not use `@latest`.

- [ ] **Step 3: Wire data and plugins**

Load modules in deterministic order:

```html
<script src="/ui/pulse-presets.js"></script>
<script src="/ui/pulse-data-state.js"></script>
<script src="/ui/chart/chart-data.js"></script>
<script src="/ui/chart/chart-plugins.js"></script>
<script src="/ui/chart/chart-core.js"></script>
<script src="/ui/chart/plugins/structure-plugin.js"></script>
<script src="/ui/chart/plugins/dante-plugin.js"></script>
```

On run:
1. fetch `/api/structure`,
2. normalize candles,
3. create/update chart core,
4. update registered plugins,
5. update data-state badge,
6. dispatch success/error event.

- [ ] **Step 4: Add browser fallback behavior**

If `window.LightweightCharts` is absent after script load, do not show a blank page. Show a visible error card with a working legacy link to `technique-lab.html` using the current symbol/timeframe.

- [ ] **Step 5: Implement mobile layout**

Requirements:
- chart height uses at least `62dvh` on phone widths,
- toolbar wraps without horizontal page scrolling,
- indicator pane controls are collapsible,
- no fixed floating button covers chart content,
- shell mode hides only the child page's own standalone header/fallback navigation, never the parent product shell.

- [ ] **Step 6: Run static contracts**

```bash
node --test tests/unified-chart-contract.test.js
```

Expected: pinned version/fallback/workspace tests PASS; shell-route test remains RED until Task 6.

- [ ] **Step 7: Commit**

```bash
git add unified-chart.html ui/chart/unified-chart.css tests/unified-chart-contract.test.js
git commit -m "feat: add Lightweight Charts unified workspace"
```

---

### Task 6: Promote the new workspace behind the canonical analysis route

**Files:**
- Modify: `ui/pulse-shell.js`
- Modify: `tests/unified-chart-contract.test.js`

**Interfaces:**
- `analysis.path` changes from `/technique-lab.html` to `/unified-chart.html`.
- Legacy page remains directly addressable.

- [ ] **Step 1: Update shell route**

Change only:

```js
analysis:{...,path:'/unified-chart.html'}
```

Preserve existing `symbol`, `preset`, and `shell=1` query propagation.

- [ ] **Step 2: Run contracts**

```bash
node --test tests/unified-chart-contract.test.js
```

Expected: PASS.

- [ ] **Step 3: Run Foundation regression tests**

```bash
npm run test:foundation
```

Expected: PASS with no shell/mobile regressions.

- [ ] **Step 4: Commit**

```bash
git add ui/pulse-shell.js tests/unified-chart-contract.test.js
git commit -m "feat: route canonical analysis to unified chart"
```

---

### Task 7: Add Milestone 2 release gate

**Files:**
- Modify: `package.json`
- Modify: `RELEASE_CHECKLIST.md`
- Modify: `.github/workflows/foundation-verify.yml`

**Interfaces:**
- Produces `npm run test:chart`.
- `npm run verify` sequence becomes chart tests → foundation tests → calibration → release gate.

- [ ] **Step 1: Update package scripts**

Preserve existing scripts and add:

```json
"test:chart": "node scripts/verify-milestone2.js",
"verify": "npm run test:chart && npm run test:foundation && npm run check:calibration && npm run gate:release"
```

- [ ] **Step 2: Update release checklist**

Add checks:

```md
- [ ] Unified Chart loads the pinned Lightweight Charts 5.2.1 build.
- [ ] BTCUSDT renders candles on 15m/1h/4h/1d.
- [ ] RSI/MACD/Stoch RSI render in separate panes when enabled.
- [ ] Structure plugin displays only existing API structure/trendline outputs.
- [ ] Dante preset exposes 5/20/60/112/224/256/448 EMA visuals without fabricating long-period values on short history.
- [ ] Legacy `/technique-lab.html` remains reachable as rollback.
- [ ] Library/API failure produces a visible fallback state, never a white screen.
```

- [ ] **Step 3: Run full repository verification**

```bash
npm run verify
```

Expected: zero failures.

- [ ] **Step 4: Commit**

```bash
git add package.json RELEASE_CHECKLIST.md .github/workflows/foundation-verify.yml
git commit -m "chore: gate releases on unified chart verification"
```

---

### Task 8: Preview, parity smoke test, and integration

**Files:**
- No production changes unless a verified defect is found.

- [ ] **Step 1: Confirm Vercel Preview success for the Milestone 2 head SHA**

Require Vercel status `success` before integration.

- [ ] **Step 2: Smoke test the new workspace**

Verify:

```txt
BTCUSDT 1h -> candles visible
BTCUSDT 15m/4h/1d -> timeframe reload works
Structure preset -> structure plugin visible, Dante hidden
Dante preset -> EMA plugin visible, SMC research features absent
Full preset -> indicator panes visible
Library failure path -> explicit fallback card/link
Mobile -> no duplicate shell and no chart-covering floating control
```

- [ ] **Step 3: Compare against legacy**

For the same symbol/timeframe, confirm:
- candle timestamps and OHLC values align,
- existing structure markers originate from `/api/structure`,
- legacy page remains reachable,
- no change was made to scoring/calibration formulas.

- [ ] **Step 4: Create PR and merge only after CI + Vercel are green**

Use the verified head SHA as `expected_head_sha` on merge.

---

## Milestone 2 Completion Gate

Milestone 2 is complete only when:

- `npm run test:chart` passes.
- `npm run test:foundation` still passes.
- `npm run verify` passes.
- Vercel preview for the exact head SHA is green.
- Canonical `analysis` route opens `unified-chart.html`.
- Candlesticks render through Lightweight Charts 5.2.1.
- RSI/MACD/Stoch RSI can occupy separate panes.
- Structure and Dante are detachable plugins.
- The existing structure engine is consumed rather than reimplemented.
- `technique-lab.html` remains available as fallback.
- A failed library/API load produces a visible recovery path rather than a blank page.

# PulseRadar Milestone 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the unified shell and mobile navigation, add chart/workspace presets with rendering budgets, and introduce a shared data-state model without changing existing analysis formulas.

**Architecture:** Keep the existing static/Vercel architecture. `pulse-unified.html` remains the canonical product shell, while production analysis pages keep their current calculation logic. New small shared modules own only presentation policy: presets, rendering-budget selection, and data-state metadata. Existing API contracts remain unchanged.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner/assertions, Vercel static hosting and rewrites.

**Spec:** `docs/superpowers/specs/2026-09-16-pulseradar-unified-analysis-v2-design.md`

## Global Constraints

- Preserve existing analytical scoring formulas during Milestone 1.
- Keep `pulse-unified.html` as the canonical shell.
- No duplicate navigation shell on mobile.
- No floating control may cover critical chart content on mobile.
- Presets are presentation preferences, not hidden trading logic.
- Rendering budgets must prioritize current/recent, higher-timeframe, higher-quality/reliability, unmitigated/active, and closer-to-price items in that order.
- Data states must distinguish `Live`, `Confirmed`, `Partial`, `Stale`, `Insufficient history`, and `API degraded`.
- Existing API response contracts must remain compatible.
- Legacy analysis routes remain reachable for rollback during migration.

---

## File Structure for Milestone 1

Create focused shared modules instead of enlarging already-large HTML files:

- `ui/pulse-presets.js` — preset definitions, rendering budgets, persistence, validation.
- `ui/pulse-data-state.js` — normalize and format shared data-state metadata.
- `ui/pulse-shell.css` — reusable shell/mobile/bottom-sheet styles for canonical shell.
- `ui/pulse-shell.js` — canonical navigation behavior, drawer state, iframe shell-mode handling, symbol/view persistence.
- `tests/pulse-presets.test.js` — deterministic preset and budget tests.
- `tests/pulse-data-state.test.js` — deterministic data-state tests.
- `tests/pulse-shell-contract.test.js` — static contract tests preventing duplicated shell/navigation regression.
- `scripts/verify-milestone1.js` — runs Milestone 1 contract checks and exits non-zero on failure.

Modify:

- `pulse-unified.html` — load shared shell CSS/JS; remove inline duplication where ownership moves to shared files; expose preset controls in canonical shell.
- `scanner-shell-v13.html` — retain the `shell=1` bypass and ensure nested-shell prevention remains explicit.
- `technique-lab.html` — accept preset/data-state context from query/localStorage without changing its analysis math.
- `package.json` — add `test:foundation` and include it in `verify`.
- `RELEASE_CHECKLIST.md` — add mobile shell/preset/data-state acceptance checks.

---

### Task 1: Add deterministic foundation test harness

**Files:**
- Create: `tests/pulse-shell-contract.test.js`
- Create: `scripts/verify-milestone1.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository HTML files and Node.js built-ins `fs`, `path`, `assert`.
- Produces: `npm run test:foundation`, a non-zero exit code on contract regression.

- [ ] **Step 1: Write the failing shell contract test**

Create `tests/pulse-shell-contract.test.js` with Node's built-in test runner. The first tests must assert:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const unified = fs.readFileSync('pulse-unified.html', 'utf8');
const scannerShell = fs.readFileSync('scanner-shell-v13.html', 'utf8');

test('canonical shell exposes exactly one mobile navigation container', () => {
  const matches = unified.match(/class="mobileNav"/g) || [];
  assert.equal(matches.length, 1);
});

test('scanner shell bypasses itself when embedded with shell=1', () => {
  assert.match(scannerShell, /q\.get\('shell'\)===['"]1['"]/);
  assert.match(scannerShell, /location\.replace\('\/index\.html'/);
});

test('canonical shell does not route scanner view through another product shell', () => {
  assert.doesNotMatch(unified, /scanner:\{[^}]*path:['"]\/scanner-shell-v13\.html['"]/s);
});
```

The third test intentionally fails against the current `pulse-unified.html` and defines the regression fix: the canonical shell must embed the scanner content directly rather than nest another product shell.

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/pulse-shell-contract.test.js
```

Expected: first two tests PASS, third test FAIL because the current scanner view points at `/scanner-shell-v13.html`.

- [ ] **Step 3: Add the Milestone 1 verification script**

Create `scripts/verify-milestone1.js`:

```js
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--test',
  'tests/pulse-shell-contract.test.js',
  'tests/pulse-presets.test.js',
  'tests/pulse-data-state.test.js'
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
```

At this point the latter two files do not exist yet, so do not wire this script into `verify` until Tasks 2 and 3 create them.

- [ ] **Step 4: Commit the red test harness**

```bash
git add tests/pulse-shell-contract.test.js scripts/verify-milestone1.js
git commit -m "test: define Milestone 1 shell contracts"
```

---

### Task 2: Introduce workspace preset and rendering-budget module

**Files:**
- Create: `ui/pulse-presets.js`
- Create: `tests/pulse-presets.test.js`

**Interfaces:**
- Produces:
  - `PRESETS: Record<string, Preset>`
  - `getPreset(id: string): Preset`
  - `savePreset(id: string, storage?: StorageLike): Preset`
  - `loadPreset(storage?: StorageLike): Preset`
  - `prioritizeOverlays(items: OverlayItem[], presetId: string, currentPrice?: number): OverlayItem[]`
- `Preset` fields:
  - `id`
  - `label`
  - `maxZones`
  - `plugins`
  - `panes`

- [ ] **Step 1: Write failing preset tests**

Create `tests/pulse-presets.test.js` using `node:test` and `node:assert/strict`.

The test file must verify the exact initial budgets:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRESETS,
  getPreset,
  prioritizeOverlays
} = require('../ui/pulse-presets');

test('initial presets expose agreed rendering budgets', () => {
  assert.equal(PRESETS.clean.maxZones, 3);
  assert.equal(PRESETS.structure.maxZones, 5);
  assert.equal(PRESETS.smc.maxZones, 8);
  assert.equal(PRESETS.full.maxZones, 15);
});

test('unknown preset falls back to clean', () => {
  assert.equal(getPreset('does-not-exist').id, 'clean');
});

test('overlay prioritization prefers active HTF recent quality zones within budget', () => {
  const items = [
    { id: 'old-ltf', timeframeMinutes: 15, quality: 90, state: 'active', recency: 1, distancePct: 0.2 },
    { id: 'htf', timeframeMinutes: 240, quality: 80, state: 'active', recency: 5, distancePct: 0.5 },
    { id: 'mitigated', timeframeMinutes: 240, quality: 99, state: 'mitigated', recency: 6, distancePct: 0.1 },
    { id: 'recent', timeframeMinutes: 60, quality: 88, state: 'active', recency: 10, distancePct: 0.4 }
  ];
  const result = prioritizeOverlays(items, 'clean');
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(x => x.id), ['recent', 'htf', 'old-ltf']);
});
```

- [ ] **Step 2: Run the preset tests and verify RED**

Run:

```bash
node --test tests/pulse-presets.test.js
```

Expected: FAIL because `ui/pulse-presets.js` does not exist.

- [ ] **Step 3: Implement the preset module**

Create `ui/pulse-presets.js` as a UMD-style module that works in both browser and Node tests.

Required initial presets:

```js
clean     => maxZones 3,  plugins ['structure'], panes []
structure => maxZones 5,  plugins ['structure'], panes []
smc       => maxZones 8,  plugins ['structure','smc'], panes []
dante     => maxZones 5,  plugins ['structure','dante'], panes []
full      => maxZones 15, plugins ['structure','smc','dante','pattern'], panes ['rsi','macd','stoch']
```

`prioritizeOverlays()` must produce a new array and never mutate its input. Sort precedence must implement the spec order by converting each item into a tuple in this sequence:

1. `recency` descending
2. `timeframeMinutes` descending
3. `quality` descending
4. active state before `approaching`, `touched`, `mitigated`, `violated`, `expired`
5. `distancePct` ascending

After sorting, slice to `preset.maxZones`.

`savePreset()` stores key `pulse_workspace_preset_v2`; `loadPreset()` falls back to `clean` when absent or invalid.

- [ ] **Step 4: Run tests and verify GREEN**

```bash
node --test tests/pulse-presets.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/pulse-presets.js tests/pulse-presets.test.js
git commit -m "feat: add workspace presets and rendering budgets"
```

---

### Task 3: Add shared data-state model

**Files:**
- Create: `ui/pulse-data-state.js`
- Create: `tests/pulse-data-state.test.js`

**Interfaces:**
- Produces:
  - `DATA_STATES`
  - `normalizeDataState(input): DataState`
  - `formatDataState(state): { label, severity, live }`
  - `deriveBarState({ nowMs, barCloseMs, fetchedAtMs, staleAfterMs, historyCount, requiredHistory }): DataState`

- [ ] **Step 1: Write failing data-state tests**

Create tests for these exact behaviors:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveBarState, normalizeDataState } = require('../ui/pulse-data-state');

test('insufficient history wins over live status', () => {
  assert.equal(deriveBarState({
    nowMs: 1000,
    barCloseMs: 900,
    fetchedAtMs: 990,
    staleAfterMs: 100,
    historyCount: 100,
    requiredHistory: 256
  }), 'insufficient-history');
});

test('open bar is partial', () => {
  assert.equal(deriveBarState({
    nowMs: 1000,
    barCloseMs: 1100,
    fetchedAtMs: 990,
    staleAfterMs: 100,
    historyCount: 300,
    requiredHistory: 256
  }), 'partial');
});

test('old fetch is stale', () => {
  assert.equal(deriveBarState({
    nowMs: 1000,
    barCloseMs: 900,
    fetchedAtMs: 700,
    staleAfterMs: 100,
    historyCount: 300,
    requiredHistory: 256
  }), 'stale');
});

test('unknown state normalizes to api-degraded', () => {
  assert.equal(normalizeDataState('mystery'), 'api-degraded');
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/pulse-data-state.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement the module**

Supported canonical state ids:

```txt
live
confirmed
partial
stale
insufficient-history
api-degraded
```

Precedence in `deriveBarState()`:

1. insufficient history
2. stale fetch
3. partial bar
4. confirmed bar

`formatDataState()` must map to Korean labels suitable for compact badges:

```txt
live -> 실시간
confirmed -> 확정
partial -> 미완성
stale -> 지연
insufficient-history -> 이력 부족
api-degraded -> API 저하
```

- [ ] **Step 4: Run and verify GREEN**

```bash
node --test tests/pulse-data-state.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/pulse-data-state.js tests/pulse-data-state.test.js
git commit -m "feat: add shared analysis data-state model"
```

---

### Task 4: Extract and stabilize the canonical product shell

**Files:**
- Create: `ui/pulse-shell.css`
- Create: `ui/pulse-shell.js`
- Modify: `pulse-unified.html`
- Modify: `scanner-shell-v13.html`
- Test: `tests/pulse-shell-contract.test.js`

**Interfaces:**
- Consumes: `window.PulsePresets`, query parameters `view`, `symbol`, `preset`, localStorage.
- Produces browser events:
  - `pulse:viewchange` detail `{ view }`
  - `pulse:symbolchange` detail `{ symbol }`
  - `pulse:presetchange` detail `{ preset }`

- [ ] **Step 1: Extend the failing shell contract tests**

Add assertions that `pulse-unified.html`:

```js
assert.match(unified, /ui\/pulse-shell\.css/);
assert.match(unified, /ui\/pulse-shell\.js/);
assert.match(unified, /ui\/pulse-presets\.js/);
assert.doesNotMatch(unified, /scanner-shell-v13\.html/);
```

Also assert the canonical mobile nav labels appear once each: `차트`, `MTF`, `구조`, `SMC`, `전체`.

Run:

```bash
node --test tests/pulse-shell-contract.test.js
```

Expected: FAIL until the shell extraction is implemented.

- [ ] **Step 2: Move canonical shell styling to `ui/pulse-shell.css`**

Extract the layout, sidebar, topbar, drawer, bottom navigation, safe-area handling, and mobile breakpoints from `pulse-unified.html` into the stylesheet.

Mobile requirements:

```css
.mobileNav {
  padding-bottom: env(safe-area-inset-bottom);
}
.frameWrap {
  min-height: 0;
  overflow: hidden;
}
```

No `.analysisDock` or other floating bottom-right control belongs in the canonical shell.

- [ ] **Step 3: Move shell behavior to `ui/pulse-shell.js`**

The new shell module must own:

- route/view registry
- symbol normalization
- query-state synchronization
- drawer open/close
- bottom navigation
- iframe source generation
- iframe shell-mode injection
- preset selection/persistence

The scanner route in the registry must be direct content:

```js
scanner: { path: '/index.html', ... }
```

not `/scanner-shell-v13.html`.

Shell-mode injection must hide duplicate child-page headers/nav only inside the iframe and must not inject another fixed/sticky navigation bar.

- [ ] **Step 4: Reduce `pulse-unified.html` to structure + shared assets**

Keep semantic markup for:

- sidebar
- topbar
- frame host
- mobile bottom navigation
- preset selector

Load assets in this order:

```html
<link rel="stylesheet" href="/ui/pulse-shell.css">
<script src="/ui/pulse-presets.js"></script>
<script src="/ui/pulse-data-state.js"></script>
<script src="/ui/pulse-shell.js" defer></script>
```

- [ ] **Step 5: Preserve the scanner-shell nested-shell guard**

Keep the current early `shell=1` redirect in `scanner-shell-v13.html`. Add one explanatory comment only; do not reintroduce nested-shell UI.

- [ ] **Step 6: Run shell contract tests**

```bash
node --test tests/pulse-shell-contract.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pulse-unified.html scanner-shell-v13.html ui/pulse-shell.css ui/pulse-shell.js tests/pulse-shell-contract.test.js
git commit -m "refactor: stabilize canonical unified shell"
```

---

### Task 5: Add preset propagation to the analysis workspace

**Files:**
- Modify: `technique-lab.html`
- Modify: `ui/pulse-shell.js`
- Test: `tests/pulse-shell-contract.test.js`

**Interfaces:**
- Query parameter: `preset=<clean|structure|smc|dante|full>`.
- Browser event inside child analysis page: `pulse:preset-applied` detail `{ preset }`.

- [ ] **Step 1: Add a failing contract test**

Read `technique-lab.html` and assert it contains the preset module include and reads a `preset` parameter:

```js
assert.match(technique, /ui\/pulse-presets\.js/);
assert.match(technique, /URLSearchParams\(location\.search\).*preset/s);
```

Run shell contract tests and confirm failure.

- [ ] **Step 2: Pass the preset through iframe URLs**

`srcFor(view)` in `ui/pulse-shell.js` must append both:

```txt
symbol=<normalized symbol>
preset=<active preset id>
```

- [ ] **Step 3: Apply preset defaults in `technique-lab.html` without changing math**

Map presentation only:

- `clean`: chart + critical structure; hide RSI/MACD/Stoch panes and SMC extras.
- `structure`: swing/BOS/CHoCH/trendline/support-resistance; hide SMC and Dante extras.
- `smc`: structure + liquidity/FVG/OB; hide Dante MA details unless explicitly enabled.
- `dante`: Dante moving averages + minimal structure context; hide SMC zones.
- `full`: existing complete diagnostics.

The implementation may toggle existing checkboxes/sections but must not change calculation formulas or API requests.

Dispatch:

```js
window.dispatchEvent(new CustomEvent('pulse:preset-applied', {
  detail: { preset: preset.id }
}));
```

- [ ] **Step 4: Verify contract tests**

```bash
node --test tests/pulse-shell-contract.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add technique-lab.html ui/pulse-shell.js tests/pulse-shell-contract.test.js
git commit -m "feat: propagate workspace presets into analysis"
```

---

### Task 6: Surface data-state badges without changing API contracts

**Files:**
- Modify: `technique-lab.html`
- Modify: `index.html`
- Test: `tests/pulse-data-state.test.js`
- Test: `tests/pulse-shell-contract.test.js`

**Interfaces:**
- Uses `window.PulseDataState`.
- UI badge attributes: `data-pulse-data-state="<state>"`.

- [ ] **Step 1: Add failing static contract assertions**

Assert both production pages include `/ui/pulse-data-state.js` and contain at least one element with `data-pulse-data-state`.

- [ ] **Step 2: Add compact badges**

Scanner:
- Market-list status uses `live`, `stale`, or `api-degraded` based on fetch result and age.

Analysis:
- Current timeframe displays `confirmed` or `partial`.
- Long-period Dante diagnostics display `insufficient-history` when required candle count is unavailable.
- Any known stale cached state must display `stale`, never `live`.

Badge text must come from `formatDataState()` rather than duplicated literal mapping.

- [ ] **Step 3: Run deterministic and contract tests**

```bash
node --test tests/pulse-data-state.test.js tests/pulse-shell-contract.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add index.html technique-lab.html tests/pulse-shell-contract.test.js
git commit -m "feat: expose explicit market and bar data states"
```

---

### Task 7: Wire full Milestone 1 verification and release checklist

**Files:**
- Modify: `package.json`
- Modify: `RELEASE_CHECKLIST.md`
- Modify: `scripts/verify-milestone1.js`

**Interfaces:**
- Produces `npm run test:foundation`.
- Existing `npm run verify` must run foundation tests before calibration/release gates.

- [ ] **Step 1: Update package scripts**

Target scripts:

```json
{
  "test:foundation": "node scripts/verify-milestone1.js",
  "verify": "npm run test:foundation && npm run check:calibration && npm run gate:release"
}
```

Preserve all existing scripts.

- [ ] **Step 2: Update release checklist**

Add explicit checks:

```md
- [ ] Mobile shows exactly one product topbar and one bottom navigation.
- [ ] No floating shell control covers chart candles.
- [ ] Clean/Structure/SMC/Dante/Full presets persist across reload.
- [ ] Rendering budgets are enforced by preset policy.
- [ ] Live/Confirmed/Partial/Stale/Insufficient-history/API-degraded states are distinguishable.
- [ ] Legacy analysis route remains reachable for rollback.
```

- [ ] **Step 3: Run complete foundation verification**

```bash
npm run test:foundation
```

Expected: all Milestone 1 tests PASS with zero failures.

- [ ] **Step 4: Run existing repository verification**

```bash
npm run verify
```

Expected: foundation tests, calibration self-check, and release gate all PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json RELEASE_CHECKLIST.md scripts/verify-milestone1.js
git commit -m "chore: gate releases on foundation verification"
```

---

### Task 8: Deployment smoke verification

**Files:**
- No production-code changes unless a verified deployment defect is found.

**Interfaces:**
- Canonical production URL: Vercel project deployment for PulseRadar Pro v3.

- [ ] **Step 1: Confirm Git commit is deployed**

Verify the production deployment SHA corresponds to the Milestone 1 head commit before claiming production behavior.

- [ ] **Step 2: Smoke-test canonical shell**

Verify on desktop and iPhone-class viewport:

```txt
/ -> one product shell
scanner -> direct scanner content, no nested product shell
analysis -> selected symbol preserved
preset change -> child analysis presentation updates
More -> opens full grouped menu
```

- [ ] **Step 3: Smoke-test failure states**

Verify the UI has a visible non-blank state for:

```txt
invalid symbol
market fetch/API failure
partial current candle
insufficient long-period history
```

- [ ] **Step 4: Record verification evidence**

Add the tested deployment URL and commit SHA to the release note/PR description used for Milestone 1. Do not mark the milestone complete without this evidence.

---

## Milestone 1 Completion Gate

Milestone 1 is complete only when all of the following are true:

- `npm run test:foundation` passes.
- `npm run verify` passes.
- The canonical shell embeds `/index.html` directly for scanner view.
- Mobile displays exactly one product navigation shell.
- Workspace presets persist and affect presentation only.
- Rendering budgets are deterministic and tested.
- Data-state metadata is explicit and visible.
- Existing analysis formulas and API contracts are unchanged.
- A deployed Vercel build matching the verified commit passes desktop and iPhone-class smoke tests.

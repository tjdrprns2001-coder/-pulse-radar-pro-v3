# PulseRadar Multi-Chart Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable multi-chart workspace where one shared symbol drives 1/2/4 independent Lightweight Charts instances with chart-local timeframe/mode, distinct SMC/ICT visual languages, mobile vertical stacking, and persistent layout state.

**Architecture:** Add a workspace state/controller layer above the existing `PulseChartCore` and plugin registry. Reuse existing analytics (`/api/structure`, SMC engine, Structure/Dante plugins) and create chart instances directly instead of iframe duplication. A shared request coordinator deduplicates identical symbol+TF loads; each card owns local chart lifecycle, TF, mode, visibility, and error state.

**Tech Stack:** Static HTML/CSS/JavaScript, Lightweight Charts 5.2.1, existing PulseRadar chart core/plugins, localStorage, Node built-in test runner, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-16-pulseradar-multi-chart-workspace-design.md`

## Global Constraints

- Default layout: 2 charts.
- Workspace symbol is shared by default.
- Timeframe and mode remain independent per chart.
- Supported first-release layouts: 1, 2, 4.
- Mobile 2-chart and 4-chart layouts stack vertically; never force side-by-side mini charts.
- Existing Structure/SMC analytical definitions remain authoritative and unchanged.
- SMC mode emphasizes zones/liquidity; ICT mode emphasizes Premium/Discount/OTE and ordered workflow context.
- Full mode is curated and must not enable every layer blindly.
- Identical symbol+TF requests must be deduplicated.
- One chart failure must not blank sibling charts.
- No new predictive model, order entry, WebSocket fan-out, or new SMC definition in this milestone.
- Existing `npm run verify` must remain green.

---

### Task 1: Workspace State Model

**Files:**
- Create: `ui/multi-chart/workspace-state.js`
- Test: `tests/multi-chart-workspace-state.test.js`

**Interfaces:**
- Produces: `createWorkspaceState(initial?)`
- Produces methods: `getState()`, `setLayout(count)`, `setSymbol(symbol)`, `updateChart(id, patch)`, `duplicateChart(id)`, `maximizeChart(id)`, `restoreCharts()`, `serialize()`
- Chart config shape: `{id, symbol, timeframe, mode, preset, syncGroup, expanded}`

- [ ] **Step 1: Write failing tests** covering default 2-chart state (`1h/smc`, `4h/ict`), 1/2/4 layout transitions, shared symbol propagation, chart-local TF/mode updates, duplicate behavior, maximize/restore, and serialization round-trip.
- [ ] **Step 2: Run** `node --test tests/multi-chart-workspace-state.test.js` and verify failure because module is absent.
- [ ] **Step 3: Implement** `workspace-state.js` as a small immutable-copy state holder. `setSymbol()` updates workspace symbol and every chart symbol; `updateChart()` must not alter sibling TF/mode; layout reduction preserves existing chart configs in memory for restoration during the session.
- [ ] **Step 4: Run** the state tests and verify pass.
- [ ] **Step 5: Commit** `feat: add multi-chart workspace state`.

### Task 2: Shared Request Coordinator

**Files:**
- Create: `ui/multi-chart/request-coordinator.js`
- Test: `tests/multi-chart-request-coordinator.test.js`

**Interfaces:**
- Produces: `createRequestCoordinator({fetcher, ttlMs=15000})`
- Produces methods: `load(symbol, timeframe)`, `clear()`, `invalidate(symbol, timeframe)`
- Cache key: normalized `SYMBOL|timeframe`

- [ ] **Step 1: Write failing tests** proving two simultaneous identical requests share one Promise, different TFs fetch independently, a failed request is evicted, and successful results are reused within TTL.
- [ ] **Step 2: Run** `node --test tests/multi-chart-request-coordinator.test.js` and verify expected failure.
- [ ] **Step 3: Implement** Promise deduplication and TTL cache. Rejecting promises must be removed immediately so retries work.
- [ ] **Step 4: Run** coordinator tests and verify pass.
- [ ] **Step 5: Commit** `feat: deduplicate multi-chart data requests`.

### Task 3: Analysis Mode Mapping

**Files:**
- Create: `ui/multi-chart/mode-registry.js`
- Test: `tests/multi-chart-mode-registry.test.js`

**Interfaces:**
- Produces: `getModeDefinition(mode, viewport)`
- Produces: `listModes()`
- Modes: `clean`, `structure`, `smc`, `ict`, `dante`, `full`
- Each definition returns `{presetId, plugins, panes, visualProfile}`

- [ ] **Step 1: Write failing tests** asserting SMC and ICT plugin sets are distinct, Clean has no analytical overlays, Dante emphasizes Dante plugin, and Full is curated instead of unioning all available plugins.
- [ ] **Step 2: Run** mode tests and verify failure.
- [ ] **Step 3: Implement** mode mappings using existing `structure`, `smc`, and `dante` plugin IDs. Add `ict` as a separate presentation plugin ID. Mobile definitions use stricter pane/render choices.
- [ ] **Step 4: Run** tests and verify pass.
- [ ] **Step 5: Commit** `feat: define independent chart analysis modes`.

### Task 4: ICT Presentation Plugin

**Files:**
- Create: `ui/chart/plugins/ict-plugin.js`
- Test: `tests/ict-plugin.test.js`

**Interfaces:**
- Produces: `createIctPlugin()` implementing existing plugin contract `{id, version, requiredData, mount, update, setVisible, dispose}`
- Consumes existing SMC engine output only; must not calculate new trading signals.

- [ ] **Step 1: Write failing tests** asserting Premium/Discount/OTE derive only from supplied `smc.pdOte`, ordered sequence markers use only supplied sweep/MSS/displacement/FVG events, and missing data renders nothing rather than synthesizing events.
- [ ] **Step 2: Run** `node --test tests/ict-plugin.test.js` and verify failure.
- [ ] **Step 3: Implement** restrained band/marker rendering with independent cleanup. Premium uses restrained bearish band, Discount teal band, OTE violet band; sequence markers are compact numbered markers and obey render budgets.
- [ ] **Step 4: Run** tests and verify pass.
- [ ] **Step 5: Commit** `feat: add distinct ICT presentation plugin`.

### Task 5: Reusable Chart Card Controller

**Files:**
- Create: `ui/multi-chart/chart-card.js`
- Test: `tests/multi-chart-card.test.js`

**Interfaces:**
- Produces: `createChartCard({root, config, library, coordinator, modeRegistry, onConfigChange})`
- Methods: `load()`, `setConfig(config)`, `resize()`, `dispose()`
- Uses existing `PulseChartCore.createUnifiedChart()` and `PulseChartPlugins.createPluginRegistry()`.

- [ ] **Step 1: Write failing tests** with fake chart core/registry verifying each card creates its own chart instance, attaches only mode-approved plugins, changing TF reloads only that card, changing mode swaps plugin visibility without affecting sibling state, and load failure stays local.
- [ ] **Step 2: Run** card tests and verify failure.
- [ ] **Step 3: Implement** card lifecycle and local loading/error/stale state. Reuse `chart-data.js` adapters and existing SMC engine; do not fork formulas.
- [ ] **Step 4: Run** tests and verify pass.
- [ ] **Step 5: Commit** `feat: add reusable multi-chart card controller`.

### Task 6: Multi-Chart Workspace UI

**Files:**
- Create: `multi-chart.html`
- Create: `ui/multi-chart/multi-chart.css`
- Create: `ui/multi-chart/multi-chart.js`
- Test: `tests/multi-chart-contract.test.js`

**Interfaces:**
- Workspace controls: shared symbol input, layout buttons `1`, `2`, `4`.
- Per-card controls: timeframe selector, mode selector, maximize/restore, duplicate.
- Default: Chart A `1h · SMC`, Chart B `4h · ICT`.

- [ ] **Step 1: Write failing contract tests** asserting the page loads required scripts, contains one shared symbol control, 1/2/4 layout controls, chart-card host, no iframe duplication, and mobile CSS switches grid to vertical stack.
- [ ] **Step 2: Run** contract tests and verify failure.
- [ ] **Step 3: Implement** workspace DOM/controller. Desktop 2-up grid, 4-up 2x2; mobile stack; maximized card hides siblings visually but preserves state. Duplicate copies source TF/mode into next available slot.
- [ ] **Step 4: Implement persistence** under localStorage key `pulse.multiChart.v1` for layout, chart TF/modes, and sync flags only.
- [ ] **Step 5: Run** contract/state tests and verify pass.
- [ ] **Step 6: Commit** `feat: add multi-chart workspace UI`.

### Task 7: Shell and Navigation Integration

**Files:**
- Modify: `ui/pulse-shell.js`
- Modify: navigation source used by MTF/analysis shell as identified in current code
- Test: `tests/multi-chart-shell.test.js`

**Interfaces:**
- Route: `/multi-chart.html` initially; shell label `다중 차트`.
- Symbol messages use existing PulseRadar symbol context and must not create a second bottom nav.

- [ ] **Step 1: Write failing test** verifying shell can navigate to multi-chart, shared symbol enters workspace, child/workspace symbol changes update shell once, and no duplicate nav is injected.
- [ ] **Step 2: Run** shell test and verify failure.
- [ ] **Step 3: Implement** route/nav link and symbol bridge using existing shell message conventions.
- [ ] **Step 4: Run** tests and verify pass.
- [ ] **Step 5: Commit** `feat: integrate multi-chart with PulseRadar shell`.

### Task 8: Verification Gate and Release

**Files:**
- Create: `scripts/verify-multi-chart.js`
- Modify: `package.json`
- Modify: `.github/workflows/foundation-verify.yml`
- Modify: release checklist/documentation used by prior milestones

**Interfaces:**
- Script command: `npm run test:multi-chart`
- `npm run verify` runs existing gates plus multi-chart gate.

- [ ] **Step 1: Add verification script** that runs state, coordinator, mode registry, ICT plugin, chart card, page contract, and shell integration tests.
- [ ] **Step 2: Add package/workflow wiring** so GitHub Actions runs the new gate on branch/PR.
- [ ] **Step 3: Run** `npm run test:multi-chart` and `npm run verify`; both must pass.
- [ ] **Step 4: Manual smoke** UNIUSDT `1h SMC + 4h ICT`, BTCUSDT `15m Structure + 4h SMC`, symbol change updates all charts, mobile vertical layout, maximize/restore, 2→1→2 layout preserves settings.
- [ ] **Step 5: Verify Vercel Preview** success and no white-screen failure.
- [ ] **Step 6: Open PR, require green CI/Preview, squash merge to `main`, then verify Production deployment success.**

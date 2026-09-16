# Milestone 3.1 Chart Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Unified Chart readable on iPhone by aggressively limiting labels/zones without changing SMC calculations.

**Architecture:** Keep `smc-engine.js` and `/api/structure` unchanged. Add render-policy helpers used by Structure/SMC plugins, tighten preset budgets, and adjust mobile shell/chart CSS so the chart and controls no longer overlap or truncate symbols.

**Tech Stack:** Vanilla JS, Lightweight Charts 5.2.1, Node test runner, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-16-pulseradar-unified-analysis-v2-design.md`

## Global Constraints
- Do not change SMC detection/calibration formulas.
- Preserve Lightweight Charts 5.2.1.
- Keep legacy `/technique-lab.html` fallback.
- Mobile must show one bottom nav and preserve iPhone safe-area.
- `Clean`, `Structure`, `SMC`, `Dante`, `Full` remain selectable.

---

### Task 1: Render policy and preset budgets
**Files:** Create `ui/chart/render-policy.js`; modify `ui/pulse-presets.js`; test `tests/render-policy.test.js`.
**Produces:** `getRenderPolicy(presetId, viewportWidth)` and `selectPriorityItems(items, policy)`.
- [ ] Write tests asserting mobile SMC max zones 5, sweeps 3, structure labels 6; Full remains capped instead of unlimited; violated/expired are hidden outside research/full.
- [ ] Run tests and verify failure before implementation.
- [ ] Implement policy with recency → HTF → quality → active-state → price-distance priority.
- [ ] Run tests and verify pass.

### Task 2: SMC marker/zone declutter
**Files:** Modify `ui/chart/plugins/smc-plugin.js`; test `tests/smc-plugin.test.js`.
**Produces:** recent sweep cap, compact marker text, deduplicated EQH/EQL, no violated/expired zones outside Full.
- [ ] Add failing tests for sweep cap, duplicate equal-level merge, and visible-state filtering.
- [ ] Implement marker priority so MSS > recent Sweep > EQH/EQL and use compact `S↑`/`S↓` markers instead of repeated `SWP` text.
- [ ] Limit CE/zone lines according to policy and keep P/D/OTE subtle.
- [ ] Run tests and verify pass.

### Task 3: Structure label declutter
**Files:** Modify `ui/chart/plugins/structure-plugin.js`; test `tests/chart-core.test.js`.
**Produces:** Swing labels larger/rarer; internal BOS/CHoCH capped and compact.
- [ ] Add failing tests that recent major structure labels are capped and old markers are omitted.
- [ ] Implement recency cap and priority ordering for HH/HL/LH/LL, BOS, CHoCH.
- [ ] Run tests and verify pass.

### Task 4: Mobile layout fixes
**Files:** Modify `ui/pulse-shell.css`, `ui/chart/unified-chart.css`, `unified-chart.html`; test `tests/unified-chart-contract.test.js`, `tests/pulse-shell-contract.test.js`.
**Produces:** full `USDT` symbol visible, bottom content never hidden under navigation, compact mobile toolbar/chips.
- [ ] Add contract tests for mobile symbol input minimum width, frame safe-area padding, and no fixed chart-covering controls.
- [ ] Increase mobile symbol input width and make topbar flex shrink safely.
- [ ] Reserve bottom-nav space in frame/content and add chart bottom padding using `env(safe-area-inset-bottom)`.
- [ ] Make SMC summary chips horizontally scrollable/compact instead of wrapping over chart.
- [ ] Run tests and verify pass.

### Task 5: Verification and release
**Files:** Create `scripts/verify-milestone3-1.js`; modify `package.json`, `.github/workflows/foundation-verify.yml`, `RELEASE_CHECKLIST.md`.
- [ ] Add Milestone 3.1 tests to `npm run verify`.
- [ ] Run complete repository verification.
- [ ] Require GitHub Actions success and Vercel Preview success.
- [ ] Open PR, confirm 0 commits behind `main`, squash merge, then require Production Vercel success.

## Self-review
- Spec coverage: declutter, rendering budgets, lifecycle visibility, mobile safe-area, preset behavior covered.
- No SMC formulas are changed.
- No placeholders/TODOs.
- Rendering policy has one public contract consumed by both plugins.

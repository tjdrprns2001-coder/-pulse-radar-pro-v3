# Theme Rotation Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add true 1m/5m history, realtime Binance Futures, broader DEX discovery, refined PRE-SURGE/SURGE scoring, theme concentration analytics/charting, theme filtering, and non-repeating in-app signal alerts to LIVE RADAR.

**Architecture:** Keep `ui/radar-app.js` as orchestration and split new responsibilities into focused browser modules: `radar-history.js` for elapsed-window metrics, `radar-themes.js` for deterministic classification and aggregation, and `radar-alerts.js` for transition alerts. Extend `radar-stream.js` to own independent Spot/Futures sockets, `api/radar.js` for broader snapshot discovery, and `radar-core.js` to consume the new metrics without breaking fallbacks.

**Tech Stack:** Browser JavaScript, Node.js contract tests, Binance WebSocket/REST, DexScreener, GeckoTerminal, Netlify Functions, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-theme-rotation-radar-design.md`

## Global Constraints

- Preserve current beginner-friendly radar cards, pagination, sticky filters, Netlify routes, and Vercel compatibility.
- Theme heat is activity concentration, never a price prediction or recommendation.
- Missing short-window history must render as unavailable and never be fabricated.
- Spot and Futures stream failures must be isolated from one another.
- DEX duplicates must be de-duplicated by chain + pair address.
- Unknown/low-confidence theme assignments must remain `Other / Unclassified`.
- Alerts are informational, in-app only, de-duplicated, and cooldown-limited.
- Full `npm run verify` must pass before completion.

---

### Task 1: True 1m/5m Rolling History

**Files:**
- Create: `ui/radar-history.js`
- Create: `scripts/verify-radar-history.js`
- Modify: `package.json`
- Modify: `ui/radar-app.js`

**Interfaces:**
- Produces `PulseRadarHistory.record(market, timestamp?)`, `metricsFor(marketId, currentMarket, timestamp?)`, `reset()`.
- `metricsFor` returns `{change1m, change5m, volumeDelta1m, volumeDelta5m, txDelta1m, txDelta5m}` with `null` for insufficient history.

- [ ] **Step 1: Write failing history behavior test** covering 60s/300s elapsed lookup, insufficient history, duplicate timestamp suppression, and pruning beyond 6 minutes.
- [ ] **Step 2: Run `node scripts/verify-radar-history.js` and confirm failure** because the module does not exist.
- [ ] **Step 3: Implement `ui/radar-history.js`** with per-market arrays, sorted timestamp insertion, at-or-before lookup, and continuous pruning.
- [ ] **Step 4: Wire history into `ui/radar-app.js`** so every snapshot/stream observation is recorded and scored rows receive true short-window metrics when available.
- [ ] **Step 5: Add `test:radar-history` to `package.json` and `test:radar`.**
- [ ] **Step 6: Run history test and radar-core test; confirm PASS.**
- [ ] **Step 7: Commit `feat: add true radar short-window history`.**

### Task 2: Realtime Binance Futures Stream

**Files:**
- Modify: `ui/radar-stream.js`
- Modify: `scripts/verify-radar-stream.js`
- Modify: `ui/radar-app.js`

**Interfaces:**
- `PulseRadarStream.connect(opts)` emits normalized `spot` and `futures` records through the same `onTick` callback.
- `onState` includes aggregate state and per-channel state metadata.

- [ ] **Step 1: Extend stream contract test first** to require both Spot and Futures WebSocket endpoints, independent socket state, and futures normalization.
- [ ] **Step 2: Run stream test and confirm failure.**
- [ ] **Step 3: Refactor `ui/radar-stream.js`** into two independently reconnecting channel objects using Spot `!ticker@arr` and Futures `!ticker@arr` endpoints.
- [ ] **Step 4: Preserve existing `connect`, `disconnect`, and `normalize` compatibility while adding futures normalization.**
- [ ] **Step 5: Update app status copy so overall stream is LIVE if either channel is healthy and detail health exposes Spot/Futures states.**
- [ ] **Step 6: Run stream/UI contract tests; confirm PASS.**
- [ ] **Step 7: Commit `feat: stream Binance futures in live radar`.**

### Task 3: Broader DEX Discovery

**Files:**
- Modify: `api/radar.js`
- Modify: `scripts/verify-radar-api.js`

**Interfaces:**
- `/api/radar?mode=snapshot` keeps `{cex,dex,newPairs,chains,health}` contract.

- [ ] **Step 1: Extend API contract test first** to require theme-oriented discovery terms (`gaming`, `depin`, `privacy`) and preserve chain/pair de-duplication.
- [ ] **Step 2: Run API test and confirm failure.**
- [ ] **Step 3: Expand search term coverage and source jobs** without removing existing token-profile, boost, new-pool, trending-pool discovery.
- [ ] **Step 4: Strengthen duplicate selection** to prefer higher source confidence, then liquidity, then useful volume.
- [ ] **Step 5: Run API contract test; confirm PASS.**
- [ ] **Step 6: Commit `feat: broaden radar DEX discovery`.**

### Task 4: Refine PRE-SURGE / SURGE Scoring

**Files:**
- Modify: `ui/radar-core.js`
- Modify: `scripts/verify-radar-core.js`

**Interfaces:**
- `scoreMarket(record, baseline)` continues returning radar component scores, `label`, `signal`, and `reasons`.

- [ ] **Step 1: Add failing behavior tests** proving PRE-SURGE rewards rising 1m/5m volume/participation before extreme price movement, SURGE needs stronger confirmed activity, and thin-liquidity pumps remain RISK/not clean SURGE.
- [ ] **Step 2: Run core test and confirm failure.**
- [ ] **Step 3: Add history-aware volume/transaction impulse inputs** while preserving current fallback ratios when history metrics are unavailable.
- [ ] **Step 4: Rebalance PRE-SURGE/SURGE thresholds** around participation, imbalance, liquidity quality, and moderate/strong momentum respectively.
- [ ] **Step 5: Add Korean reasons for short-window volume/transaction acceleration.**
- [ ] **Step 6: Run core tests; confirm PASS.**
- [ ] **Step 7: Commit `feat: refine pre-surge and surge scoring`.**

### Task 5: Theme Classification and Concentration Engine

**Files:**
- Create: `ui/radar-themes.js`
- Create: `scripts/verify-radar-themes.js`
- Modify: `package.json`

**Interfaces:**
- `classifyMarket(market)` -> `{theme,confidence,source}`.
- `aggregateThemes(markets)` -> `{themes, dominantThemeShare, themeBreadth}`.
- `themeHeat(summary,populationStats)` -> 0..100.

- [ ] **Step 1: Write failing theme tests** for known symbols across AI/MEME/DeFi/RWA/L1/L2/Gaming/DePIN/Privacy, explicit unclassified fallback, bounded heat, aggregation means, and risk annotation.
- [ ] **Step 2: Run theme test and confirm failure.**
- [ ] **Step 3: Implement deterministic registry** for stable known symbols/address overrides and confidence/source metadata.
- [ ] **Step 4: Implement aggregation** with null-aware means and counts for WATCH/PRE-SURGE/SURGE/RISK.
- [ ] **Step 5: Implement normalized 0-100 heat** using 30% active signal density, 25% volume impulse, 20% average radar score, 15% buy pressure, 10% short-term price impulse.
- [ ] **Step 6: Add `test:radar-themes` to package scripts and radar suite.**
- [ ] **Step 7: Run theme test; confirm PASS.**
- [ ] **Step 8: Commit `feat: add radar theme concentration engine`.**

### Task 6: Signal Transition Alerts

**Files:**
- Create: `ui/radar-alerts.js`
- Create: `scripts/verify-radar-alerts.js`
- Modify: `package.json`

**Interfaces:**
- `observe(market, now?)` -> alert object or `null`.
- `recent()` -> recent alert list.
- `reset()`.

- [ ] **Step 1: Write failing alert tests** for first-observation suppression, WATCH→PRE-SURGE, PRE-SURGE→SURGE, WATCH→SURGE, risk transitions, de-duplication, and cooldown.
- [ ] **Step 2: Run alert test and confirm failure.**
- [ ] **Step 3: Implement transition state map and cooldown timestamps** with a bounded recent-alert buffer.
- [ ] **Step 4: Add package scripts and radar suite integration.**
- [ ] **Step 5: Run alert test; confirm PASS.**
- [ ] **Step 6: Commit `feat: add radar signal transition alerts`.**

### Task 7: Theme Chart, Theme Filter, Short-Window UI, Alerts UI

**Files:**
- Modify: `radar.html`
- Modify: `ui/radar-app.js`
- Modify: `ui/radar.css`
- Modify: `scripts/verify-radar-ui.js`

**Interfaces:**
- Theme chart reads aggregate output from `PulseRadarThemes`.
- Clicking a theme sets `state.theme`, reuses existing filtered/pagination flow, and clicking active theme or `전체 테마` clears it.

- [ ] **Step 1: Extend UI contract test first** to require module loading, `테마 쏠림`, `집중도`, `전체 테마`, `1분 변화`, `5분 변화`, and alert container wiring.
- [ ] **Step 2: Run UI test and confirm failure.**
- [ ] **Step 3: Load history/themes/alerts modules before `radar-app.js`.**
- [ ] **Step 4: Add theme section markup** between metrics/tabs and pager with a compact horizontal bar/list renderer and reset control.
- [ ] **Step 5: Add app orchestration** for enrichment, aggregation, theme filtering, alert observation, and 1m/5m display.
- [ ] **Step 6: Add mobile-first CSS** so theme bars fit without horizontal scroll and selected theme state is obvious.
- [ ] **Step 7: Add recent alert/toast area** that shows market, new state, and top reasons without blocking interaction.
- [ ] **Step 8: Run UI, history, themes, alerts, stream, core tests; confirm PASS.**
- [ ] **Step 9: Commit `feat: add theme rotation chart and radar alerts UI`.**

### Task 8: Full Verification and Netlify Production Validation

**Files:**
- Modify only if verification exposes a real compatibility issue.

- [ ] **Step 1: Run `npm run verify`.**
- [ ] **Step 2: Fix only failures caused by the new feature, rerunning the narrow failing test first.**
- [ ] **Step 3: Re-run `npm run verify` and require a clean PASS.**
- [ ] **Step 4: Confirm GitHub Actions Foundation Verify succeeds for the final commit.**
- [ ] **Step 5: Confirm Netlify production deploy is `ready`, points to the final commit, and still deploys `api-index` + `radar` functions with redirect rules intact.**
- [ ] **Step 6: Verify `/radar` renders the new theme section and existing market feed remains functional.**
- [ ] **Step 7: Report final commit, CI result, deploy status, and user-facing changes.**

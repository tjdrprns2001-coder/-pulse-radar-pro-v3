# Altcoin Flow Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coin-level ALTCOIN FLOW RADAR that ranks unusual altcoin activity using existing LIVE RADAR, market-flow, DEX/CEX, and optional on-chain inputs.

**Architecture:** Keep the existing market snapshot and market-flow endpoints intact. Add a focused coin-anomaly module that consumes normalized market-flow + live/history metrics, produces backward-compatible `coinFlows`, and a compact browser UI that can filter altcoins, switch 1m/5m/15m windows, and sort by anomaly dimensions. Missing inputs remain null and score weights renormalize over only available dimensions.

**Tech Stack:** Node.js CommonJS modules, browser JavaScript, Netlify Functions, existing GitHub Actions verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-16-altcoin-flow-radar-design.md`

## Global Constraints

- No trading execution, leverage controls, automated buying/selling, or guaranteed price-direction claims.
- BTC/ETH, stablecoins, and wrapped stablecoins are excluded by default in altcoin-only mode.
- No single source or metric may independently trigger PRE-SURGE or SURGE.
- Missing 1m/5m/15m metrics render null/`-`, never fake zeroes.
- Existing LIVE RADAR, market-flow, and on-chain paths must continue to work if this layer fails.
- Final release requires full `npm run verify` success and Netlify production `ready`.

---

### Task 1: Coin anomaly core

**Files:**
- Create: `lib/market-flow/coin-anomaly.js`
- Create: `scripts/verify-altcoin-flow-core.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: normalized `dexFlows`, `cexFlows`, live/history market rows, optional on-chain token/theme flow.
- Produces: `buildCoinFlows(input)` returning rows with `baseAsset`, `theme`, `anomalyScore`, `signal`, `volumeAnomaly1m`, `volumeAnomaly5m`, `volumeAnomaly15m`, `dexNetBuyUsdEstimate`, `dexBuyShare`, `cexVenueBreadth`, `spotFuturesAligned`, `priceVolumeDivergence`, `liquidityImpulse`, `onchainNetFlowUsd`, `confidence`, `reasons`.

- [ ] **Step 1: Write failing behavior tests**

Test exact cases: baseline anomaly math, null preservation, stablecoin/BTC/ETH filtering, weight renormalization, price-volume divergence, spot/futures alignment, and multi-source confirmation for PRE-SURGE/SURGE.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node scripts/verify-altcoin-flow-core.js`
Expected: FAIL because `lib/market-flow/coin-anomaly.js` does not exist.

- [ ] **Step 3: Implement minimal anomaly core**

Use robust median/mean baseline comparison from available samples, clamp component scores 0-100, renormalize only present components, and require at least two independent dimensions before PRE-SURGE/SURGE.

- [ ] **Step 4: Run focused test and confirm GREEN**

Run: `node scripts/verify-altcoin-flow-core.js`
Expected: PASS.

- [ ] **Step 5: Add test script to repository verification**

Add `test:altcoin-flow-core` and include it in `test:radar`.

### Task 2: Market-flow API coin ranking

**Files:**
- Modify: `api/market-flow.js`
- Create: `scripts/verify-altcoin-flow-api.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `dexFlows`, `cexFlows`, `tokenFlows`, `themeFlows` and normalized coin anomaly module.
- Produces: backward-compatible `/api/market-flow` response with optional `coinFlows` and `coinFlowCoverage` fields.

- [ ] **Step 1: Write failing API contract test**

Assert existing fields remain, `coinFlows` is an array, missing metrics stay null, provider partial failure still returns successful-source coin rows, and no single-source row is promoted above WATCH.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-altcoin-flow-api.js`
Expected: FAIL because `coinFlows` is absent.

- [ ] **Step 3: Integrate `buildCoinFlows` without changing existing contracts**

Generate coin rows from cached normalized market-flow data; keep endpoint degraded/partial behavior unchanged.

- [ ] **Step 4: Run and confirm GREEN**

Run: `node scripts/verify-altcoin-flow-api.js`
Expected: PASS.

### Task 3: Browser ALTCOIN FLOW RADAR model

**Files:**
- Create: `ui/radar-altcoin-flow.js`
- Create: `scripts/verify-radar-altcoin-flow-ui.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `/api/market-flow` `coinFlows` plus optional live/history overlay from `ui/radar-app.js`.
- Produces: helpers for altcoin filtering, window selection, sort selection, null-safe formatting, and compact row rendering.

- [ ] **Step 1: Write failing browser-model test**

Assert default altcoin-only filtering, all-coins mode, 1m/5m/15m metric selection, sort by anomaly/volume/flow/signal, and `-` for missing values.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-radar-altcoin-flow-ui.js`
Expected: FAIL because the browser module does not exist.

- [ ] **Step 3: Implement browser module**

Expose `window.PulseRadarAltcoinFlow` with pure helpers only; no network requests inside this module.

- [ ] **Step 4: Run and confirm GREEN**

Run: `node scripts/verify-radar-altcoin-flow-ui.js`
Expected: PASS.

### Task 4: Radar page integration

**Files:**
- Modify: `radar.html`
- Modify: `ui/radar-app.js`
- Modify: `ui/radar.css`
- Modify: `scripts/verify-radar-altcoin-flow-ui.js`

**Interfaces:**
- Consumes: `PulseRadarAltcoinFlow` and existing market-flow fetch state.
- Produces: compact `ALTCOIN FLOW RADAR` panel with controls `알트코인만 / 전체 코인`, windows `1m / 5m / 15m`, sort options, and collapsed details.

- [ ] **Step 1: Extend UI test first**

Assert HTML contains panel title and controls, app renders `FLOW / concentration`, `VOLUME anomaly`, `BUY pressure`, `DEX/CEX`, `ON-CHAIN`, `SIGNAL`, and CSS has mobile compact rules.

- [ ] **Step 2: Run and confirm RED**

Run: `node scripts/verify-radar-altcoin-flow-ui.js`
Expected: FAIL on missing panel markup/integration.

- [ ] **Step 3: Add compact UI and app integration**

Use existing `/api/market-flow` polling, preserve LIVE RADAR rendering independently, and show stale/degraded labels when data is partial.

- [ ] **Step 4: Run and confirm GREEN**

Run: `node scripts/verify-radar-altcoin-flow-ui.js`
Expected: PASS.

### Task 5: Regression, CI, and deployment verification

**Files:**
- Modify only if required by verification: `.github/workflows/foundation-verify.yml`, `netlify.toml`, `vercel.json`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified deployable repository state.

- [ ] **Step 1: Run full repository verification**

Run: `npm run verify`
Expected: PASS with all existing and new tests.

- [ ] **Step 2: Confirm GitHub Actions watches touched paths and passes on final commit**

Expected: `Foundation Verify` conclusion `success`.

- [ ] **Step 3: Confirm Netlify production deploy**

Expected: site `pulseradar-pro-v3-temp` deploy state `ready`, including the updated `market-flow` function and radar assets.

- [ ] **Step 4: Smoke-check public radar URL**

Confirm `/radar` renders and the new ALTCOIN FLOW RADAR panel loads without breaking existing sections.

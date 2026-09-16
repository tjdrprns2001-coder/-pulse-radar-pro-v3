# Real-Time Crypto Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-oriented real-time crypto radar to PulseRadar Pro v3 that monitors Binance spot/futures and broad multi-chain DEX markets, detects anomalies, and exposes a responsive LIVE RADAR UI.

**Architecture:** Keep existing PulseRadar chart/analysis flows intact. Add a serverless snapshot aggregator for broad DEX/CEX discovery, a browser-side single-stream Binance all-market WebSocket for low-latency updates, a normalized scoring layer for price/volume/liquidity/new-pair anomalies, and a dedicated radar view linked from the existing shell. Vercel serverless functions provide resilient REST snapshots and source health; the browser subscribes only to compact aggregate data and one exchange-wide ticker stream rather than one socket per token.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js Vercel serverless functions, Binance public REST/WebSocket, DexScreener public API, existing PulseRadar shell.

**Spec:** `docs/superpowers/specs/2026-09-16-realtime-crypto-radar-design.md`

## Global Constraints

- Do not execute trades or handle private keys.
- Preserve existing chart, SMC/ICT, futures, mobile, analysis and calibration flows.
- Address-aware token identity must be preserved for DEX assets.
- No browser WebSocket per token or pair.
- Data-source failure must degrade locally and never blank the whole radar.
- Signals must expose reasons and component scores rather than only one opaque score.
- DEX percentage moves must be filtered by minimum liquidity/activity before high-priority ranking.

---

### Task 1: Radar scoring core

**Files:**
- Create: `ui/radar-core.js`
- Create: `scripts/verify-radar-core.js`
- Modify: `package.json`

**Interfaces:**
- Consumes normalized CEX/DEX market records.
- Produces `PulseRadarCore.scoreMarket(record, baseline)` and `PulseRadarCore.rankMarkets(records)`.

- [ ] Write RED tests for momentum, volume acceleration, liquidity risk, new-pair freshness and PRE-SURGE/SURGE classification.
- [ ] Run `node scripts/verify-radar-core.js` and confirm failure before implementation.
- [ ] Implement bounded pure scoring helpers in `ui/radar-core.js`.
- [ ] Re-run verifier and confirm PASS.
- [ ] Add `test:radar` to `package.json` and include it in `verify`.

### Task 2: Multi-source snapshot API

**Files:**
- Create: `api/radar.js`
- Create: `scripts/verify-radar-api.js`
- Modify: `vercel.json`
- Modify: `package.json`

**Interfaces:**
- `GET /api/radar?mode=snapshot` -> `{updatedAt, sources, cex, dex, newPairs, health}`.
- `GET /api/radar?mode=health` -> compact source health.

- [ ] Write RED static-contract tests for schema, timeout/fallback behavior and address-aware normalization.
- [ ] Implement Binance 24h spot/futures snapshots plus DexScreener broad chain searches with bounded concurrency and timeout.
- [ ] Normalize source results into the common radar record contract.
- [ ] Add graceful partial failure with per-source health and cached in-process last-good snapshot.
- [ ] Wire `/api/radar` in `vercel.json`.
- [ ] Run `node scripts/verify-radar-api.js` and existing verification suite.

### Task 3: Low-latency Binance stream client

**Files:**
- Create: `ui/radar-stream.js`
- Create: `scripts/verify-radar-stream.js`
- Modify: `package.json`

**Interfaces:**
- `PulseRadarStream.connect({onTick,onState})` opens one Binance all-market ticker WebSocket.
- `disconnect()` closes cleanly.
- Emits normalized spot ticker updates and reconnect state.

- [ ] Write RED contract tests for one-socket URL, event normalization, exponential reconnect and stale-state handling.
- [ ] Implement one-stream client with reconnect jitter and visibility-aware recovery.
- [ ] Verify PASS and add to `verify`.

### Task 4: LIVE RADAR interface

**Files:**
- Create: `radar.html`
- Create: `ui/radar.css`
- Create: `ui/radar-app.js`
- Create: `scripts/verify-radar-ui.js`
- Modify: `package.json`

**Interfaces:**
- Tabs: `LIVE RADAR`, `TOP MOVERS`, `NEW PAIRS`, `VOLUME SPIKE`, `LIQUIDITY ALERT`.
- Filters: chain, market type, signal label, min liquidity, search.
- Clicking a compatible Binance market opens existing analysis/chart flow with symbol query.

- [ ] Write RED DOM/source contract tests for required tabs, filters, mobile layout hooks and chart links.
- [ ] Build responsive table/card hybrid UI with source health badge and last-update timestamp.
- [ ] Merge REST snapshots with Binance WebSocket updates in memory.
- [ ] Re-score only changed records and render top-ranked bounded rows.
- [ ] Add empty/error/stale states without blank-screen failure.
- [ ] Verify PASS.

### Task 5: Shell integration

**Files:**
- Modify: `pulse-unified.html`
- Modify: `ui/pulse-shell.js`
- Create: `scripts/verify-radar-shell.js`
- Modify: `package.json`

**Interfaces:**
- New `radar` view maps to `/radar.html`.
- Existing symbol/preset state remains unchanged for other views.

- [ ] Write RED shell routing test.
- [ ] Add `LIVE RADAR` navigation button in desktop and mobile navigation.
- [ ] Add view metadata and route mapping in shell JS.
- [ ] Verify existing shell routes still match previous contracts.

### Task 6: Release verification

**Files:**
- Modify: `RELEASE_CHECKLIST.md`
- Modify: `package.json`

**Interfaces:**
- `npm run verify` includes all radar gates.

- [ ] Run all radar verifiers individually.
- [ ] Run `npm run verify`.
- [ ] Confirm no test regressions.
- [ ] Add manual checks for radar load, source degradation, mobile table/card layout, symbol handoff, and reconnect behavior.
- [ ] Commit the completed feature on an isolated feature branch for review/deployment.

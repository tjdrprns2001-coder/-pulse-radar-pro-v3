# Market Flow Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a keyless DEX/CEX market-flow subsystem and neutral theme-rotation view without coupling failures into LIVE RADAR.

**Architecture:** Keep `api/radar.js` untouched as the broad market snapshot. Add focused normalizers under `lib/market-flow/`, a cached `/api/market-flow` endpoint, Netlify routing, and a small browser helper/UI mode. All providers fail independently and only available data contributes to aggregation.

**Tech Stack:** Node.js serverless functions, browser JavaScript, Netlify Functions, public exchange/DEX REST endpoints, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-market-flow-design.md`

## Global Constraints

- No API keys required for `/api/market-flow`.
- DEX side USD amounts are estimates and must be labeled `추정`.
- Missing data remains `null`; unsupported windows render `-`.
- No single market-flow metric can independently create PRE-SURGE/SURGE.
- Binance browser WebSocket and existing `/api/radar` remain independent.
- Provider calls use timeouts, bounded result sets, partial-success semantics, and 15-30 second caching.
- Output is descriptive market activity/flow context, not price prediction or trade execution.

---

### Task 1: DEX Flow Normalizer

**Files:**
- Create: `lib/market-flow/dex.js`
- Create: `scripts/verify-market-flow-dex.js`
- Modify: `package.json`

**Interfaces:**
- Produces `normalizeDexMarket(raw, source) -> DexFlowRecord`.
- Produces `estimateSideUsd(volumeUsd, buys, sells) -> {buyUsdEstimate,sellUsdEstimate,netBuyUsdEstimate,buyShare,sellShare,swapImbalance}`.

- [ ] Write a failing behavior test covering estimate math, null handling, bounded `activityScore`, and `estimated:true`.
- [ ] Run via GitHub Actions and confirm failure before implementation.
- [ ] Implement source-agnostic normalization for DexScreener/GeckoTerminal snapshots.
- [ ] Verify DEX tests green.
- [ ] Commit `feat: normalize dex market flow`.

### Task 2: Multi-CEX Normalizer and Collectors

**Files:**
- Create: `lib/market-flow/cex.js`
- Create: `scripts/verify-market-flow-cex.js`
- Modify: `package.json`

**Interfaces:**
- Produces `normalizeCexTicker(raw, venue, marketType, fxContext) -> CexFlowRecord|null`.
- Produces `compareCexMarkets(records) -> CexComparison[]` with venue share and observed spread.
- Public collectors cover Binance Spot/Futures, Upbit, Bithumb, OKX, Bybit, Coinbase.

- [ ] Write failing tests for symbol normalization, missing-volume null behavior, venue share, price spread, and KRW conversion gating.
- [ ] Confirm failure.
- [ ] Implement normalizers and bounded public REST collectors with independent health.
- [ ] Verify CEX tests green.
- [ ] Commit `feat: add multi cex market comparison`.

### Task 3: Token and Theme Aggregation

**Files:**
- Create: `lib/market-flow/aggregate.js`
- Create: `scripts/verify-market-flow-aggregate.js`
- Modify: `package.json`

**Interfaces:**
- `aggregateMarketFlow({dexFlows,cexFlows,onchainThemeFlows,themeForMarket,previous}) -> {tokenFlows,themeFlows}`.
- `rotationScore` is bounded 0-100 and neutral.

- [ ] Write failing tests for contribution split, breadth, concentration math, bounded score, and missing-data preservation.
- [ ] Confirm failure.
- [ ] Implement token/theme aggregation using only available metrics.
- [ ] Verify aggregate tests green.
- [ ] Commit `feat: aggregate theme market rotation`.

### Task 4: Cached Market Flow API

**Files:**
- Create: `api/market-flow.js`
- Create: `netlify/functions/market-flow.js`
- Modify: `netlify.toml`
- Modify: `vercel.json`
- Create: `scripts/verify-market-flow-api.js`
- Modify: `package.json`

**Interfaces:**
- `GET /api/market-flow` returns `{updatedAt,stale,providerHealth,dexFlows,cexFlows,tokenFlows,themeFlows,coverage,confidence}`.

- [ ] Write failing contract test for route presence, partial provider failure, degraded payload, stale/cache fields, and no secrets.
- [ ] Confirm failure.
- [ ] Implement endpoint with ~20 second cache and partial-success semantics.
- [ ] Verify API and routing tests green.
- [ ] Commit `feat: expose keyless market flow api`.

### Task 5: Market Flow UI Mode

**Files:**
- Create: `ui/radar-market-flow.js`
- Modify: `radar.html`
- Modify: `ui/radar-app.js`
- Modify: `ui/radar.css`
- Create: `scripts/verify-radar-market-flow-ui.js`
- Modify: `scripts/verify-radar-ui.js`
- Modify: `package.json`

**Interfaces:**
- UI mode `시장 자금 이동` beside current activity/on-chain modes.
- Windows `5m / 1h / 4h / 24h`, unsupported values display `-`.
- Details expose DEX `순매수 추정`, DEX/CEX split, venue concentration, provider state.

- [ ] Write failing UI contract test for labels, helper module, degraded state, and `추정` wording.
- [ ] Confirm failure.
- [ ] Implement compact mobile-first panel and detail integration without changing default row density.
- [ ] Verify UI tests green.
- [ ] Commit `feat: add market flow rotation view`.

### Task 6: Full Verification and Production Deploy

**Files:**
- Modify only if regressions are exposed.

**Interfaces:**
- `npm run verify` is the release gate.

- [ ] Run full GitHub Actions verification.
- [ ] Fix any regression with a targeted failing test first.
- [ ] Confirm final GitHub Actions run is green.
- [ ] Confirm Netlify production deploy is `ready` on the verified commit and `market-flow` function is deployed.
- [ ] Report only final visible functionality, commit, deployment state, and URL.

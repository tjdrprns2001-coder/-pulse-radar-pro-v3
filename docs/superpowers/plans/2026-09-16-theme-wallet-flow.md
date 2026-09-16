# Theme Expansion + Wallet Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expanded multi-theme classification and a resilient public on-chain capital-flow layer for Solana, Ethereum, Base, and BSC, with token/theme flow summaries, wallet-volatility metrics, compact mobile charts, and bounded radar-score context.

**Architecture:** Keep market-radar ingestion independent from on-chain providers. Server adapters normalize provider data into one transfer contract; `lib/onchain/aggregate.js` deduplicates and computes token/theme summaries. The UI consumes `/api/onchain-flow`, degrades cleanly when provider credentials/coverage are unavailable, and merges only confidence-gated context into existing radar records.

**Tech Stack:** Node.js serverless functions, browser JavaScript, Netlify Functions, GitHub Actions verification, existing PulseRadar static UI.

**Spec:** `docs/superpowers/specs/2026-09-16-theme-wallet-flow-design.md`

## Global Constraints

- Phase-1 chains: Solana, Ethereum, Base, BSC.
- No provider secret is committed; credentials come only from environment variables.
- Unknown wallet identities remain unlabeled; no owner identity is inferred.
- Default large-transfer threshold: 100,000 USD; very-large threshold: 1,000,000 USD.
- On-chain data is research context, not a price forecast.
- Provider failure must never break LIVE RADAR.
- Existing 1m/5m history, Spot/Futures stream, DEX discovery, theme heat, alerts, pagination, and beginner labels remain intact.

---

### Task 1: Expanded Theme Classification

**Files:**
- Modify: `ui/radar-themes.js`
- Create: `scripts/verify-radar-themes-v2.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `classifyMarket(market) -> {theme, primaryTheme, secondaryThemes, confidence, source}`
- Produces: expanded `themes` registry.

- [ ] **Step 1: Write the failing test** asserting the expanded taxonomy, primary/secondary themes, chain-ecosystem secondary classification, and unclassified fallback.
- [ ] **Step 2: Run** `node scripts/verify-radar-themes-v2.js` and confirm failure because the expanded taxonomy is absent.
- [ ] **Step 3: Implement** deterministic classification with curated symbol/address registry and ecosystem secondary themes without ticker-guessing fallback.
- [ ] **Step 4: Run** the theme v2 test and existing `npm run test:radar-themes`.
- [ ] **Step 5: Commit** `feat: expand radar theme taxonomy`.

### Task 2: Normalized On-Chain Core

**Files:**
- Create: `lib/onchain/labels.js`
- Create: `lib/onchain/evm.js`
- Create: `lib/onchain/solana.js`
- Create: `lib/onchain/aggregate.js`
- Create: `scripts/verify-onchain-core.js`
- Modify: `package.json`

**Interfaces:**
- `lookupLabel(chain,address) -> {label,type,confidence}|null`
- `normalizeEvmTransfer(raw,context) -> FlowRecord|null`
- `normalizeSolanaTransfer(raw,context) -> FlowRecord|null`
- `aggregateFlows(records, options) -> {tokenFlows, themeFlows}`
- `walletVolatility(records) -> number` bounded 0-100.

- [ ] **Step 1: Write failing behavior tests** for normalized EVM/Solana records, trusted exchange/DEX classification, dedupe, 1h/4h/24h aggregation, large-transfer thresholds, and wallet volatility bounds.
- [ ] **Step 2: Run** `node scripts/verify-onchain-core.js` and confirm missing-module failure.
- [ ] **Step 3: Implement** small isolated modules using the spec record contract and trusted-label-only directional interpretation.
- [ ] **Step 4: Run** `node scripts/verify-onchain-core.js` until green.
- [ ] **Step 5: Commit** `feat: add normalized onchain flow core`.

### Task 3: Provider Adapters + Cached API

**Files:**
- Create: `lib/onchain/providers.js`
- Create: `api/onchain-flow.js`
- Create: `netlify/functions/onchain-flow.js`
- Modify: `netlify.toml`
- Modify: `vercel.json`
- Create: `scripts/verify-onchain-api.js`
- Modify: `package.json`

**Interfaces:**
- `fetchOnchainEvents({chains, tokens, now}) -> {records, providerHealth}`
- `GET /api/onchain-flow?window=1h|4h|24h`
- Response: `{updatedAt,stale,providerHealth,tokenFlows,themeFlows,coverage,confidence}`.

- [ ] **Step 1: Write failing API contract test** checking all four chain health keys, empty-array graceful degradation, stale/cache fields, no embedded secrets, and Netlify/Vercel route availability.
- [ ] **Step 2: Run** `node scripts/verify-onchain-api.js` and confirm failure.
- [ ] **Step 3: Implement** provider adapters that activate only when supported environment variables exist, use short server-side caching, normalize through Task-2 modules, and return partial coverage instead of failing the radar.
- [ ] **Step 4: Run** API and Netlify routing tests.
- [ ] **Step 5: Commit** `feat: expose cached onchain flow api`.

### Task 4: Confidence-Gated Radar Context

**Files:**
- Modify: `ui/radar-core.js`
- Create: `scripts/verify-radar-onchain-score.js`
- Modify: `package.json`

**Interfaces:**
- `scoreMarket(record, baseline)` accepts optional `onchain` fields.
- Produces `onchainScore` bounded 0-100 and neutral reason tags.

- [ ] **Step 1: Write failing tests** showing high-confidence positive large-wallet flow can add only a small bounded score, low-confidence data adds no material score, and a large transfer alone cannot create PRE-SURGE/SURGE.
- [ ] **Step 2: Run** the test and confirm failure because `onchainScore` is absent.
- [ ] **Step 3: Implement** a small confidence-gated component and neutral explanatory reasons.
- [ ] **Step 4: Run** core + onchain-score tests.
- [ ] **Step 5: Commit** `feat: add bounded onchain radar context`.

### Task 5: Browser Flow Model + Mobile UI

**Files:**
- Create: `ui/radar-onchain.js`
- Modify: `radar.html`
- Modify: `ui/radar-app.js`
- Modify: `ui/radar.css`
- Modify: `scripts/verify-radar-ui.js`
- Create: `scripts/verify-radar-onchain-ui.js`
- Modify: `package.json`

**Interfaces:**
- `PulseRadarOnchain.indexTokenFlows(tokenFlows)`
- `PulseRadarOnchain.themeFlowBars(themeFlows, window)`
- UI controls: `활동 집중` / `자금 흐름`, windows `1h / 4h / 24h`.

- [ ] **Step 1: Write failing UI contract test** for capital-flow controls, top positive/negative centered bars, provider health state, token detail metrics, and theme filter wiring.
- [ ] **Step 2: Run** the UI test and confirm expected missing labels/modules.
- [ ] **Step 3: Implement** compact capital-flow panel, theme mode toggle, wallet-volatility display, flow details under `자세히`, and partial/degraded copy.
- [ ] **Step 4: Run** radar UI + onchain UI tests.
- [ ] **Step 5: Commit** `feat: add mobile onchain capital flow view`.

### Task 6: Full Verification + Netlify Production

**Files:**
- Modify only if verification exposes regressions.

**Interfaces:**
- Existing `npm run verify` is the release gate.

- [ ] **Step 1: Run** `npm run verify` in GitHub Actions and inspect the complete output.
- [ ] **Step 2: Fix any regression with a targeted test first, then rerun the full suite.
- [ ] **Step 3: Confirm** Netlify production deploy matches the final commit and state is `ready`.
- [ ] **Step 4: Mobile smoke-check** `/radar`: market radar stays live when on-chain providers are degraded; flow panel shows real/partial data only when returned by API.
- [ ] **Step 5: Report** exact provider coverage and any environment variables still needed for richer live wallet data.
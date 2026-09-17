# Market Intelligence Crosscheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free-tier CoinMarketCap + CoinGecko/GeckoTerminal enrichment and crosscheck context to PulseRadar while preserving Binance-first scanning and safe partial failure.

**Architecture:** Add focused server-side provider adapters and an aggregator under `lib/market-intel/`, expose a read-only `api/market-intel.js`, and inject a compact enrichment block into `api/market-flow.js`. All external calls are cached and bounded for free-tier usage, and provider failures degrade to source-health warnings rather than breaking the scanner.

**Tech Stack:** Node.js/CommonJS, built-in `fetch`, Netlify Functions, existing GitHub Actions Foundation Verify.

**Spec:** `docs/superpowers/specs/2026-09-18-market-intelligence-crosscheck-design.md`

## Global Constraints
- Binance remains primary for real-time market/derivatives data.
- CoinMarketCap key name is exactly `CMC_API_KEY` and must never reach browser responses/logs.
- CoinGecko Demo key name is exactly `COINGECKO_API_KEY`, base URL `https://api.coingecko.com/api/v3`, auth header `x-cg-demo-api-key`.
- CoinMarketCap base URL is `https://pro-api.coinmarketcap.com`, auth header `X-CMC_PRO_API_KEY`.
- Provider 401/429/plan errors return warnings/health and do not stop Binance scanner execution.
- Never average conflicting source prices; expose source values and deltas.
- No full-universe per-symbol CMC/CG fan-out; use bounded/cacheable market endpoints.

---

### Task 1: Provider adapters

**Files:**
- Create: `lib/market-intel/coingecko.js`
- Create: `lib/market-intel/coinmarketcap.js`
- Create: `scripts/verify-market-intel-providers.js`
- Modify: `package.json`

**Interfaces:**
- `createCoinGeckoProvider({fetchImpl, apiKey, now})` → `{ available, getOverview(), getAssetBySymbol(symbol), getDexDiscovery() }`
- `createCoinMarketCapProvider({fetchImpl, apiKey, now})` → `{ available, getLatestListings(limit), getAssetBySymbol(symbol) }`

- [ ] **Step 1: Write failing provider tests**

Verify exact base URLs/auth headers, no key in URLs, symbol normalization, successful normalized outputs and 429 fallback shape.

- [ ] **Step 2: Run provider test and confirm RED**

Run: `node scripts/verify-market-intel-providers.js`
Expected: FAIL because provider modules do not exist.

- [ ] **Step 3: Implement minimal providers**

CoinGecko uses `/global`, `/search/trending`, `/coins/categories`, `/search?query=...`, `/coins/markets`, and `/onchain/networks/trending_pools`/`new_pools` where supported by the Demo key. CoinMarketCap uses `/v1/cryptocurrency/listings/latest` and `/v2/cryptocurrency/quotes/latest?symbol=...` with bounded limits.

- [ ] **Step 4: Run provider test and confirm GREEN**

Run: `node scripts/verify-market-intel-providers.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add CMC and CoinGecko providers`

### Task 2: Aggregation, caching and crosscheck

**Files:**
- Create: `lib/market-intel/service.js`
- Create: `scripts/verify-market-intel-service.js`
- Modify: `package.json`

**Interfaces:**
- `createMarketIntelService({coinGecko, coinMarketCap, now, cacheTtlMs})`
- `getOverview()` → `{status, updatedAt, health, global, trending, categories, listings, warnings}`
- `getAsset(symbol)` → `{status, symbol, updatedAt, sources, crosscheck, warnings}`
- `getDexDiscovery()` → `{status, updatedAt, health, pools, warnings}`

- [ ] **Step 1: Write failing service tests**

Cover one-provider-down partial success, cache hit/no duplicate fetch within TTL, price/market-cap deltas without averaging, and warning propagation.

- [ ] **Step 2: Run service test and confirm RED**

Run: `node scripts/verify-market-intel-service.js`
Expected: FAIL because service module does not exist.

- [ ] **Step 3: Implement minimal aggregator**

Use promise settlement per provider, compact normalized fields, TTL caches by mode/symbol, and `deltaPct(a,b)` only when both numbers are finite/nonzero.

- [ ] **Step 4: Run service test and confirm GREEN**

Run: `node scripts/verify-market-intel-service.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: aggregate market intelligence crosschecks`

### Task 3: Netlify API and market-flow integration

**Files:**
- Create: `api/market-intel.js`
- Create: `scripts/verify-market-intel-api.js`
- Modify: `api/market-flow.js`
- Modify: `package.json`

**Interfaces:**
- `GET /api/market-intel?mode=overview`
- `GET /api/market-intel?mode=asset&symbol=BTCUSDT`
- `GET /api/market-intel?mode=dex`
- `api/market-flow.js` response gets `marketIntel:{health,global,trending,categories,warnings}` when enrichment succeeds, or an unavailable warning block when it does not.

- [ ] **Step 1: Write failing API/integration tests**

Verify GET-only behavior, invalid symbol 400, keys absent from serialized responses, and market-flow enrichment failure does not alter existing scanner rows/signals.

- [ ] **Step 2: Run API test and confirm RED**

Run: `node scripts/verify-market-intel-api.js`
Expected: FAIL because endpoint/integration is absent.

- [ ] **Step 3: Implement endpoint and compact integration**

Instantiate providers from `process.env.CMC_API_KEY` and `process.env.COINGECKO_API_KEY`; keep singleton service caches warm across function invocations where runtime reuse permits.

- [ ] **Step 4: Run API test and confirm GREEN**

Run: `node scripts/verify-market-intel-api.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: expose market intelligence API`

### Task 4: Full verification and deployment readiness

**Files:**
- Modify: `.github/workflows/foundation-verify.yml` only if `npm run verify` does not already execute the new scripts through `package.json`.

- [ ] **Step 1: Run full repository verification**

Run: `npm run verify`
Expected: PASS including all new market-intel scripts.

- [ ] **Step 2: Confirm secret-safety contract**

Search serialized fixtures/output for `CMC_API_KEY`, `COINGECKO_API_KEY`, `X-CMC_PRO_API_KEY` values and ensure no secret value is returned.

- [ ] **Step 3: Open PR**

PR title: `feat: add CoinMarketCap and CoinGecko crosschecks`

- [ ] **Step 4: Require Foundation Verify GREEN before merge**

Do not merge on pending/failing CI.

- [ ] **Step 5: Merge and verify Netlify production deploy**

Confirm production deploy references the merge commit and all functions deploy successfully.

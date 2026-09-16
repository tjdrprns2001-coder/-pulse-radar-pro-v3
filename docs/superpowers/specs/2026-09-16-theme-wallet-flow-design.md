# Theme Expansion + On-Chain Wallet Flow Design

## Goal

Extend PulseRadar Pro v3 with broader theme classification and a public on-chain capital-flow layer so users can see not only which themes are active, but also where token and wallet activity is concentrating across supported chains.

The feature must remain research-oriented. Wallet-flow and theme-flow signals indicate observed public on-chain activity and must not be presented as guaranteed future price direction.

## Scope

This design adds five connected capabilities to the current LIVE RADAR:

1. Expand the theme taxonomy beyond the current top-level set.
2. Support one primary theme plus multiple secondary themes per asset.
3. Add a public on-chain flow ingestion layer for supported chains.
4. Aggregate wallet and token flows into token-level and theme-level capital-flow summaries.
5. Render compact mobile-first flow cards and charts inside `/radar` and feed a small, explainable on-chain component into PRE-SURGE/SURGE reasoning.

The existing 1m/5m history, Binance Spot/Futures stream, DEX discovery, beginner labels, pagination, theme heat, alerts, Netlify deployment path, and current scoring behavior remain intact.

## Initial Supported Chains

Phase 1 supports:

- Solana
- Ethereum
- Base
- BNB Smart Chain / BSC

Later expansion can add Arbitrum, Polygon, Sui, and other chains after the phase-1 adapters are stable.

## Theme Taxonomy

### Primary Themes

Initial expanded set:

- AI
- MEME
- DeFi
- RWA
- L1
- L2
- Gaming
- DePIN
- Privacy
- NFT
- SocialFi
- DEX
- Lending
- Liquid Staking
- Restaking
- Oracle
- Storage
- Stablecoin
- Payments
- Exchange Token
- Perp DEX
- Launchpad
- BTC Ecosystem
- Solana Ecosystem
- Base Ecosystem
- Ethereum Ecosystem
- Other / Unclassified

### Classification Model

Each market may have:

- `primaryTheme`: exactly one primary theme.
- `secondaryThemes`: zero or more additional themes.
- `themeConfidence`: 0-100.
- `themeSource`: deterministic registry, metadata, chain ecosystem, or unclassified.

Classification priority:

1. Token-address registry when available.
2. Curated project/token registry.
3. Reliable project metadata.
4. Chain ecosystem classification as a secondary theme.
5. Explicit `Other / Unclassified` fallback.

Ticker text alone must not force a low-confidence classification.

## Theme Aggregation Changes

Existing theme heat remains, but aggregation will use `primaryTheme` for counting to avoid double-counting. Secondary themes can be shown in details and can later support optional cross-theme views.

Each theme summary additionally includes:

- `netFlow1hUsd`
- `netFlow4hUsd`
- `netFlow24hUsd`
- `largeWalletNetFlowUsd`
- `activeWalletDelta`
- `newLargeWalletCount`
- `cexNetFlowUsd` when reliable labels exist
- `dexNetFlowUsd`
- `walletFlowConfidence`

The UI may rank themes by either activity concentration or observed net capital flow, but the two metrics remain visually separate.

## On-Chain Flow Architecture

### Adapter Boundary

Add a server-side adapter layer with a normalized interface:

- `api/onchain-flow.js`
- `lib/onchain/solana.js`
- `lib/onchain/evm.js`
- `lib/onchain/labels.js`
- `lib/onchain/aggregate.js`

Adapters return normalized transfer/activity records without exposing provider-specific response shapes to the UI.

### Normalized Flow Record

A flow event contains:

- `chain`
- `txHash`
- `timestamp`
- `tokenAddress`
- `symbol` when known
- `fromAddress`
- `toAddress`
- `amountToken`
- `amountUsd` when price is available
- `fromLabel`
- `toLabel`
- `fromType`
- `toType`
- `direction`
- `confidence`

Labels/types can include:

- exchange
- dex
- bridge
- whale / large-holder
- contract
- unlabeled wallet

Unknown addresses remain unlabeled. The system must not invent exchange or owner identities.

## Public Wallet Tracking Model

This feature analyzes public blockchain activity only. It must not attempt to identify private individuals behind unlabeled addresses.

### Large Wallet Definition

Use configurable value thresholds rather than a universal fixed wallet identity. The first implementation can classify a transfer as `large` using USD notional thresholds and can maintain token-specific overrides later.

Default starting bands:

- `largeTransferUsd`: 100,000 USD
- `veryLargeTransferUsd`: 1,000,000 USD

These are anomaly thresholds, not claims about institutional ownership.

### Wallet Volatility

Define `walletVolatility` as a 0-100 activity-instability score using public address-level changes over rolling windows. Inputs may include:

- transfer count acceleration
- inflow/outflow imbalance
- large-transfer frequency
- balance-change magnitude when available
- number of newly active large wallets

The score is an activity-volatility indicator, not a price-volatility forecast.

## Flow Aggregation

### Token-Level Summary

For each token and time window (1h, 4h, 24h), calculate when data quality allows:

- gross inflow USD
- gross outflow USD
- net flow USD
- large-wallet inflow USD
- large-wallet outflow USD
- large-wallet net flow USD
- active wallet count
- active wallet delta
- new large wallet count
- exchange inflow USD
- exchange outflow USD
- exchange net flow USD
- DEX inflow/outflow USD
- wallet volatility 0-100
- data confidence

### Theme-Level Summary

Token summaries roll up into the token's `primaryTheme` to produce:

- theme net flow 1h / 4h / 24h
- large-wallet net flow
- wallet volatility average
- number of tokens with positive net flow
- number of tokens with negative net flow
- active wallet delta
- flow concentration share

Do not sum the same token into multiple themes in the default view.

## CEX / DEX Interpretation

When reliable address labels exist:

- transfer to labeled exchange address -> exchange inflow
- transfer from labeled exchange address -> exchange outflow
- exchange net flow = inflow - outflow

For DEX/AMM activity, use known protocol/program/router labels where available.

Unlabeled wallet-to-wallet transfers remain wallet flow only and must not be described as exchange flow.

## Radar Scoring Integration

On-chain flow is an additional context component, not a dominant signal.

Add a bounded `onchainScore` with a small weight to the total radar score. It may use:

- positive large-wallet net flow
- positive active-wallet delta
- rising wallet volatility with sufficient liquidity
- confirmed DEX inflow / participation growth

Risk controls:

- low-confidence flow data cannot materially raise a score
- thin-liquidity assets retain existing risk penalties
- large transfers alone do not create SURGE/PRE-SURGE
- exchange inflow is not automatically bullish or bearish

Reasons can include neutral explanatory tags such as:

- `대형 지갑 순유입 증가`
- `활성 지갑 증가`
- `온체인 활동 급증`
- `거래소 유입 증가`
- `거래소 유출 증가`

The app must avoid directional claims unless directly describing measured net flows.

## UI Design

### Theme Section

Keep the current `테마 쏠림` section and add a compact mode switch:

- `활동 집중`
- `자금 흐름`

In `자금 흐름` mode, each theme card shows:

- theme name
- 1h net flow
- 4h net flow
- 24h net flow
- large-wallet net flow
- wallet volatility
- short neutral annotation

Examples:

- `대형 지갑 순유입 증가`
- `활성 지갑 증가`
- `거래소 유입 우세`
- `거래소 유출 우세`
- `온체인 변동성 높음`

### Capital Flow Panel

Add a compact `자금 흐름` section above the paginated market list.

Default mobile view:

- top 5 positive net-flow themes
- top 5 negative net-flow themes
- selected window: 1h / 4h / 24h
- horizontal bars centered around zero

Tapping a theme filters the radar list exactly like current theme heat interaction.

### Token Row / Details

Default compact row remains short. `자세히` expands to show when available:

- 1h / 4h / 24h net flow
- large-wallet net flow
- wallet volatility
- active wallet delta
- exchange net flow
- data confidence

Do not add raw address lists to the default row.

### Wallet Detail Drawer

A token's expanded flow view may show a small list of the largest recent public addresses involved. Addresses are visually shortened, for example:

- EVM: `0x12ab…90ef`
- Solana: `9YkA…pQ2z`

Full public address may be copied/opened only from an explicit detail action. No owner identity is inferred unless supplied by a trusted label source.

## Data Freshness and Caching

Server-side caching is required to control provider/API usage.

Suggested freshness:

- live/fast flow cache: 30-60 seconds
- 1h aggregates: refresh every 1-5 minutes
- 4h/24h aggregates: refresh every 5-15 minutes
- address-label registry: long cache / static bundle

The API response includes:

- `updatedAt`
- `stale`
- `providerHealth`
- `coverage`
- `confidence`

The UI must clearly show degraded/stale state rather than fabricating missing values.

## Provider Strategy

Provider-specific credentials must remain server-side in environment variables. The architecture must allow swapping providers without changing UI contracts.

Preferred order:

1. Use reliable public/free endpoints where practical.
2. Add provider adapters for richer indexed data when credentials are configured.
3. Never hardcode secrets into repository files.

The first implementation may ship in a graceful-degradation mode where on-chain cards show partial coverage until all chain providers are configured.

## Error Handling

- Provider unavailable -> keep market radar working; mark on-chain section degraded.
- Chain unsupported -> no fabricated values; display unavailable.
- Price missing -> retain token amounts but exclude from USD aggregates.
- Duplicate transfers -> dedupe by chain + txHash + log/index identity.
- Unknown labels -> treat as unlabeled wallet.
- Low-confidence token mapping -> exclude from theme flow totals rather than guessing.
- Extreme transfer outliers -> show them, but cap their contribution to normalized scoring to prevent one transfer dominating PRE-SURGE.

## Testing

Add tests for:

- expanded theme registry and primary/secondary theme classification
- no low-confidence ticker guessing
- normalized EVM flow records
- normalized Solana flow records
- exchange inflow/outflow classification only for trusted labels
- token 1h/4h/24h net-flow aggregation
- large-transfer thresholds
- wallet volatility bounded 0-100
- theme-level flow rollup without double counting
- on-chain scoring weight and confidence gating
- graceful provider failure
- stale-state response
- mobile capital-flow UI labels and filters
- existing radar/history/themes/alerts/API/stream/Netlify/full repository verification remaining green

## Module Boundaries

### `ui/radar-themes.js`

Expand theme registry and expose primary/secondary classification.

### `lib/onchain/labels.js`

Own trusted address labels and address-type lookup.

### `lib/onchain/evm.js`

Normalize EVM-compatible chain activity for Ethereum, Base, and BSC.

### `lib/onchain/solana.js`

Normalize Solana activity.

### `lib/onchain/aggregate.js`

Compute token/window/theme summaries, large-wallet metrics, and wallet volatility.

### `api/onchain-flow.js`

Expose normalized cached flow summaries to the browser.

### `ui/radar-onchain.js`

Browser-side rendering/model helpers for flow display and interaction.

### `ui/radar-app.js`

Orchestrate on-chain snapshot loading, merge flow summaries into scored markets, apply theme filter interaction, and render compact token details.

### `radar.html` / `ui/radar.css`

Add compact flow mode controls, flow chart container, health state, and mobile layout.

## API Contract

Example response shape:

```json
{
  "updatedAt": "ISO-8601",
  "stale": false,
  "providerHealth": {
    "solana": "live",
    "ethereum": "live",
    "base": "live",
    "bsc": "degraded"
  },
  "tokenFlows": [],
  "themeFlows": [],
  "coverage": {
    "chains": 4,
    "tokens": 0
  }
}
```

The UI must tolerate empty arrays and partial provider coverage.

## Deployment

Continue using the current GitHub `main` -> Netlify production path for mobile validation. Provider secrets, if required, must be configured through Netlify environment variables and never committed.

## Success Criteria

The feature is complete when:

- expanded theme taxonomy appears without breaking current theme heat
- assets can expose one primary and multiple secondary themes
- Solana, Ethereum, Base, and BSC adapters use the normalized flow contract
- token-level and theme-level 1h/4h/24h net flows render when data is available
- wallet volatility displays as an activity metric
- large-wallet flow and exchange/DEX flow are only shown when supported by public data and trusted labels
- theme capital-flow chart can filter the radar list
- on-chain context adds explainable, bounded context to PRE-SURGE/SURGE scoring
- provider degradation does not break LIVE RADAR
- full repository verification passes
- Netlify production deploy is `ready`

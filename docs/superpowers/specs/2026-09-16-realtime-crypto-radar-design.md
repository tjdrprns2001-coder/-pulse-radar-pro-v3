# Real-Time Crypto Radar Design

Date: 2026-09-16
Project: PulseRadar Pro v3
Status: Approved design for implementation planning

## 1. Goal

Add a production-oriented real-time crypto monitoring subsystem to PulseRadar Pro v3 without breaking the existing chart, SMC/ICT, futures, mobile, and analysis workflows.

The radar must monitor as broadly as practical across centralized and decentralized markets, surface meaningful anomalies quickly, and avoid pushing raw market noise directly into the browser.

Primary outcomes:

- Monitor Binance spot and futures markets in near real time.
- Monitor major DEX ecosystems and newly created pairs/tokens across supported chains.
- Detect short-window price, volume, liquidity, order-flow, and listing anomalies.
- Rank signals into PRE-SURGE / SURGE / RISK classes instead of showing every movement.
- Show a dedicated LIVE RADAR interface that links directly into existing PulseRadar chart/analysis views.
- Keep the browser light by aggregating and scoring on the server/edge side.
- Degrade gracefully when one data source is unavailable.

## 2. Scope

### Centralized exchange coverage

Initial required CEX coverage:

- Binance Spot: all actively tradable quote pairs supported by the project, prioritizing USDT, USDC, FDUSD, BTC, and ETH quoted markets.
- Binance USD-M Futures: all active perpetual/futures symbols already compatible with the project.

The architecture must support adding other exchanges later without changing the normalized event contract.

### DEX and chain coverage

The first implementation must support the major ecosystems below through adapter-based connectors:

- Solana
- Ethereum
- BNB Smart Chain
- Base
- Arbitrum
- Optimism
- Polygon
- Avalanche C-Chain
- Sui
- Aptos
- TON where reliable public market feeds are available
- Tron where reliable public market feeds are available
- Linea
- zkSync Era
- Blast
- Mantle
- Scroll
- Sonic
- Berachain
- Sei
- Injective
- Cosmos/EVM ecosystems where pair-level market data can be normalized
- Arc

The implementation must not hard-code the monitoring engine to a particular DEX. Each provider/chain is represented by a source adapter that emits the same normalized market event format.

### DEX venue targets

Adapters should cover high-activity venues and aggregators when data is reliably available. Examples include Uniswap-family pools, PancakeSwap, Raydium, Orca, Meteora, Jupiter-related pool discovery, Aerodrome, Camelot, Trader Joe, and chain-native launchpads or AMMs. Aggregator feeds may be used to expand coverage, but venue-specific source identity must be preserved in normalized events.

## 3. Non-goals

The first implementation will not:

- Execute trades.
- Custody funds or private keys.
- Promise complete coverage of every token on every chain when upstream data does not expose reliable pair metadata.
- Treat a social-media mention as an official partnership without official-source verification.
- Push one browser WebSocket per token or pair.

## 4. Architecture

The subsystem is divided into five isolated layers.

### 4.1 Source adapters

Each adapter owns one upstream source or protocol family and exposes:

- connect()
- disconnect()
- health()
- snapshot()
- stream(onEvent)

Adapters may use WebSocket, SSE, block/event subscriptions, or short-interval REST polling depending on provider capabilities.

Required resilience behavior:

- exponential reconnect with jitter
- stale-stream detection
- reconnect counters
- per-source circuit breaker
- fallback to a secondary source or REST polling when possible
- no global radar failure when one source is degraded

### 4.2 Normalization layer

All raw source events are converted to a common MarketEvent format.

Minimum fields:

- source
- venue
- chain
- marketType: spot | futures | dex
- symbol
- baseAsset
- quoteAsset
- tokenAddress or mint when applicable
- pairAddress when applicable
- eventType
- eventTime
- receivedTime
- price
- priceUsd when available
- baseVolume
- quoteVolumeUsd
- liquidityUsd when available
- fdvUsd when available
- marketCapUsd when available
- buyVolumeUsd / sellVolumeUsd when available
- txCount / buys / sells when available
- makerCount or uniqueTraderEstimate when available
- pairCreatedAt when applicable
- sourceConfidence

The normalized identity must be address-aware so tokens with duplicate tickers are not merged incorrectly.

### 4.3 Rolling metrics engine

Maintain bounded rolling windows per market for:

- 10s
- 30s
- 1m
- 5m
- 15m
- 1h

Metrics include:

- price return
- high/low expansion
- quote volume
- volume acceleration
- buy/sell imbalance
- trade count acceleration
- liquidity delta
- liquidity-to-volume ratio
- FDV/liquidity ratio
- new-wallet or unique-trader acceleration when available
- new-pair age
- cross-venue price divergence
- volatility expansion

The engine must use memory-bounded ring buffers or compact aggregates rather than retaining unbounded raw ticks.

### 4.4 Signal engine

Signals are deterministic, inspectable, and versioned.

Core signal types:

1. PRICE_SPIKE
   - rapid positive or negative move on 10s/30s/1m/5m windows

2. VOLUME_SPIKE
   - current short-window volume significantly exceeds its recent baseline

3. LIQUIDITY_INFLOW
   - material increase in DEX liquidity

4. LIQUIDITY_OUTFLOW
   - sudden liquidity removal or deterioration

5. NEW_PAIR
   - newly created pair meeting minimum metadata and liquidity requirements

6. BUY_PRESSURE
   - strong buy-side imbalance with sufficient activity

7. SELL_PRESSURE
   - strong sell-side imbalance with sufficient activity

8. BREAKOUT_ACCELERATION
   - simultaneous price, volume, and volatility expansion

9. PRE_SURGE
   - rising activity before a large move; combines volume acceleration, trader/tx growth, liquidity stability or growth, and controlled price expansion

10. SURGE
    - confirmed multi-factor acceleration with stronger thresholds than PRE_SURGE

11. LIQUIDITY_RISK
    - high FDV/liquidity, fast liquidity withdrawal, thin-liquidity price moves, or unstable pool conditions

12. CROSS_VENUE_DIVERGENCE
    - abnormal price separation between major venues for the same verified asset

13. LISTING_OR_DISCOVERY
    - newly discovered market, newly listed CEX pair, or newly indexed DEX pair

Signal rules must include noise floors so a tiny illiquid pool cannot outrank a liquid market solely because of a large percentage move.

### 4.5 Delivery layer

The browser subscribes to one compact application-level stream rather than upstream market feeds directly.

The server publishes only:

- ranked alerts
- top movers
- new pairs
- health state
- watchlist updates
- lightweight market snapshots required by radar cards

Delivery should support WebSocket or SSE, with automatic REST snapshot fallback.

## 5. Scoring

Every alert receives independent scores rather than a single opaque number.

Required components:

- momentumScore
- volumeScore
- liquidityScore
- participationScore
- freshnessScore
- riskScore
- confidenceScore

Derived labels:

- WATCH
- PRE-SURGE
- SURGE
- RISK

A combined radarScore may be shown for sorting, but the UI must expose the component reasons so users can understand why a token ranked highly.

Initial weighting must be configurable and versioned. Threshold calibration must live in configuration, not scattered through UI code.

## 6. Noise and safety filters

For DEX pairs, configurable minimums apply before high-priority ranking:

- minimum liquidity
- minimum recent quote volume
- minimum transaction count
- minimum pair age or explicit exemption for NEW_PAIR alerts

The engine must reduce confidence or suppress ranking for:

- extremely low-liquidity pairs
- incomplete price data
- stale feeds
- symbol-only identities without verified token address
- suspicious FDV/liquidity ratios
- one-sided price prints with no meaningful volume

A newly created low-liquidity token can still appear in NEW PAIRS, but it must be labeled as high risk and must not automatically receive a high SURGE rank.

## 7. LIVE RADAR UI

Add a dedicated LIVE RADAR surface integrated with the current PulseRadar interface.

Required views:

### LIVE RADAR

Ranked real-time anomaly feed.

Each row/card shows:

- symbol
- chain/venue
- current price
- 1m and 5m change
- volume spike indicator
- liquidity and liquidity delta when available
- signal class
- radarScore
- concise reason chips
- age for new pairs
- risk state
- last update time

Clicking an item opens the existing chart/analysis flow for that market when supported.

### NEW PAIRS

Sort/filter by:

- chain
- venue
- pair age
- liquidity
- volume
- buy/sell imbalance
- FDV

### VOLUME SPIKE

Markets ranked by abnormal volume acceleration, not absolute volume alone.

### LIQUIDITY ALERT

Show major liquidity inflows and outflows, with special emphasis on sudden removals.

### TOP MOVERS

Separate CEX and DEX views with 1m/5m/15m windows.

### FILTERS

Global filters:

- chain
- CEX/DEX
- quote asset
- minimum liquidity
- minimum volume
- minimum radarScore
- signal type
- pair age
- include/exclude high-risk pairs

Filters must persist locally so reopening the site preserves the user setup.

## 8. Integration with existing PulseRadar features

The radar is additive. Existing pages and chart engines remain functional.

Integration points:

- selecting a supported Binance symbol opens the current unified chart workspace
- selecting a DEX token passes address-aware context into the analysis layer
- radar data can provide context to existing SMC/ICT analysis without changing SMC calculation logic
- existing mobile declutter rules remain in effect
- existing symbol/search behavior must not regress

## 9. Data-source strategy

Use provider priority lists rather than relying on one vendor.

For each chain or venue, define:

- primary real-time source
- secondary source
- snapshot source
- maximum acceptable staleness
- rate limit budget

The source manager chooses the best healthy source at runtime.

If an upstream provider requires an API key, the key must remain server-side and be injected via environment variables. No private API key is shipped to browser JavaScript.

## 10. Performance requirements

Targets for the first production release:

- browser receives only ranked/summarized events, not full raw feeds
- radar UI remains responsive with at least 2,000 retained alert rows in client history
- render only visible rows using virtualization when lists are large
- stale source indication appears within 15 seconds for expected high-frequency streams
- alert-to-UI delivery target under 3 seconds after the engine receives sufficient data, excluding upstream provider delay
- memory usage remains bounded under long-running sessions
- source disconnects do not crash the UI

## 11. Persistence

Persist only what is useful for history and calibration.

Recommended persisted entities:

- alerts
- hourly signal summaries
- source health summaries
- market metadata
- token/pair identity mappings
- calibration outcomes

Do not persist every raw tick indefinitely.

A lightweight database can be added behind a repository interface so the first implementation can start with the deployment environment available to PulseRadar and migrate later without changing signal logic.

## 12. Alert history and deduplication

An alert fingerprint consists of:

- normalized market identity
- signal type
- scoring version
- time bucket

Repeated events should update/strengthen the existing alert during a cooldown window rather than spam new rows.

Escalation is allowed, for example:

WATCH -> PRE-SURGE -> SURGE

or

NORMAL -> LIQUIDITY_RISK

## 13. Health monitoring

Expose a small system health panel showing:

- connected/degraded/offline sources
- event rate
- processing lag
- latest event time per source
- reconnect count
- fallback status

A source failure must be visible instead of silently producing incomplete market coverage.

## 14. Testing strategy

### Unit tests

- normalization
- symbol/address identity
- rolling windows
- scoring functions
- signal thresholds
- deduplication
- source-health state machines

### Adapter contract tests

Each source adapter must pass the same contract tests using recorded fixtures.

### Replay tests

Recorded market event sequences must be replayable through the engine to verify that expected PRE-SURGE, SURGE, volume, and liquidity signals are emitted.

### UI tests

Verify:

- sorting/filtering
- stale state
- large-list virtualization
- mobile layout
- chart-navigation integration
- duplicate ticker handling

### Regression tests

Existing PulseRadar chart, Futures client, SMC/ICT, multi-chart, and mobile behavior must remain covered by existing verification gates.

## 15. Deployment model

Because Vercel serverless functions are not designed for a permanently open high-volume market WebSocket collector, the live collector must be isolated from the static/frontend deployment.

Preferred model:

- PulseRadar frontend remains on its current web deployment.
- A dedicated always-on collector/aggregator service maintains upstream WebSocket and chain subscriptions.
- The collector publishes compact radar events to the frontend through a stable API/WebSocket/SSE gateway.

The collector must be deployable independently so market monitoring does not depend on a user keeping the PulseRadar page open.

## 16. Delivery phases

### Phase 1 — core engine

- normalized MarketEvent schema
- Binance spot/futures adapters
- rolling metrics
- signal engine
- dedupe
- health model

### Phase 2 — LIVE RADAR UI

- ranked radar feed
- filters
- top movers
- volume spike
- health UI
- existing chart navigation

### Phase 3 — DEX adapters

- EVM adapter group
- Solana adapter group
- additional chain adapters
- new pair discovery
- liquidity monitoring

### Phase 4 — expanded coverage and calibration

- lower-volume chains
- provider failover tuning
- PRE-SURGE/SURGE calibration
- historical outcome tracking

The code should be architected for the final broad coverage from Phase 1, even though adapters are added incrementally.

## 17. Acceptance criteria

The feature is complete when all of the following are true:

1. Binance spot/futures active markets are monitored continuously by the collector.
2. The supported DEX adapters produce address-aware normalized events.
3. The signal engine can emit PRICE_SPIKE, VOLUME_SPIKE, NEW_PAIR, LIQUIDITY_INFLOW/OUTFLOW, PRE_SURGE, SURGE, and LIQUIDITY_RISK signals.
4. The LIVE RADAR UI updates without manual refresh.
5. Users can filter by chain, venue, signal, liquidity, volume, and risk.
6. A radar row can navigate into the existing analysis/chart experience when the market is supported.
7. Upstream failures are exposed through health state and do not crash the application.
8. Browser performance remains stable without direct per-token upstream WebSockets.
9. No API secret is exposed to the browser.
10. Existing chart, SMC/ICT, mobile, and futures verification gates continue to pass.

## 18. Explicit design decisions

- Server/collector-side aggregation is mandatory; direct browser subscription to every market is rejected.
- Token identity is contract/mint-address aware; ticker alone is never sufficient for DEX identity.
- Broad chain coverage is implemented through adapters, not chain-specific logic in the signal engine.
- All high-priority signals must carry explainable reasons and a confidence/risk state.
- New-pair discovery and surge detection are separate concepts.
- Provider degradation is visible and measurable.
- Signal thresholds and weights are versioned configuration.
- Existing PulseRadar behavior remains backward-compatible while the radar is added as a new subsystem.

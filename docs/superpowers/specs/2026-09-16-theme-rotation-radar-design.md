# Theme Rotation Radar Design

## Goal

Extend PulseRadar Pro v3 so the LIVE RADAR measures real 1-minute and 5-minute market changes from short rolling history, classifies markets into themes, computes a theme concentration index, displays theme-level concentration as an interactive chart that filters the market list, and strengthens realtime anomaly detection across Binance Spot, Binance Futures, and broad multi-chain DEX discovery.

## Scope

This design adds eight connected capabilities to the existing `radar.html` / `ui/radar-app.js` flow:

1. Rolling short-term price and volume history for accurate 1m and 5m change calculations.
2. Realtime Binance Futures WebSocket ingestion alongside Spot.
3. Broader DEX discovery while preserving duplicate suppression and low-quality filtering.
4. PRE-SURGE/SURGE scoring refinement using true short-window history, participation, buy/sell imbalance, liquidity, and volume impulse.
5. Theme classification for CEX and DEX markets.
6. Theme aggregation and concentration scoring.
7. A mobile-first theme concentration chart and theme filter integration.
8. In-app strong-signal transition alerts for meaningful state changes such as WATCH → PRE-SURGE and PRE-SURGE → SURGE.

The existing beginner-friendly market cards, pagination, signal labels, Binance/DEX market ingestion, and Netlify/Vercel routing remain in place.

## Data Sources

Use the market data already entering LIVE RADAR and extend the realtime path where needed:

- Binance Spot live all-ticker stream and snapshot data.
- Binance Futures live all-ticker stream and snapshot data.
- Multi-chain DEX data returned by `/api/radar?mode=snapshot`, including DexScreener and GeckoTerminal discovery.

No theme score or radar signal may be interpreted as a guarantee of future price direction. These features represent current concentration of activity and anomaly signals.

## Short-Term History

### Objective

Replace the existing tick-to-previous-tick approximation with timestamped rolling observations so `change1m` and `change5m` represent actual elapsed windows.

### Storage

Maintain an in-memory history per market identity in the browser. Each observation stores:

- `ts`
- `price`
- `quoteVolumeUsd` when available
- `txCount` when available
- `buyVolume` and `sellVolume` or equivalent imbalance inputs when available

Retain enough observations for at least 6 minutes and prune older entries continuously.

### Window Calculation

For each current market row:

- `change1m`: current price versus the closest observation at or before 60 seconds ago.
- `change5m`: current price versus the closest observation at or before 300 seconds ago.
- `volumeDelta1m` and `volumeDelta5m`: current cumulative/rolling volume field versus the matched historical observation when the source field is cumulative or comparable.
- `txDelta1m` and `txDelta5m` when transaction counts are comparable.
- If a window does not yet have enough history, expose it as unavailable rather than fabricating a value.

The scoring layer may consume these fields but must preserve current fallback behavior for markets that lack history.

## Binance Futures Realtime

`ui/radar-stream.js` will manage independent Spot and Futures WebSocket connections with shared reconnect/state handling.

Normalized Futures records use:

- `marketType: 'futures'`
- `id: 'binance:futures:<symbol>'`
- current price
- quote volume when present
- 24h price change when present
- event timestamp and receive timestamp

A failure in one socket must not stop the other. UI health should distinguish Spot and Futures stream state where practical while retaining a simple overall `STREAM LIVE` indicator when at least one realtime stream is healthy.

## DEX Discovery Expansion

The snapshot API continues to combine DexScreener and GeckoTerminal but broadens discovery without creating duplicate pools.

Requirements:

- preserve chain/pair-address de-duplication;
- keep token-profile, boost, search, new-pool, and trending-pool discovery;
- expand search coverage with theme-oriented terms such as AI, meme, RWA, DeFi, gaming, DePIN, privacy, and launch/new-pair terms;
- prefer higher-confidence or stronger-liquidity duplicate records;
- keep explicit low-liquidity/risk labeling instead of silently presenting thin pools as normal opportunities.

## PRE-SURGE / SURGE Refinement

`ui/radar-core.js` should use true short-window metrics whenever available.

PRE-SURGE should emphasize early broad participation rather than an already-completed price spike. Inputs include:

- 1m/5m volume impulse;
- transaction/participation growth;
- buy/sell imbalance;
- liquidity stability or inflow;
- moderate early price acceleration;
- source confidence and market quality.

SURGE should require stronger confirmed momentum plus activity and must retain risk gating so thin-liquidity pumps are not promoted as clean signals.

The reason list must remain human-readable in Korean and should expose the main trigger components.

## Theme Classification

### Theme Set

Initial top-level themes:

- AI
- MEME
- DeFi
- RWA
- L1
- L2
- Gaming
- DePIN
- Privacy
- Other / Unclassified

### Classification Strategy

Use a deterministic registry first. The registry can classify known symbols, token addresses, project slugs, or stable metadata when present. DEX assets without a reliable match remain `Other / Unclassified`.

Do not guess a theme from price behavior or ticker text alone when confidence is low.

The classifier interface returns:

- `theme`
- `confidence`
- `source` describing how the classification was obtained

A market belongs to one primary theme for the first version so aggregation is simple and explainable.

## Theme Aggregation

For every visible radar refresh, aggregate all monitored markets by theme.

Each theme summary includes:

- `marketCount`
- `activeSignalCount`
- `surgeCount`
- `preSurgeCount`
- `riskCount`
- `avgRadarScore`
- `avgChange1m`
- `avgChange5m`
- `volumeImpulse`
- `buyPressure`
- `liquidityUsd`

Unavailable source metrics are ignored in the relevant mean rather than coerced to zero.

## Theme Concentration Index

Create a bounded 0-100 `themeHeat` score representing current concentration of activity, not a trading recommendation.

The first version combines normalized components:

- 30% active anomaly signal density
- 25% volume impulse
- 20% average radar score
- 15% buy-pressure strength
- 10% short-term price impulse

Risk-heavy themes receive a visible risk annotation but are not silently removed from ranking. This prevents illiquid speculative bursts from appearing identical to healthy broad participation.

The aggregation module also computes:

- `dominantThemeShare`: top theme heat divided by the sum of positive theme heat values.
- `themeBreadth`: number of themes with meaningful non-zero activity.

## User Interface

### Placement

Add a `테마 쏠림` section between the top summary metrics/tabs and the paginated market results.

### Default Chart

Use a compact horizontal bar chart ranked by `themeHeat` descending. Show all defined themes; mobile must remain readable without horizontal scrolling.

Each bar/card shows:

- Theme name
- Theme heat 0-100
- Active signal count
- A short annotation such as `거래량 집중`, `매수세 강함`, `PRE-SURGE 증가`, or `위험 신호 다수`

### Interaction

Tapping a theme applies that theme as a market filter. Tapping the active theme again clears it.

The market result count, pagination, and existing search filters update using the same filtered data flow.

Add an `전체 테마` reset control.

### Beginner Copy

Use Korean labels in the default mobile view:

- `테마 쏠림`
- `집중도`
- `활성 신호`
- `거래량 집중`
- `매수세 강함`
- `위험 신호 다수`
- `1분 변화`
- `5분 변화`

Detailed component values may appear in an expandable detail area, but the default view prioritizes the heat score and explanation.

## Signal Transition Alerts

Alerts are in-app by default and do not place trades or make recommendations.

Trigger only on state transitions after the market has been observed at least once, for example:

- `WATCH → PRE-SURGE`
- `PRE-SURGE → SURGE`
- `WATCH → SURGE`
- any state → `RISK` when risk rises above the configured threshold

Avoid repeated alerts for the same unchanged state. Keep a short cooldown per market and provide a compact recent-alert area or toast that names the market, new state, and top reasons.

## Module Boundaries

### `ui/radar-history.js`

Own rolling market observations and elapsed-window calculations.

Public interface:

- `record(market, timestamp?)`
- `metricsFor(marketId, currentMarket, timestamp?)`
- `reset()`

### `ui/radar-themes.js`

Own theme registry, classification, aggregation, normalization, and concentration scoring.

Public interface:

- `classifyMarket(market)`
- `aggregateThemes(markets)`
- `themeHeat(themeSummary, populationStats)`

### `ui/radar-stream.js`

Own independent Binance Spot/Futures WebSocket connections, normalization, reconnection, and health aggregation.

### `ui/radar-alerts.js`

Own signal-transition detection and cooldown state.

Public interface:

- `observe(market)`
- `recent()`
- `reset()`

### `ui/radar-app.js`

Remain the orchestration layer. It merges incoming data, records history, enriches ranked markets with history metrics and theme metadata, applies the selected theme filter, evaluates alerts, and renders theme summaries plus market rows.

### `api/radar.js`

Own broad snapshot ingestion across Binance Spot/Futures and multi-source DEX discovery.

### `radar.html`

Add the theme section and alert area, and load the new modules before `radar-app.js`.

### `ui/radar.css`

Add mobile-first theme chart/card and alert styling without disrupting the existing sticky toolbar and pager.

## Data Flow

1. Snapshot or Spot/Futures stream market event arrives.
2. Existing market merge updates the latest market map.
3. `radar-history` records the observation.
4. Ranking/scoring receives actual short-window metrics when available.
5. `radar-themes` assigns a primary theme.
6. All ranked markets are aggregated by theme.
7. Theme heat values are normalized across the current monitored population.
8. Theme section renders before market rows.
9. Theme selection flows into the same `filtered()` path used by other filters.
10. `radar-alerts` compares state transitions and surfaces only meaningful changes.

## Error Handling

- Missing 1m/5m history: display `-` and preserve fallback scoring.
- Missing volume or buy/sell data: omit that component from the theme component mean and renormalize using available components.
- Unknown theme: classify as `Other / Unclassified`.
- Empty theme after user filters: keep the theme visible but show zero matching rows.
- One Binance socket failing: keep the other alive and reconnect independently.
- Stream reconnects: retain recent history during short reconnects; prune normally by timestamp.
- Snapshot refreshes must not duplicate identical timestamp observations excessively.
- DEX source failure: return surviving sources and health metadata instead of failing the whole radar where possible.
- Alert subsystem failure must never block market rendering.

## Testing

Add contract and behavior tests for:

- 1m and 5m elapsed-window lookup.
- Insufficient-history behavior.
- History pruning.
- Spot and Futures stream normalization and independent reconnect contracts.
- Expanded DEX discovery terms and de-duplication.
- PRE-SURGE using true history metrics when present.
- Thin-liquidity false-SURGE rejection.
- Known theme classification and unclassified fallback.
- Theme aggregation counts and means.
- Theme heat bounded to 0-100.
- Risk-heavy theme annotation.
- Theme UI labels and module loading.
- Theme selection filter wiring.
- Signal transition alert de-duplication and cooldown behavior.
- Existing radar, Netlify, foundation, chart, SMC, and release-gate verification continuing to pass.

## Deployment

Changes continue on the existing GitHub main branch and deploy through the already-linked Netlify project for mobile testing. Vercel remains compatible but is not required for this temporary validation path.

## Success Criteria

The feature is complete when:

- LIVE RADAR reports true elapsed 1m/5m change when enough observations exist.
- Binance Spot and Futures both update through realtime streams independently.
- DEX discovery covers the expanded source/search set without duplicate-pool inflation.
- PRE-SURGE reflects early multi-factor participation and SURGE remains risk-gated.
- Markets receive deterministic primary theme metadata or an explicit unclassified state.
- A theme concentration chart appears on mobile and desktop.
- The chart reflects live radar inputs and updates automatically.
- Selecting a theme filters the market list and preserves pagination behavior.
- Theme heat is clearly described as activity concentration, not a prediction.
- Meaningful signal transitions surface as non-repeating in-app alerts.
- Full repository verification passes.
- Netlify production deploy is `ready` with the new commit.

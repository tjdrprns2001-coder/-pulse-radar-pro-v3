# Theme Rotation Radar Design

## Goal

Extend PulseRadar Pro v3 so the LIVE RADAR measures real 1-minute and 5-minute market changes from short rolling history, classifies markets into themes, computes a theme concentration index, and displays theme-level concentration as an interactive chart that filters the market list.

## Scope

This design adds four connected capabilities to the existing `radar.html` / `ui/radar-app.js` flow:

1. Rolling short-term price and volume history for accurate 1m and 5m change calculations.
2. Theme classification for CEX and DEX markets.
3. Theme aggregation and concentration scoring.
4. A mobile-first theme concentration chart and theme filter integration.

The existing beginner-friendly market cards, pagination, signal labels, Binance/DEX market ingestion, and Netlify/Vercel routing remain in place.

## Data Sources

Use the market data already entering LIVE RADAR:

- Binance Spot live stream and snapshot data.
- Binance Futures market data available to the radar feed.
- Multi-chain DEX data returned by `/api/radar?mode=snapshot`.

No theme score may be interpreted as a guarantee of future price direction. It represents current concentration of market activity and anomaly signals.

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
- If a window does not yet have enough history, expose it as unavailable rather than fabricating a value.

The scoring layer may consume these fields but must preserve current fallback behavior for markets that lack history.

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

Use a compact horizontal bar chart ranked by `themeHeat` descending. Show up to all defined themes; mobile must remain readable without horizontal scrolling.

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

### `ui/radar-app.js`

Remain the orchestration layer. It merges incoming data, records history, enriches ranked markets with history metrics and theme metadata, applies the selected theme filter, and renders rows.

### `radar.html`

Add the theme section container and load the new modules before `radar-app.js`.

### `ui/radar.css`

Add mobile-first theme chart/card styling without disrupting the existing sticky toolbar and pager.

## Data Flow

1. Snapshot or stream market event arrives.
2. Existing market merge updates the latest market map.
3. `radar-history` records the observation.
4. Ranking/scoring receives actual short-window metrics when available.
5. `radar-themes` assigns a primary theme.
6. All ranked markets are aggregated by theme.
7. Theme heat values are normalized across the current monitored population.
8. The theme section renders before market rows.
9. Theme selection flows into the same `filtered()` path used by other filters.

## Error Handling

- Missing 1m/5m history: display `-` and preserve fallback scoring.
- Missing volume or buy/sell data: omit that component from the theme component mean and renormalize using available components.
- Unknown theme: classify as `Other / Unclassified`.
- Empty theme after user filters: keep the theme visible but show zero matching rows.
- Stream reconnects: retain recent history during short reconnects; prune normally by timestamp.
- Snapshot refreshes must not duplicate identical timestamp observations excessively.

## Testing

Add contract and behavior tests for:

- 1m and 5m elapsed-window lookup.
- Insufficient-history behavior.
- History pruning.
- Known theme classification and unclassified fallback.
- Theme aggregation counts and means.
- Theme heat bounded to 0-100.
- Risk-heavy theme annotation.
- Theme UI labels and module loading.
- Theme selection filter wiring.
- Existing radar, Netlify, foundation, chart, SMC, and release-gate verification continuing to pass.

## Deployment

Changes continue on the existing GitHub main branch and deploy through the already-linked Netlify project for mobile testing. Vercel remains compatible but is not required for this temporary validation path.

## Success Criteria

The feature is complete when:

- LIVE RADAR reports true elapsed 1m/5m change when enough observations exist.
- Markets receive deterministic primary theme metadata or an explicit unclassified state.
- A theme concentration chart appears on mobile and desktop.
- The chart reflects live radar inputs and updates automatically.
- Selecting a theme filters the market list and preserves pagination behavior.
- Theme heat is clearly described as activity concentration, not a prediction.
- Full repository verification passes.
- Netlify production deploy is `ready` with the new commit.

# Market Flow Expansion Design

## Goal

Add a keyless market-flow subsystem to PulseRadar Pro v3 that refines DEX swap pressure, compares activity across multiple centralized exchanges, and combines those signals into theme-level capital-rotation views without breaking the existing LIVE RADAR or on-chain flow path.

## Scope

Phase 1 focuses on DEX swap-flow normalization and a new `/api/market-flow` endpoint. Phase 2 adds multi-CEX public market comparison. Phase 3 combines DEX, CEX, and existing on-chain flow context into theme-rotation summaries.

No trading execution, leverage controls, buy/sell automation, or guaranteed directional predictions are added. All outputs are descriptive activity/flow indicators.

## Architecture

Keep `api/radar.js` as the existing broad market snapshot endpoint. Add a separate flow layer so failures, rate limits, and provider-specific logic do not affect LIVE RADAR.

New modules:

- `lib/market-flow/dex.js`: normalize DexScreener and GeckoTerminal activity into one DEX flow contract.
- `lib/market-flow/cex.js`: normalize public CEX ticker/volume snapshots into one exchange-comparison contract.
- `lib/market-flow/aggregate.js`: aggregate token and theme flow, compute concentration and rotation metrics.
- `api/market-flow.js`: cached server endpoint with partial/degraded behavior.
- `netlify/functions/market-flow.js`: Netlify wrapper.
- `ui/radar-market-flow.js`: browser indexing/format helpers.

Existing `api/radar.js`, `ui/radar-app.js`, `ui/radar-themes.js`, and the on-chain subsystem remain independently operable.

## Phase 1: DEX Swap Flow

Sources remain keyless:

- DexScreener
- GeckoTerminal

For each DEX market normalize:

- chain
- dex/venue
- pair/token address
- symbol/base/quote
- liquidity USD
- volume 5m / 1h / 24h when available
- buys/sells 5m / 1h / 24h when available
- transaction count
- buy/sell transaction imbalance
- short-window volume impulse
- liquidity movement proxy when consecutive snapshots exist
- data source confidence

Because these public APIs do not provide exact USD notional for every individual buy and sell, `buyUsdEstimate` and `sellUsdEstimate` must be clearly marked estimates derived from total volume weighted by transaction-side participation. They must never be presented as exact trade notional.

Derived fields:

- `buyShare`
- `sellShare`
- `swapImbalance`
- `buyUsdEstimate`
- `sellUsdEstimate`
- `netBuyUsdEstimate`
- `volumeImpulse5m`
- `activityScore` bounded 0-100

No single DEX metric can promote a market to PRE-SURGE/SURGE by itself.

## Phase 2: Multi-CEX Public Comparison

Use public endpoints only and isolate providers so any one exchange can fail independently.

Initial venues:

- Binance Spot/Futures
- Upbit
- Bithumb
- OKX
- Bybit
- Coinbase

Normalize per symbol/venue:

- venue
- market type
- normalized base/quote
- last price
- quote volume when available
- 24h change
- freshness
- source health

Aggregate comparable markets to produce:

- venue volume share
- venue price spread
- highest/lowest observed public price
- activity concentration by venue
- KRW-market premium/discount context only when a reliable conversion reference is available

Do not fabricate USD volume when an exchange does not provide enough information to derive it safely.

## Phase 3: Theme Rotation

Map token-level DEX/CEX records through the existing theme classifier.

For each theme compute:

- DEX activity share
- CEX activity share
- on-chain net flow when available
- 5m activity change
- 1h activity change
- 4h/24h context when available
- active market count
- breadth
- concentration share
- rotation score bounded 0-100

`rotationScore` describes concentration/change in observed activity, not expected price direction.

Theme UI adds a mode beside current activity/on-chain views:

- `시장 자금 이동`
- windows: `5m / 1h / 4h / 24h` depending on available data

The UI should highlight where activity is increasing or fading, but wording stays neutral, e.g. `활동 증가`, `활동 감소`, `DEX 집중`, `CEX 집중`, `온체인 동반`.

## API Contract

`GET /api/market-flow`

Response:

```json
{
  "updatedAt": "ISO-8601",
  "stale": false,
  "providerHealth": {},
  "dexFlows": [],
  "cexFlows": [],
  "tokenFlows": [],
  "themeFlows": [],
  "coverage": {},
  "confidence": 0
}
```

The endpoint always prefers partial successful data over total failure. If every provider is unavailable, return a degraded payload without breaking `/api/radar`.

## Caching and Rate Limits

- DEX source cache: approximately 15-30 seconds.
- CEX REST comparison cache: approximately 15-30 seconds.
- Theme aggregation runs from cached normalized records.
- Existing Binance browser WebSocket remains untouched for LIVE RADAR.
- Provider requests must be bounded and use timeouts.

## UI

Mobile-first compact cards remain unchanged by default.

Add a compact flow panel showing:

- top themes by current market-flow concentration
- selected window
- DEX/CEX contribution split
- net buy estimate for DEX with an `추정` label
- venue concentration for CEX
- provider health/degraded state

Detailed rows stay collapsed under `자세히`.

## Error Handling

- One failed source must not fail the endpoint.
- Missing side-volume data results in `null`, not zero.
- Unsupported windows display `-` rather than fake values.
- Stale cached data is marked `stale: true`.
- Existing LIVE RADAR remains functional when `/api/market-flow` fails.

## Testing

Add behavior tests for:

- DEX buy/sell estimate math and null handling
- aggregation bounds and concentration math
- multi-CEX normalization with missing fields
- provider partial failure
- theme rotation aggregation
- API route contract
- mobile UI labels and degraded state
- full `npm run verify`

GitHub Actions must continue watching `lib/**`, `api/**`, `netlify/**`, `ui/**`, `scripts/**`, and route/config files.

## Success Criteria

1. Existing LIVE RADAR tests remain green.
2. `/api/market-flow` works without API keys.
3. DEX buy/sell USD values are clearly labeled estimates.
4. Multi-CEX failures degrade independently.
5. Theme rotation combines only actually available data.
6. Netlify production deploy is `ready` on the final verified commit.

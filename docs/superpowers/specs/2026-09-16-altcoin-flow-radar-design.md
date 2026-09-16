# Altcoin Flow Radar Design

## Goal

Add a coin-level anomaly layer that highlights which altcoins are receiving unusual market attention or capital concentration using the existing LIVE RADAR, market-flow, and on-chain data paths.

## Scope

Add a new `ALTCOIN FLOW RADAR` view that ranks altcoins by descriptive anomaly/activity metrics. BTC and ETH can be excluded with an altcoin-only filter. The feature must not execute trades or present PRE-SURGE/SURGE as guaranteed price direction.

## Data Inputs

Reuse existing sources and normalized data only:

- Binance Spot/Futures live market data
- DexScreener
- GeckoTerminal
- `/api/market-flow` CEX/DEX aggregation
- Existing public on-chain flow when available

No new paid API is required for the baseline implementation.

## Coin-Level Metrics

For each normalized coin/base asset compute:

- 1m, 5m, and 15m volume anomaly versus recent rolling baseline
- DEX swap buy/sell imbalance
- DEX estimated net buy USD, explicitly labeled as an estimate
- CEX venue breadth: number of venues showing elevated activity
- Spot/Futures simultaneous activity flag
- Price-volume divergence: volume rises materially while short-window price movement remains relatively muted
- DEX liquidity change / liquidity impulse when sequential snapshots exist
- On-chain inflow context when available
- Theme membership
- freshness and data confidence

## Anomaly Score

Add `anomalyScore` bounded 0-100. It is a descriptive abnormal-activity score, not a forecast.

Recommended weighting:

- 30% short-window volume anomaly
- 20% DEX/CEX breadth and concentration
- 15% buy/sell imbalance
- 15% price-volume divergence
- 10% liquidity impulse
- 10% on-chain confirmation when available

Missing inputs must be omitted and weights renormalized rather than treated as zero.

## Signal Rules

Keep existing labels but tighten their meaning for this view:

- `WATCH`: mild unusual activity
- `PRE-SURGE`: several independent anomaly dimensions align, such as abnormal volume plus multi-venue breadth or DEX buy pressure
- `SURGE`: strong current activity expansion with price participation and liquidity/venue confirmation
- `RISK`: thin liquidity, unstable pool conditions, extreme one-sided activity, or data-quality concerns

No single metric alone can produce PRE-SURGE or SURGE.

## Altcoin Filter

Default ALTCOIN mode excludes BTC and ETH. Stablecoins and wrapped stablecoins are also excluded from ranked anomaly results by default. Users can switch to `전체 코인` to include majors.

## API / Data Contract

Extend `/api/market-flow` or add a derived client-side index without breaking the existing contract. New response fields may include:

```json
{
  "coinFlows": [
    {
      "baseAsset": "SOL",
      "theme": "L1",
      "anomalyScore": 0,
      "signal": "WATCH",
      "volumeAnomaly1m": null,
      "volumeAnomaly5m": null,
      "volumeAnomaly15m": null,
      "dexNetBuyUsdEstimate": null,
      "dexBuyShare": null,
      "cexVenueBreadth": 0,
      "spotFuturesAligned": false,
      "priceVolumeDivergence": false,
      "liquidityImpulse": null,
      "onchainNetFlowUsd": null,
      "confidence": 0
    }
  ]
}
```

Existing fields remain backward-compatible.

## UI

Add a compact `ALTCOIN FLOW RADAR` panel to the radar page with columns/cards for:

- COIN
- FLOW / concentration
- VOLUME anomaly
- BUY pressure
- DEX/CEX breadth
- ON-CHAIN context
- SIGNAL
- anomaly score

Controls:

- `알트코인만` / `전체 코인`
- window selector: `1m / 5m / 15m`
- sort by anomaly score, volume anomaly, flow concentration, or latest signal

Mobile keeps compact rows with details collapsed under `자세히`.

## Error Handling

- Missing 1m/5m/15m values render `-`, never `0`.
- One failed provider must not suppress results from successful providers.
- Stale data must be marked.
- If only one independent signal source is available, PRE-SURGE/SURGE promotion is disabled.

## Testing

Add behavior tests for:

- volume anomaly baseline math
- null/missing-value handling
- weight renormalization
- altcoin/stablecoin filtering
- multi-source confirmation requirement for PRE-SURGE/SURGE
- price-volume divergence detection
- spot/futures alignment
- UI labels and mobile compact rendering
- full `npm run verify`

## Success Criteria

1. Users can immediately see which altcoins have the strongest current abnormal activity.
2. Rankings combine CEX, DEX, and optional on-chain context without implying guaranteed price direction.
3. No single source or metric can independently trigger PRE-SURGE/SURGE.
4. Missing data remains null/`-` rather than becoming fake zeroes.
5. Existing LIVE RADAR, market-flow, and on-chain paths remain operational if this view fails.
6. Netlify production deploy is `ready` on the final verified commit.

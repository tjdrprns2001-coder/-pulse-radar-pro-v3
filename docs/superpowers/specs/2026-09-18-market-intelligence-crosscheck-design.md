# Market Intelligence Crosscheck Design

## Goal
Add free-tier CoinMarketCap + CoinGecko/GeckoTerminal enrichment to PulseRadar without replacing the existing Binance-first scanner. The result must improve market context and anomaly validation while degrading safely when either provider is unavailable or rate-limited.

## Data ownership
- Binance remains the primary source for real-time spot/futures price, OHLCV, order book and derivatives evidence.
- CoinMarketCap is secondary metadata/crosscheck for market cap, rank, circulating/total supply and 24h market metrics.
- CoinGecko Demo is secondary/tertiary context for global market state, categories/sectors, trending assets, market metadata and cross-exchange market data.
- GeckoTerminal is used for DEX-native/long-tail tokens and trending/new pool discovery; it must not override CoinGecko aggregated data for well-known assets.

## Authentication
- CoinMarketCap reads `CMC_API_KEY` only server-side and sends it as `X-CMC_PRO_API_KEY` to `https://pro-api.coinmarketcap.com`.
- CoinGecko Demo reads `COINGECKO_API_KEY` only server-side and sends it as `x-cg-demo-api-key` to `https://api.coingecko.com/api/v3`.
- Never expose either key to browser code, logs or API responses.

## Architecture
Create focused provider adapters under `lib/market-intel/` and one aggregation service. The service caches provider responses to respect free-tier quotas, normalizes source timestamps, resolves CoinGecko IDs through search data rather than guessing, and returns source health plus warnings instead of throwing away the whole response when one provider fails.

`api/market-intel.js` exposes read-only modes:
- `mode=overview`: global state, trending, categories and source health.
- `mode=asset&symbol=BTCUSDT`: CMC/CG market metadata and crosscheck deltas where possible.
- `mode=dex`: GeckoTerminal trending/new pools for early discovery.

Pulse AI directly consumes the same server-side market-intel service and injects a compact `marketIntel` context block into briefing/chat prompts. This avoids changing the existing market-flow anomaly payload or classification logic while still making CMC/CG/GeckoTerminal context available to AI analysis immediately.

## Crosscheck rules
- Never average conflicting prices blindly. Report per-source values and percentage deltas.
- CMC/CG disagreement is a warning/context signal, not a trading signal.
- Missing API key, 401/429/plan-gated endpoints or provider downtime must produce warning/health metadata while Binance scanning continues.
- Free-tier calls use short shared caches and bounded lists; no per-symbol fan-out across the full universe.

## AI context
Pulse AI receives compact source-health, global market, sector/category and trending summaries. It must describe these as corroborating context, not proof that news or metadata caused price movement.

## Testing
Add deterministic provider/service/API tests with mocked fetches for auth headers, base URLs, normalization, partial-provider success, cache behavior, crosscheck deltas and secret non-leakage. Add a regression contract proving Pulse AI is wired to market-intel context. Extend the repository Foundation Verify command so these regressions run in CI.

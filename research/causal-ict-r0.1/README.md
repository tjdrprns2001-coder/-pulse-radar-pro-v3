# Causal ICT R0.1 · PulseRadar Integration

This module is a research-only causal OHLCV verification layer for public ICT-style concepts. It is not a reconstruction of proprietary, paid, membership-only, or non-public ChartBro rules.

## Purpose

The layer answers a stricter question than ordinary chart annotation: **was this feature actually knowable at that historical bar?**

Every causal feature separates:
- `origin_bar`: where it visually belongs on the chart
- `known_bar`: where enough bars exist to confirm it
- `available_from_bar`: first bar where downstream logic may use it

The default R0.1 sequence is:
1. sell-side liquidity sweep + reclaim
2. bullish MSS within the declared window
3. later bullish FVG
4. first partial FVG revisit in discount
5. hypothetical intent on confirmed close
6. earliest hypothetical fill on the next bar open

The short-side sequence is symmetric.

## Execution contract

- standard OHLCV only
- signals evaluated on confirmed bar close
- same-close fills forbidden
- market fill simulated at next bar open
- if stop and target are both touched in one OHLC bar, stop is resolved first
- no pyramiding
- no broker, exchange order routing, API keys, wallet signing, webhook execution, or scheduled trading

## PulseRadar integration

- `ui/chart/causal-ict-engine.js` — sequential causal replay engine
- `ui/chart/causal-ict-ledger.js` — append-only local event ledger + prefix divergence detector
- Scanner v3 precision mode — 4H/1H causal sequence shadow state
- Book AI — first-class `causalIct` engine source and visible causal stage
- Recommendation promotion — causal timing contract failure hard-blocks; when available, RECOMMEND waits for long sequence `REVISIT / INTENT / FILLED`
- Crypto Research — `causal-ict-backtest` report with 1x/1.5x/2x cost stress, causal contract and prefix invariance checks

## Reference parity

The supplied Python synthetic fixture is treated only as deterministic implementation parity, not performance evidence.

Expected fixture:
- 24 bars
- 44 events
- 5 zones
- 0 intents
- 0 trades

JavaScript regression verifies the same counts plus:
- pivot confirmation delay
- FVG third-bar creation
- prefix invariance
- next-bar fill eligibility

TradingView Pine compilation and event-by-event parity remain a **manual TradingView-side verification** because Pine cannot be compiled inside the repository CI environment.

## Interpretation boundary

OHLCV-derived liquidity, FVG, MSS and order-block-like constructs are price-pattern proxies. They do not establish actual resting orders, institutional identity, queue position, partial fills, or executable market depth. Production performance claims require venue-specific transaction costs and, for microstructure claims, timestamped quote/depth/trade data.

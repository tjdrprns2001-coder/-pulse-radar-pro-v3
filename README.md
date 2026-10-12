# SMC Atlas research service

Read-only FastAPI backend. No order placement, exchange credentials or withdrawal functions.

## Run
Python 3.12 and Node.js required. Install `requirements.txt`; set `RESEARCH_TOKEN` to a random secret of at least 32 characters. Run `uvicorn service:app --host 0.0.0.0 --port 10000`.
Set `RESEARCH_URL` and the matching server-only `RESEARCH_TOKEN` in the site runtime environment. Never expose that token in browser assets.

`DB_PATH` defaults to /tmp/smc-research/state.sqlite. For durable hosting mount a persistent disk, point DB_PATH at that mount and set PERSISTENT_STORAGE=true. Free Render services can sleep and lose files at redeploy; this configuration is NOT durable or guaranteed 24/7. Scanning starts only after enabled configuration or a manual scan request. Limits: 50 symbols per market, three frames, minimum five-minute repeat interval. Markets are alphabetically selected, not ranked by turnover.

## Features and boundaries
- CCXT REST OHLCV, funding, OI, 20-level order book; CCXT Pro actual trade stream with ID deduplication. Availability depends on exchange and region. CVD is received trade-side volume since connection, resets on reconnect, and does not identify trader identities.
- Server scanner shares Atlas's JavaScript detection engine. Only closed, fresh, contiguous candle data is accepted. Spot and perpetual are separate market identities.
- SQLite signals preserve the first observation. Forward performance uses only complete contiguous candles after observation; default assumed roundtrip cost is 0.2%. Export records from the UI. This is observational tracking, not trade execution.
- tvscreener queries 20 TradingView records; default fields are independent of chart timeframe and may be delayed or forming.
- tradingview-mcp-server is invoked via real MCP stdio, allowlisted coin_analysis only. It is unofficial TradingView access.
- Freqtrade CLI entrypoint runs in an isolated subprocess for an original AtlasBaseline spot EMA/RSI strategy. It is NOT a backtest of the SMC/Wyckoff engine. Explicit fees, no modeled slippage; supported USDT spot exchanges are OKX, Binance and Kraken.
- CryptoScanBot, Hummingbot, OctoBot, Jesse and other complete trading platforms are not embedded. No claim of all exchange/timeframe support, profitable signals, fully validated SMC backtesting, push delivery or full-market simultaneous scanning.

## Dependencies and attribution
Pinned releases and their own licenses apply; dependencies are installed unmodified via pip, not relicensed by this project.
- CCXT 4.5.85 — MIT — https://github.com/ccxt/ccxt
- tvscreener 0.5.2 — https://github.com/deepentropy/tvscreener
- tradingview-mcp-server 0.8.1 — https://github.com/atilaahmettaner/tradingview-mcp
- Freqtrade 2026.9 — GPL-3.0 — https://github.com/freqtrade/freqtrade
- FastAPI 0.143.0; Uvicorn 0.54.0 — see distribution license metadata.
Shared Atlas SMC logic retains the original site's third-party attribution and WeloTrades/MPL provenance. Consult the site's attribution files before redistribution.

Tests: `python -m unittest discover -s tests -v` (from this directory). Site Node tests separately cover scanner, engine and authenticated proxy. No automatic trades are authorized or implemented.

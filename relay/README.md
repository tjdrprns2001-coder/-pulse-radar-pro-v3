# SMC Atlas regional market-data service

A read-only, bearer-authenticated relay for Bybit spot/linear/inverse and Binance USDⓈ-M/COIN-M public market data. It uses the exact exchange contracts, candles and tickers, not substitute exchanges or testnet.

Run `MARKET_RELAY_TOKEN=<32+ character secret> MARKET_RELAY_REGION=frankfurt PORT=10000 node relay/server.mjs`. Store secrets only in hosting runtime configuration; never commit them. `/healthz` is public. Data routes require authentication and expose only the existing `/api/markets`, `/api/candles`, `/api/ticker` contracts for the allowed exchanges. All other paths are denied; no arbitrary upstream URLs. Requests are coalesced/cached and limited to 360 per minute. The website contacts this service server-side, so the token is never sent to browsers.

Render free instance, Frankfurt. A free service can sleep after inactivity; first connection can take approximately a minute. A service-region probe must succeed before claiming blocked routes are repaired. Exchange terms and legal availability still apply; no guarantee if the exchange blocks the hosting provider or region.

Site environment: `MARKET_RELAY_URL` (the confirmed onrender.com HTTPS URL), `MARKET_RELAY_TOKEN` (secret). Unconfigured sites keep their existing direct API behavior.

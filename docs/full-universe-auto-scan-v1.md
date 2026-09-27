# Full-universe automatic scanner v1

This recovers the September 27 scanner design as an isolated worker so the existing Pulse Radar scanner can keep its current behavior while the new engine is validated.

## Fixed contract

- Universe: every Binance USDT `TRADING + PERPETUAL` futures symbol.
- Automatic scan: **always the entire universe**. Size filters never narrow an automatic run.
- Automatic cadence: one run per **30-minute bucket**. The PostgreSQL `bucket_key` unique constraint is the cross-process/restart lock, so page refreshes, re-entry, worker restarts, or duplicate scheduler ticks do not create a second scan in the same bucket.
- Per-symbol data: confirmed/closed `5m → 15m → 1H → 4H → 1D → 1W` candles, OI profile, and funding.
- Manual scan: explicit admin-only POST and one or more size tiers.
- Size tiers: market-cap percentile over symbols with resolved market caps — lower 25% `small`, middle 50% `mid`, upper 25% `large`. Unresolved market caps are `unknown`; they remain in automatic full-universe scans and are not silently relabeled for manual tier scans.
- Read path: the dashboard should use cached `GET /api/v1/results`. Merely opening, reloading, or returning to the page must never start a scan.
- Manual write path: `POST /api/v1/manual-scan` with Bearer `FULL_SCAN_ADMIN_TOKEN` only.

## Rate-limit and runtime shape

The worker uses a bounded symbol worker pool and a global spacing gate. Defaults are 8 symbol workers and 240 REST requests/minute. Six timeframe requests are themselves bounded to two concurrent timeframe tasks per symbol. Funding is fetched in one bulk request per run. OI uses the existing Binance-first v2 OI provider and therefore retains its current fallback behavior.

A futures `bookTicker` WebSocket layer is sharded at 180 streams per connection. It is supplemental live context only; the 30-minute snapshot remains reproducible from confirmed REST bars, OI, funding, market-cap snapshot, and the persisted run record.

## API

- `GET /api/v1/health` — worker/scheduler/WebSocket status.
- `GET /api/v1/results?tiers=small,mid&limit=1000` — latest completed cached run. Omitting `tiers` returns all cached items.
- `GET /api/v1/runs/:id?items=1` — progress/result for a known run.
- `POST /api/v1/manual-scan` — admin-only manual scan. JSON: `{ "tiers": ["small", "mid", "large"] }`. Returns `202` and a run id immediately.

## Environment

Required: `DATABASE_URL`. Recommended: `FULL_SCAN_ADMIN_TOKEN`, `PULSE_ALLOWED_ORIGIN`.

Tuning: `FULL_SCAN_WORKERS=8`, `FULL_SCAN_REQUESTS_PER_MINUTE=240`, `FULL_SCAN_KLINE_ROWS=64`, `FULL_SCAN_WS_SHARD_SIZE=180`, `FULL_SCAN_TICK_MS=60000`, `FULL_SCAN_START_DELAY_MS=5000`, `FULL_SCAN_MARKET_CAP_TTL_MS=1800000`.

## Deployment boundary

Deploy `node workers/full-universe-auto-scan.mjs` as a separate long-running worker/web service. Do not replace the existing Pulse Radar/Selector runtime until this worker has accumulated stable production runs. The existing scanner can consume `/api/v1/results` as a cache-only source during validation.

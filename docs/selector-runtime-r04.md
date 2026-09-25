# Selector Runtime r0.4

Long-lived read-only worker for the selector evidence pipeline.

## Responsibilities
- Binance depth streams through one multiplexed WebSocket client per endpoint.
- Sequence-gap detection and REST snapshot resync.
- Ethereum/EVM Transfer polling through primary + secondary RPC.
- Block-hash conflict detection, finality status and correction-ready raw events.
- PostgreSQL append-only raw events, watermarks, retry/backfill queue, DLQ and correction links.
- Health endpoints: `/health`, `/ready`.

## Deployment
This worker is intentionally separate from Netlify/Vercel request functions. Run it on persistent Linux/container hosting.

1. Create PostgreSQL database.
2. Copy `deploy/selector-runtime.env.example` to a protected environment file.
3. Set `DATABASE_URL`, `EVM_RPC_PRIMARY`, optional `EVM_RPC_SECONDARY`, token contracts and symbols.
4. Build with `Dockerfile.selector-runtime` or install `deploy/selector-runtime.service`.
5. Keep the web dashboard/API read-only.

No private key, order, signing, withdrawal or token-transfer path exists in this worker.

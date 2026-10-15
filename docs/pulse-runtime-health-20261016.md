# Pulse AI scanner resilience and chart storage health

This change addresses scan request storms and stale data. It does **not** enable trading or replace existing model inference.

- Identical concurrent `runtime-scan.run(options)` requests share one in-flight Promise; different options remain independent.
- When the remote scanner returns a snapshot with an actual epoch timestamp older than five minutes, the service switches to the local scanner. The same freshness rule applies to local fallback data.
- A last-good snapshot is only reused during the five-minute grace period. It retains its original `updatedAt`, carries `partial: true` and provenance warnings. Once expired, an error is returned rather than claiming current market validity.
- Repeated remote failures trigger a 30-second cooldown, reducing unnecessary API work during partial outages.
- `GET /health/live` remains 200 when the HTTP process is alive.
- `GET /health/ready` remains 503 unless durable ChartBro storage has passed its write-read probe. Do not suppress this.
- New `GET /health/dependencies` returns HTTP 200 with a non-sensitive summary distinguishing alive HTTP from degraded ChartBro persistence. It never exposes URLs, passwords, or stack traces.

## Unresolved infrastructure
The connected Render workspace has a **separate** chartbro-oos Postgres database, but the unified application's Postgres connection details are not available to this integration. Do not silently attach the other service's database to the unified application, do not set a dummy `DATABASE_URL`, and do not change `health/ready` to 200 without a valid durable connection. Connect a dedicated Postgres database through `CHART_V1_DATABASE_URL` (or existing supported `DATABASE_URL`) with proper secret injection and successful startup smoke checks.

System One model deployment remains a separate resource: `DECISION_API_URL`, `DECISION_API_KEY`, and `DECISION_MODEL` must be configured to an authenticated Laya/Kev-compatible service. Neither chart DB nor model weights are provisioned by this change.

## Regression checks
`node scripts/verify-pulse-runtime-health.js` and `node scripts/verify-pulse-ai-core.js`. Observe `/health/live`, `/health/dependencies` and `/api/pulse-ai?mode=health` separately after deploying.

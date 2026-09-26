# IGNITION read-only API deployment

- Workspace: My Workspace
- Service: ignition-readonly-api
- Service ID: srv-das5aah7lnhs73fm3rvg
- Origin: https://ignition-readonly-api.onrender.com
- Runtime commit: fc1719c5accb74f60a702717182743e6ddb92424
- Deploy ID: dep-das5abh7lnhs73fm410g
- Existing Pulse service and private IGNITION deployment were not changed.
- Dedicated branch contains only the standalone API project. Do not merge this branch into Pulse main.
- Token stored in new Render service environment only, with 90-day expiry. No token values are in this document.

## External fetch verification (2026-09-27 KST)

| Request | Actual status |
|---|---:|
| Authenticated GET /api/v1/health | 200 |
| Authenticated GET /api/v1/results | 200, empty, candidates=0 |
| GET results without authentication | 401 |
| POST /api/v1/scans | 404 |
| POST /api/v1/jobs/test/step | 404 |
| POST /api/v1/samples/collect | 404 |
| GET /admin | 404 |
| GET results with disallowed origin | 403 |
| GET results with Pulse production origin and token | 200, exact origin CORS header |

Source D1 contained one failed scan (Binance HTTP 403) and no completed scans. Empty results are real; no fixtures were used as production data.

## Environment variable names

New API: IGNITION_READ_TOKEN, IGNITION_READ_TOKEN_EXPIRES_AT, IGNITION_UPSTREAM_TOKEN, NODE_VERSION. Optional rotation: IGNITION_READ_TOKEN_PREVIOUS, IGNITION_READ_TOKEN_PREVIOUS_EXPIRES_AT. Hosting supplies PORT.

Future Pulse server integration: IGNITION_API_BASE_URL, IGNITION_RESULTS_TOKEN. Existing Pulse environment was not changed, as requested. Securely provision its token separately; do not send it to browser code.

## Synchronization boundary

Authenticated results reads query the existing private API using a separate internal gateway credential. Only completed scans are returned, with a 5-second cache. Upstream failures return 503. This is latest-observed completion synchronization, not a complete historical mirror: the existing source exposes only its newest job and the new service's last-complete cache is memory-only. Restart or unobserved completion between reads can lose historical coverage. Complete-history recovery requires a source export change or durable result store, neither enabled under the instruction to leave the private site unchanged.

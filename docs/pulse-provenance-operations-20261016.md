# Pulse AI provenance, deployment drift and remaining blockers

## Correctness fixes

Pulse AI now caches complete briefing responses by `selectedSymbol` (12 most recent keys). Cross-symbol requests cannot reuse another selected symbol's AI narrative. A repeated AI narrative must disclose `narrativeReused: true` and `narrativeScanAsOf` when the scanner refreshed without a material event, rather than resetting its original source timestamp. The browser visibly shows that AI text may describe the prior scan while the candidate tiles show the latest scan.

`dataQuality.state` has an explicit last-good route: a previous usable snapshot served during temporary scanner outage is `PARTIAL`, never `LIVE`. Missing futures coverage is `DEGRADED`; an expired source snapshot is `STALE`. No claim is made that a full symbol count guarantees contemporaneous OI/taker/funding quality.

## Ongoing operational watchdog

Read-only `.github/workflows/production-drift-watch.yml` runs every six hours and can be triggered manually. It compares the exact 40-char deployed SHA in `/health/live` with the current scheduled workflow SHA, compares `/health/dependencies` release, and verifies Pulse AI's health endpoint. Deployment drift (including the observed missing Render auto-deploy after GitHub merges) and hard API failures cause a failed workflow. Known ChartBro and model gaps are reported as warnings, not concealed. The watchdog **does not** deploy, restart, buy cloud resources, send trades or change secrets.

The previously configured hourly ChatGPT condition watch is separate from this workflow and checks failures more frequently.

## Unresolved production work

- Unified ChartBro currently reports `postgres_not_configured`, and its `/health/ready` correctly remains HTTP 503. Do **not** change it to HTTP 200 without an authenticated durable Postgres write/read probe. The available Render OOS Postgres belongs to another runtime; separate schema support is implemented but *not* automatically linked. A free DB also expires, so it is not durable long-term storage.
- Laya bridge contract, Korean multilingual model routing and opt-in startup warmup are implemented. Real model weights, memory, hosting, HTTPS and Bearer secret are **not deployed**. TypeSafe `available=false` remains accurate. Enabling this requires a real model host with adequate memory, a secret token and actual prediction verification.
- Render service advertises auto-deploy on commit but has repeatedly not received GitHub merges without manual retry. Drift watchdog helps detect this, but the root webhook/permission issue must still be corrected at the hosting dashboard, or a secret-backed and tested deployment workflow should be set up separately.
- Heavy external scans and AI requests have variable wall-clock response times. Singleflight and bounded cache improve cost, not guarantee sub-second cold scans.

## Tests

`node scripts/verify-pulse-ai-provenance.js` and `node scripts/verify-production-release.js`. Run existing Pulse AI and ChartBro suites and verify live /health/live, /health/dependencies, /api/pulse-ai?mode=health and a fresh BTC brief after deploy.

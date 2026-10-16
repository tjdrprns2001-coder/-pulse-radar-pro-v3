# PulseRadar ChartBro storage / Laya deployment (2026-10-16)

## Verified constraints (Render)
- Unified service: `pulseradar-pro-unified-0926`, region `singapore`, branch `main`.
- Connected free database: `pulseradar-chartbro-oos-db`. This is **already in use by another research runtime**, so do not reconfigure or overwrite existing data or schemas.
- Render permits **one active free Postgres per workspace** and free DBs **expire 30 days after creation**, with no backups. An existing free instance is NOT a permanent production storage solution.
- The Render connector cannot read connection URLs or create a secret `fromDatabase` reference in an existing service's environment. Therefore no silent connection or readiness success is claimed here.

## Optional existing database connection — manual operator step
If explicitly authorized to share the existing database (with a separate schema and appropriate backup strategy), open the unified service's **Environment** settings in Render. Add:
- `CHART_V1_DATABASE_URL`: Render Postgres *internal* connection string for `pulseradar-chartbro-oos-db`; do not paste the string in chat or GitHub. Use Render's secret environment manager.
- `CHART_V1_DB_SCHEMA=chart_v1_unified`: validates the schema identifier; creates and routes ChartBro tables to `chart_v1_unified`. Existing non-ChartBro tables in `public` are not modified by this namespace feature.
- Leave `DATABASE_URL` and existing service variables unchanged.
- Save and deploy, then check `/health/live`, `/health/dependencies`, `/health/ready`, `/api/v1/runtime/health`. Only mark storage ready if Postgres schema creation and write/read smoke check both pass.
- An SQL schema separates table names; **it is not an access-control boundary** if database roles are shared. For proper confidentiality and long-term persistence, use a dedicated paid PostgreSQL database / least-privilege user and backups only with explicit owner approval.

Existing deployments without `CHART_V1_DB_SCHEMA` continue using the `public` search_path and are unchanged. Tests: `node scripts/verify-chart-storage-isolation.js`.

## Laya independent model runtime
The existing JS adapter expects `POST /v1/systemone` authenticated with Bearer `DECISION_API_KEY`. A Python `Router` and official Laya checkpoints must run in their **own** server, not in the existing Node/Vercel request handler.

The provided `services/decision-model/Dockerfile` installs `laya==0.4.8` and starts the authenticated bridge; this is a **build definition**, not a deployed model or proof that hardware has sufficient RAM. A 322M+ parameter transformer, PyTorch runtime, checkpoint cache and initial download are generally too large for a 512 MiB Render Free web service. Do not repurpose any existing user-facing service or provision a paid instance without approval.

On an appropriately sized, owner-approved model host:
- Set **secret** `DECISION_API_KEY` to a long random value (do not share it here).
- Set `LAYA_HOST=0.0.0.0`, `LAYA_MODEL=multilingual` (Korean questions), `LAYA_WARMUP=1`.
- Public HTTPS endpoint `GET /health` responds for process liveness; `GET /health/ready` responds 503 until a real prediction has succeeded and 200 thereafter.
- From the existing unified Node service, set `DECISION_PROVIDER=laya`, `DECISION_API_URL=https://model-host.example` (no `/v1/systemone` suffix), `DECISION_MODEL=multilingual`, and the same `DECISION_API_KEY`.
- Initial checkpoint downloads may be slow. Explicitly test actual inference and `/api/pulse-ai?mode=health` before claiming active. Increase adapter timeout only after latency is measured.
- The classifier remains **SHADOW_ONLY**: its score is not a measured future-return probability; no orders, rank promotion or risky trading signal generation.

For non-model contract smoke tests, run `python scripts/verify-laya-bridge-contract.py`. These tests substitute a deterministic fake Router to validate HTTP/auth and model selection. They **do not** test or simulate the accuracy, performance, RAM requirements, training or successful deployment of real Laya weights.

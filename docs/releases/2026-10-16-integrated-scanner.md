# Pulse Radar integrated scan release — 2026-10-16

Release candidate source: `98b1434bd2a734949a0dce1b21db25eb0418e9d4`.
Audited PRs: #316 (risk/Taker/OOS), #322 (classical and harmonic patterns),
#323 (OI freshness/Ichimoku), #324 (10TF), #325 (deep scan CPU/latency).

## Verification
- 19/19 GitHub Actions PR workflow runs passed on the integration head.
- Netlify preview checks passed; Vercel status was blocked by build-rate limit, not verified.
- Render production health and actual deep-scan latency must be tested after redeploy.
- The scanner deliberately marks incomplete or stale source data as unavailable,
  rather than interpreting a timeout or missing OI observation as a buy signal.

## Release safeguards
- Previous Render live Git revision: `5b95cbec80f2c49763b313132911193b303c2f88`.
- Do not claim CPU/latency speedup until measuring live endpoint wall time and completion.
- On smoke-test failure, roll back to the previous known-live revision and record the cause.

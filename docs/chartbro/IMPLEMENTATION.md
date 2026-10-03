# ChartBro causal analyzer implementation plan — 2026-10-04

Goal: implement the supplied 2026-10-03 Korean specification in the existing JavaScript repository, without changing existing analyzer behavior. Source metadata is user-supplied, not independently re-verified footage.

Architecture: shared deterministic CommonJS/browser feature modules; an append-only journal and cooperative scan worker; a read API mounted in existing api/index; a separate Korean canvas chart page. No additional Vercel function is created. UTC milliseconds internally; KST in UI; IANA sessions via Intl.

## Tasks and interfaces
1. `data.js`, `indicators.js`, `sessions.js`: normalize(rows,{tf,at,availability}), reject invalid OHLC/missing timestamps, split gaps, calculate warmup-safe EMA/MACD/stochastic/RVOL and fixed volume profile. Tests cover boundary, zero denominator, DST and as-of joins.
2. `engine.js`: analyze(rows,options) returns immutable snapshots/events with deterministic IDs, confirmed pivots, structural events/ranges, liquidity lifecycle, displacement and PD arrays. Prefix-invariance, lifecycle and gap fixtures precede code.
3. `models.js`, `research.js`: independent CISD/IOF/AMD/MMXM/SMT/Three Drive, divergence/cross windows, setup episodes and missing-safe Astra context, risk/cost/ambiguous outcome/OOS helpers. No source claims or invented probabilities.
4. `journal.js`, `service.js`, handler: append-only disk journal, strict venue adapter with deadlines/retry, immutable analysis cache, explicit partial jobs, checkpoint/resume/cancel; source coverage and evidence endpoints. Durable worker requires configured writable persistent path. Serverless scan writes disabled.
5. `chartbro-lab.html`, `ui/chartbro/*`: same object IDs for card and drawing, mobile ordering, replay cutoff, layers, timestamp/price transforms, request cancellation, PNG + JSON export. Display missing and stale states.
6. CI plus existing regressions, whole-change review, branch commit and GitHub PR.

## Review focus
- Gap or duplicate bars cannot create synthetic formations.
- A newly created zone cannot be retested on its creation bar.
- Old responses cannot replace a new symbol/timeframe.
- Contract OI and notional OI remain distinct; unknown/stale inputs cannot promote A.
- Serverless invocations cannot claim durable background execution.

## Acceptance and coverage
Automated fixtures are executable in `node --test tests/chartbro/*.test.js`.
Source access and audio/visual verification remain user-reported/unverified. Membership rules remain absent; their proxies are clearly research rules.
PostgreSQL migration is provided separately; the executable initial journal backend is single-worker disk storage. Multi-worker PostgreSQL runtime and real OOS campaign results must not be claimed complete without deployment/data.

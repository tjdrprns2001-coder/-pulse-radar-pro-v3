# 224MA Bowl Research v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible Universe-L-only 224MA bowl research pipeline with strict 120/120 precondition, frozen 3A/3B/3C definitions, chunked Binance history, a frozen 1H Volume+Ribbon+PriceDistance intersection, deterministic A/B/C/D cohorts, and fixed 24H/72H/7D outcomes.

**Architecture:** Extend Research Backtest v2 with a logically separate `bowl224` namespace and focused modules. Historical data is fetched through a reusable chunk-range service; daily bowl structures are detected only from fully closed 1D candles; 3B/3C confirmations are stored as later annotations; 1H intersection and 4H context are evaluated only after the 3B confirmation; future outcomes are fetched and stored separately.

**Tech Stack:** Node.js CommonJS core modules, Binance REST, Netlify Blobs, Netlify Functions v2 ESM adapters, vanilla HTML/CSS/JS, GitHub Actions via `npm run verify`.

**Spec:** `docs/superpowers/specs/2026-09-18-bowl-224-research-v1-design.md`

## Global Constraints
- Formal bowl events require `strict_bowl_120d=true`: exactly 120/120 prior completed daily closes below contemporaneous SMA224.
- `original_bowl_4m_80pct` remains descriptive only.
- 3A/3B/3C definitions are frozen and never retuned from outcomes.
- 3B = at least 2 of the next 3 completed daily closes above contemporaneous SMA224.
- 3C = within 14 completed days after 3A, low OR close within ±1 ATR(14) of SMA224, with close > SMA224 and close > previous close.
- 3B/3C never leak backward into the original 3A snapshot.
- 1H intersection is frozen to: VolumeRatio12h >= 3.0, RibbonWidthATR <= 1.5, PriceDistanceATR <= 2.0 on the same completed 1H candle.
- Search only the first 72 completed 1H candles after 3B confirmation and use only the first qualifying candle as primary entry.
- 4H context is observational only in v1 and cannot gate inclusion.
- Universe-L requires >=224 completed 1D candles; Universe-N is never hidden from the existing scanner.
- Formal outcomes are fixed to 24H/72H/7D with +10/+15/+20 hit labels, MFE, MAE, RR, time-to-hit, and MAE-before-hit.
- The manually accumulated 32-coin evidence is hypothesis-only and excluded from formal stats.
- First formal sample selects exactly 10 non-hypothesis Universe-L symbols by SHA-256 of `bowl224-v1|symbol`.
- No single Binance `limit=1000` request may be treated as proof of complete long-range coverage.
- Existing live scanner and Research Backtest v2 must remain operational independently.

---

### Task 1: Chunked Binance historical range service and coverage contract

**Files:**
- Modify: `lib/coin-scan/binance-provider.js`
- Create: `lib/research-backtest-v2/bowl224/coverage.js`
- Create: `scripts/verify-bowl224-range-fetch.js`

**Interfaces:**
- `provider.getKlinesRange(symbol, interval, {startTime,endTime,minBars,maxRequests})`
- returns `{rows, coverage:{requestedStartTime,requestedEndTime,actualFirstOpenTime,actualLastCloseTime,rowCount,requestCount,complete,gaps,stopReason}}`
- `assessWarmup({daily,h4,h1,m15,m5,future}) -> coverage summary`

- [ ] **Step 1: Write failing range-fetch tests**
  - Simulate >1000 daily bars requiring at least 2 requests.
  - Assert no duplicate open times at page boundaries.
  - Assert ascending order.
  - Assert a repeated identical page stops with `complete=false` and `stopReason='repeated-page'`.
  - Assert an empty premature page stops with `complete=false`.
  - Assert rows outside requested bounds are discarded.
- [ ] **Step 2: Run RED**
  - `node scripts/verify-bowl224-range-fetch.js`
  - Expected: missing `getKlinesRange` / coverage module.
- [ ] **Step 3: Implement deterministic pagination**
  - Each request uses `limit=1000`.
  - Advance from the last returned close/open boundary without overlap.
  - Dedupe by open time.
  - Enforce `maxRequests`.
  - Do not mark complete from row count alone; require requested temporal coverage.
- [ ] **Step 4: Add warm-up coverage contract**
  - Daily preferred 400D, hard bowl minimum sufficient for SMA224 + 120 historical-below observations.
  - 4H minimum 240 bars.
  - 1H minimum 500 bars.
  - lower TF only when requested.
  - future through +7D for outcome evaluation.
- [ ] **Step 5: Run GREEN** and commit `feat: add chunked historical range fetcher`.

### Task 2: Daily SMA224 feature engine, strict 120D gate, and Universe-L/N

**Files:**
- Create: `lib/research-backtest-v2/bowl224/daily-features.js`
- Create: `lib/research-backtest-v2/bowl224/universe.js`
- Create: `scripts/verify-bowl224-daily.js`

**Interfaces:**
- `buildDailySeries(rows) -> [{openTime,closeTime,close,high,low,ma224,atr14,...}]`
- `buildBowlFeatureAt(series,index) -> feature snapshot`
- `classifyBowlUniverse(series,index) -> {universe:'L'|'N',completedDailyCount,...}`

- [ ] **Step 1: Write failing tests**
  - SMA224 uses exactly the most recent 224 completed closes.
  - Unclosed/future daily candles are ignored.
  - Universe-L begins at exactly 224 completed daily candles.
  - `below224_days`, `below224_ratio_120d`, `max_consecutive_below224_days_120d` use pre-signal observations only.
  - `strict_bowl_120d=true` only at 120/120.
  - 119/120 => false.
  - `original_bowl_4m_80pct=true` at exactly 96/120 while strict remains false.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement SMA224 + ATR14 + slopes/distances**
  - `ma224`
  - `distance_to_ma224_pct`
  - `distance_to_ma224_atr`
  - `ma224_slope_5d`
  - `ma224_slope_20d`
- [ ] **Step 4: Implement Universe-L/N and strict gate**
  - no future reconstruction;
  - missing history yields null/insufficient, never zero.
- [ ] **Step 5: Run GREEN** and commit `feat: add strict 224MA daily features`.

### Task 3: Frozen 3A detector and later 3B/3C annotations

**Files:**
- Create: `lib/research-backtest-v2/bowl224/patterns.js`
- Create: `scripts/verify-bowl224-patterns.js`

**Interfaces:**
- `detect3A(series,index) -> 3A event | null`
- `annotate3B(series,event) -> annotation`
- `annotate3C(series,event) -> annotation`

- [ ] **Step 1: Write failing 3A tests**
  - require strict120 precondition;
  - previous close <= prior SMA224;
  - signal close > signal SMA224;
  - only first upward crossing in a continuous above-MA run.
- [ ] **Step 2: Write failing 3B tests**
  - exactly next 3 completed daily candles;
  - true at 2/3 or 3/3 closes above their own SMA224;
  - false at 1/3;
  - confirmation timestamp is the earliest close where the 2-of-3 condition becomes knowable true.
- [ ] **Step 3: Write failing 3C tests**
  - search exactly 14 completed daily candles after 3A;
  - neighborhood is low OR close within <=1.0 ATR14;
  - require close > SMA224 and close > previous close;
  - first qualifying day wins.
- [ ] **Step 4: Prove no backward leakage**
  - persist/clone 3A snapshot before annotation and assert 3B/3C do not mutate it.
- [ ] **Step 5: Implement minimal detectors/annotations.**
- [ ] **Step 6: Run GREEN** and commit `feat: freeze bowl 3A 3B 3C rules`.

### Task 4: Frozen 1H intersection and observational 4H context

**Files:**
- Create: `lib/research-backtest-v2/bowl224/intersection.js`
- Create: `lib/research-backtest-v2/bowl224/context4h.js`
- Create: `scripts/verify-bowl224-intersection.js`

**Interfaces:**
- `compute1hIntersectionFeatures(rows,index)`
- `findFirst1hIntersection(rows,{afterTs,maxCompletedBars:72})`
- `build4hContext(rows,{cutoffTs})`

- [ ] **Step 1: Write failing formula tests**
  - VolumeRatio12h = current completed 1H volume / mean(previous 12 completed 1H volumes).
  - EMA14/28/92 use completed candles only.
  - ATR14 is calculated from completed 1H candles.
  - true only if VolumeRatio12h >=3.0 AND RibbonWidthATR <=1.5 AND PriceDistanceATR <=2.0.
  - exact boundary values count as true.
- [ ] **Step 2: Write search-window tests**
  - starts strictly after 3B confirmation close;
  - examines at most first 72 completed 1H candles;
  - only first qualifying candle is primary;
  - later hits are repeats, not primary entries.
- [ ] **Step 3: Write 4H context tests**
  - cutoff only;
  - return/volume/EMA-distance/ATR-normalized features;
  - no boolean gate field that controls inclusion.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run GREEN** and commit `feat: add frozen bowl 1h intersection`.

### Task 5: Deterministic A/B/C/D cohorts and extended outcomes

**Files:**
- Create: `lib/research-backtest-v2/bowl224/groups.js`
- Create: `lib/research-backtest-v2/bowl224/outcomes.js`
- Create: `scripts/verify-bowl224-groups-outcomes.js`

**Interfaces:**
- `assignGroups({cohortType,bowlActive,intersectionActive,...})`
- `selectBaseline({symbol,signalEventId,candidateTimestamps,usedTimestamps})`
- `evaluateBowlOutcome({event,futureBars})`

- [ ] **Step 1: Write deterministic A/B/C tests**
  - A = 1H only;
  - B = bowl only;
  - C = same-timestamp bowl + 1H intersection;
  - separate 3A, actionable 3B, actionable 3C tables.
- [ ] **Step 2: Write D baseline tests**
  - same symbol;
  - same quarter, fallback same year;
  - deterministic SHA-256 ordering `bowl-baseline-v1|symbol|signalEventId|candidateTs`;
  - no manual choice;
  - no reuse when unused valid candidate exists;
  - unavailable rather than forced reuse.
- [ ] **Step 3: Write outcome RED tests**
  - inclusive `Hit_24H_10pct`, `Hit_72H_10pct`, `Hit_7D_10pct`, `Hit_72H_15pct`, `Hit_72H_20pct`, `Hit_7D_15pct`, `Hit_7D_20pct`;
  - 24H/72H/7D point return, MFE, MAE, RR;
  - first touch only for time-to-hit;
  - MAE-before-hit stops at first hit;
  - signal candle excluded;
  - incomplete 7D coverage => unavailable/null, not miss.
- [ ] **Step 4: Implement groups and outcome engine.**
- [ ] **Step 5: Run GREEN** and commit `feat: add bowl cohort groups and outcomes`.

### Task 6: Formal 10-symbol experiment runner, stats, storage, and API

**Files:**
- Create: `lib/research-backtest-v2/bowl224/store.js`
- Create: `lib/research-backtest-v2/bowl224/runner.js`
- Create: `lib/research-backtest-v2/bowl224/stats.js`
- Create: `api/bowl224-research.js`
- Create: `netlify/functions/bowl224-research.mjs`
- Create: `scripts/verify-bowl224-runner-api.js`
- Modify: `netlify.toml`
- Modify: `scripts/verify-netlify-temp.js`

**Interfaces:**
- storage prefixes under `research-v2/bowl224/*`
- `selectFormalSymbols({symbols,hypothesisRegistry})`
- `runner.runBatch({runId,startTs,endTs,...})`
- GET actions: `status|stats|events`
- POST actions: `run|evaluate` protected by admin token

- [ ] **Step 1: Write formal selection RED tests**
  - exclude hypothesis registry;
  - SHA-256 order by `bowl224-v1|symbol`;
  - select exactly 10 when >=10 available;
  - persist full ordered candidates and selected list;
  - never reselection by outcome.
- [ ] **Step 2: Write runner tests**
  - chunked range fetch is mandatory;
  - strict 3A extraction is exhaustive;
  - 3B/3C annotations later;
  - strict 3B → 72-candle 1H search;
  - 4H context capture;
  - outcome phase separate.
- [ ] **Step 3: Write stats tests**
  - hypothesis-only evidence excluded;
  - report strict 3A/3B/3C, intersection and A/B/C/D counts separately;
  - report hit rates, MFE/MAE/RR, +10% with MAE >= -3% share, time-to-hit distributions;
  - per-symbol breakdown to detect single-coin dominance.
- [ ] **Step 4: Write API/Netlify RED tests**
  - read-only GET remains public;
  - POST locked when token absent;
  - Functions v2 static Blobs import;
  - bounded limits.
- [ ] **Step 5: Implement store/runner/stats/API adapter.**
- [ ] **Step 6: Run GREEN** and commit `feat: add formal bowl224 experiment runtime`.

### Task 7: Korean bowl research dashboard and release gate

**Files:**
- Create: `bowl224-research.html`
- Create: `ui/bowl224-research.js`
- Create: `ui/bowl224-research.css`
- Create: `scripts/verify-bowl224-ui.js`
- Create: `scripts/verify-bowl224-research-v1.js`
- Modify: `research-backtest.html`
- Modify: `package.json`

**UI copy:**
- `224MA 밥그릇 연구`
- `Universe-L` / `Universe-N`
- `strict 120일`
- `3A` / `3B` / `3C`
- `1H 교집합`
- `A / B / C / D`
- `72H +10%`
- `7D +10% / +15% / +20%`
- `MAE -3% 이내`
- `Time-to-hit`
- `데이터 완전성`
- `가설용 32코인 제외`

- [ ] **Step 1: Write UI RED tests**
  - mobile layout;
  - coverage/warm-up status;
  - strict rule copy;
  - cohort/group tables;
  - MAE/time-to-hit;
  - explicit hypothesis-only exclusion;
  - no future-probability wording.
- [ ] **Step 2: Implement read-only dashboard**
  - independent API error states;
  - no admin token in browser.
- [ ] **Step 3: Link from `정식 백테스트` page.**
- [ ] **Step 4: Add aggregator `verify-bowl224-research-v1.js`.**
- [ ] **Step 5: Add `test:bowl224-research-v1` to `package.json` and release gate.**
- [ ] **Step 6: Run focused tests + full `npm run verify`.**
- [ ] **Step 7: Review final diff against spec**
  - >1000 pagination;
  - strict 120/120;
  - 3B/3C temporal leakage;
  - exact 1H thresholds;
  - 72-bar limit;
  - 4H non-gating;
  - deterministic 10-symbol selection;
  - hypothesis-only exclusion;
  - future outcome separation.
- [ ] **Step 8: Remove temporary TDD workflow if used.**
- [ ] **Step 9: Final Foundation Verify.**
- [ ] **Step 10: PR → squash merge → verify Netlify production merge commit → live smoke GET status/stats/events and mobile page. Do not execute production admin POST without a configured secret token.**

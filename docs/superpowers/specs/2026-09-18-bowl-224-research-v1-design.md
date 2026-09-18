# 224MA Bowl Research v1 Design

Date: 2026-09-18

## Goal
Add a formal 224-day moving-average “밥그릇” research layer on top of Research Backtest v2 for sufficiently seasoned coins, without replacing the existing 1H scanner.

The research goal is to test whether the 224MA structure adds measurable information beyond the existing 1H candidate logic.

This subsystem is research-only. It does not place orders, size positions, or claim future profitability.

## Hard Rules

1. **The existing scanner remains primary for all coins.**
   - The 224MA bowl layer is an additional higher-timeframe structural filter.
   - It must never suppress Universe-N new coins from the current scanner.

2. **Universe split is explicit.**
   - Universe-L: coins with at least 224 completed daily trading candles at the signal timestamp.
   - Universe-N: coins with fewer than 224 completed daily candles.
   - Bowl research runs only on Universe-L.
   - Universe-N remains eligible for the existing scanner and is reported as bowl-ineligible.

3. **No single-request historical fetch assumptions.**
   - Binance's 1000-row per-request limit must never be treated as sufficient for long mixed-timeframe studies.
   - Historical fetching must be paginated/chunked until the requested warm-up + signal window + future outcome window are completely covered.
   - Partial coverage must be marked unavailable, not silently treated as zero or no-signal.

4. **Feature snapshot cutoff is immutable.**
   - All bowl and scanner features are calculated only from candles fully closed at or before the signal timestamp.
   - Future 24H/72H/7D data are outcome-only and cannot influence event eligibility.
   - Signal-candle snapshots are immutable after persistence.

5. **3A / 3B / 3C are predeclared and all recorded.**
   - Do not choose a “winner” in advance.
   - Do not modify their definitions after seeing outcome results.
   - Any later definition change requires a new version.

6. **A/B/C/D comparison groups are predeclared.**
   - A: existing 1H candidate formula only.
   - B: bowl condition only.
   - C: bowl condition + existing 1H candidate formula simultaneously.
   - D: matched non-signal baseline windows from the same symbol/time regime.
   - All four groups are generated mechanically.

## Data Pipeline First

### Why
The current Binance provider can request at most 1000 klines per call and existing historical frame helpers may fetch only a small fixed number of rows per timeframe. That is not sufficient for a rigorous 224-day structure study with lower-timeframe confirmation and a 7-day future outcome.

### Required Chunk Fetcher
Introduce a reusable paginated historical kline service.

Interface:

`getKlinesRange(symbol, interval, {startTime, endTime, minBars, maxRequests})`

Behavior:
- request in deterministic chunks of up to 1000 bars;
- walk forward or backward without overlap;
- dedupe by candle open time;
- sort ascending;
- reject candles outside requested bounds;
- expose:
  - requested range,
  - actual first/last candle,
  - fetched candle count,
  - request count,
  - completeness,
  - gaps where detectable;
- stop safely on repeated/empty pages;
- cache immutable historical chunks.

No caller may infer completeness solely because one request returned 1000 rows.

### Warm-up Requirements
For each candidate daily signal timestamp:

Daily:
- minimum 224 bars for SMA224 itself;
- plus at least 120 completed daily bars before the signal evaluation window for below-MA distribution measurements;
- preferred daily warm-up: 400 completed daily candles where listing history allows.

4H:
- enough history for the existing structural indicators and a stable context window;
- target minimum: 240 completed 4H bars before signal time.

1H:
- enough history for the existing candidate formula and indicator warm-up;
- target minimum: 500 completed 1H bars before signal time.

15m / 5m:
- fetched only when required by the existing lower-timeframe formula;
- use sufficient closed-bar warm-up for all current indicators.

Future:
- reserve complete future coverage through signal close + 7 days for outcome evaluation.
- Future bars live in an outcome fetch/evaluation phase only.

A missing warm-up field remains null/insufficient and cannot be synthesized from future data.

## 224MA Daily Features

All values are calculated on completed 1D candles.

### MA224
`ma224 = SMA(close, 224)`

Store at minimum:
- `ma224`
- `distance_to_ma224_pct`
- `distance_to_ma224_atr`
- `ma224_slope_5d`
- `ma224_slope_20d`

### Below-224 History
Record continuous values instead of only a binary rule:

- `below224_days`
  - consecutive completed daily closes immediately preceding the 3A signal day that were below their contemporaneous SMA224.
- `below224_ratio_120d`
  - fraction of the preceding 120 completed daily closes below their contemporaneous SMA224.
- `max_consecutive_below224_days_120d`
  - maximum below-SMA224 closing streak inside the preceding 120-day window.
- `days_since_first_ma224_available`

### Frozen Original-Bowl Approximation
`original_bowl_4m = true` when:
- the prior 120 completed daily observations are available; and
- at least 80% of those closes are below their contemporaneous SMA224.

This is an explanatory flag and does not replace the continuous features above.

## Frozen 3A / 3B / 3C Definitions

### 3A — First Upward Break
A 3A event occurs on daily candle D when:
- previous completed daily close <= previous day's SMA224; and
- D close > D SMA224.

Record:
- `is_3a`
- `cross_pct`
- `close_to_ma224_atr`
- all below224 history values.

For a continuous above-MA run, only the first crossing candle is 3A.

### 3B — Hold Above MA224
A 3B qualification is attached to a prior 3A when:
- inspect the next 3 completed daily candles after 3A;
- at least 2 of those 3 daily closes are above their own contemporaneous SMA224.

Frozen values:
- lookahead window = 3 daily candles;
- minimum closes above = 2.

3B cannot be known at the 3A timestamp. Therefore:
- the 3A feature snapshot remains unchanged;
- `is_3b` is stored in a separate post-event structural annotation;
- no 3B result may be used as a feature for a prediction timestamp earlier than its confirmation close.

### 3C — Retest and Positive Close
A 3C qualification is attached to a prior 3A when, within 14 completed daily candles after 3A:
1. price revisits the MA224 neighborhood:
   - daily low OR daily close is within ±1.0 ATR(14) of that day's SMA224;
2. on the qualifying retest day:
   - close > that day's SMA224; and
   - close > previous completed daily close.

Frozen values:
- search window = 14 completed daily candles after 3A;
- MA neighborhood = ±1.0 ATR(14);
- recovery confirmation = close above MA224 and above previous close.

Store:
- `is_3c`
- `days_3a_to_3c`
- `retest_distance_atr`
- `retest_low_distance_atr`
- `retest_close_distance_atr`.

As with 3B, 3C is a post-event structural annotation and must never leak backward into the original 3A feature snapshot.

## Existing 1H Candidate Formula
The current historical 1H/scanner candidate logic remains versioned separately.

For each bowl event, calculate whether the existing candidate formula is simultaneously true using only data closed at that evaluation timestamp.

Store:
- `existing_1h_candidate=true|false`
- its numeric feature snapshot;
- scanner/screener version.

Do not silently modify the existing candidate formula while running this experiment.

## Comparison Groups

### Cohort Timing
A/B/C assignment is performed separately for three actionable cohorts:
- 3A cohort timestamp = 3A daily close;
- 3B cohort timestamp = the close of the daily candle that first makes the frozen 2-of-next-3 rule knowable/true;
- 3C cohort timestamp = the qualifying 3C retest/recovery daily close.

Never use a later 3B/3C confirmation to relabel an earlier 3A timestamp.

### Group A — Existing 1H Candidate Only
For each cohort timestamp:
- existing 1H candidate = true;
- the corresponding bowl cohort condition is false at that same timestamp.

### Group B — Bowl Only
For each cohort timestamp:
- the corresponding bowl cohort condition = true;
- existing 1H candidate = false.

3A, actionable 3B, and actionable 3C remain separate result tables. Do not collapse them into a single winner before analysis.

### Group C — Bowl + Existing 1H
For each cohort timestamp:
- the corresponding bowl cohort condition = true;
- existing 1H candidate = true at that same timestamp.

### Group D — Matched Non-Signal Baseline
Mechanical baseline windows from the same symbol and comparable historical regime.

Matching rules for v1:
- same symbol;
- same calendar quarter where enough samples exist, otherwise same calendar year;
- no A/B/C signal at the selected timestamp;
- timestamp follows the same evaluation grid;
- one deterministic baseline event per signal event using a hash-derived ordering, not manual selection;
- candidate baseline timestamps are sorted by SHA-256 of `bowl-baseline-v1|symbol|signalEventId|candidateTs`;
- choose the first valid candidate not already assigned to another signal event for that symbol when possible;
- if unique matching is exhausted, mark the baseline unavailable rather than silently reusing one;
- baseline timestamp must have sufficient warm-up and complete outcome coverage.

Store the matching provenance so baseline selection is reproducible.

## Outcomes

Entry reference:
- event's designated signal close price for that cohort.
- 3A event outcomes start after 3A close.
- 3B outcomes start after the 3B confirmation close when evaluating 3B as an actionable signal.
- 3C outcomes start after the 3C confirmation close when evaluating 3C as an actionable signal.

### Fixed Hit Labels
Store at minimum:

- `Hit_24H_10pct`
- `Hit_72H_10pct`
- `Hit_7D_10pct`
- `Hit_72H_15pct`
- `Hit_72H_20pct`
- `Hit_7D_15pct`
- `Hit_7D_20pct`

Hit threshold is inclusive: future high return >= threshold.

### Continuous Outcomes
For 24H, 72H, and 7D:
- point return;
- MFE;
- MAE;
- RR;
- max/min timestamp.

For every hit label:
- `time_to_hit_ms`
- `time_to_hit_bars`
- `mae_before_hit_pct`
- if never hit within the horizon, time-to-hit remains null.

Signal candle is excluded from future outcome calculations.

## Universe Model

### Universe-L
Eligibility:
- at least 224 fully completed daily candles at the signal timestamp.

Store:
- listing-history candle count;
- first available daily candle timestamp;
- whether preferred 400D warm-up exists;
- whether lower-timeframe warm-up is complete.

### Universe-N
Eligibility:
- fewer than 224 completed daily candles.

Behavior:
- not evaluated by bowl rules;
- retained by the existing scanner;
- reported separately so the bowl layer cannot hide new-coin opportunities.

## Initial Experiment
The first validation experiment uses exactly 10 coins, provided at least 10 eligible non-hypothesis symbols exist; otherwise it uses every eligible symbol and records the shortfall.

Selection is mechanical from Universe-L:
- exclude every symbol present in the manually inspected hypothesis-sample registry;
- build the eligible symbol list without reading future outcomes;
- order symbols by SHA-256 of `bowl224-v1|<symbol>`;
- select the first 10 symbols from that frozen order;
- persist the full ordered candidate list and selected symbols in the run manifest;
- no replacement or reselection based on backtest results.

For those symbols:
1. fetch complete chunked 1D history with warm-up;
2. mechanically extract all 3A events;
3. annotate 3B and 3C without changing their definitions;
4. fetch required 4H/1H/15m/5m closed history at each actionable timestamp;
5. evaluate the existing 1H candidate logic;
6. generate A/B/C/D groups;
7. fetch separate future outcome data through 7D;
8. compute all fixed labels and continuous outcomes;
9. compare groups without retuning thresholds.

No mid-run threshold or condition changes are allowed.

## Statistical Questions
The first experiment should answer, descriptively:

- Does Group B outperform Group D historical base rate?
- Does Group C improve over Group A?
- How do 3A vs actionable 3B vs actionable 3C cohorts differ?
- Does original_bowl_4m correlate with stronger outcomes?
- How do below224_days and below224_ratio_120d distribute across successes/failures?
- What is the MAE cost before each target is hit?
- How long do successful events take to hit 10/15/20%?
- Are results stable across symbols rather than driven by one coin?

Do not call one group “best” automatically in product copy. Report measured differences and uncertainty.

## Versioning
Introduce immutable identifiers:
- `bowlFeatureSchemaVersion = bowl-224-features-v1`
- `bowlRuleVersion = bowl-224-rules-v1`
- `bowlOutcomeSchemaVersion = bowl-224-outcomes-v1`
- `baselineMatchingVersion = bowl-baseline-v1`
- existing scanner/screener version
- universe version

Changing 3A/3B/3C thresholds, ATR definition, 120D ratio threshold, comparison group logic, or outcome labels requires a new version.

## Storage
Keep bowl research logically separate under Research Backtest v2:

- `research-v2/bowl224/runs/`
- `research-v2/bowl224/events/`
- `research-v2/bowl224/annotations/`
- `research-v2/bowl224/outcomes/`
- `research-v2/bowl224/baselines/`
- `research-v2/bowl224/stats/`
- `research-v2/bowl224/checkpoints/`

Existing formal backtest and live signal-performance records remain untouched.

## API / UI
Add bounded read APIs for:
- pipeline coverage/completeness;
- Universe-L vs Universe-N counts;
- 3A/3B/3C event counts;
- A/B/C/D group counts;
- fixed outcome statistics;
- event detail/provenance.

Admin execution remains token-protected.

Add a Korean section/page:
- `224MA 밥그릇 연구`
- data coverage status;
- Universe-L / Universe-N;
- frozen rules;
- 3A / 3B / 3C;
- A/B/C/D comparison;
- 24H / 72H / 7D target hit rates;
- MFE / MAE / time-to-hit;
- survivorship/data-completeness warnings.

## Integrity / TDD Gates
Required tests include:

1. 1D range requiring >1000 bars is fetched through multiple Binance requests.
2. paginated fetch has no duplicate/missing boundary candles on normal contiguous data.
3. repeated/empty pagination stops safely.
4. incomplete historical coverage is explicitly marked.
5. daily SMA224 never uses an unclosed or future candle.
6. below224_days and below224_ratio_120d use only pre-signal daily data.
7. exact frozen original_bowl_4m threshold is 80% of prior 120 days.
8. 3A exact crossing boundary behavior.
9. only the first crossing in a continuous above-MA run is 3A.
10. 3B is exactly >=2 of next 3 closes above contemporaneous SMA224.
11. 3B is not present in the original 3A feature snapshot.
12. 3C search window is exactly 14 days.
13. 3C neighborhood is exactly ±1 ATR(14).
14. 3C requires close > MA224 and close > previous close.
15. 3C does not leak backward into 3A features.
16. Universe-L requires >=224 completed daily candles.
17. Universe-N remains available to the existing scanner.
18. A/B/C/D assignment is deterministic.
19. D baseline selection is mechanical and reproducible.
20. future outcome bars never enter signal/group eligibility.
21. 24H/72H/7D exact +10/+15/+20 boundary hits count as success.
22. time-to-hit is first threshold touch only.
23. MAE-before-hit stops at first hit.
24. signal candle is excluded from outcome path.
25. insufficient 7D future coverage remains unavailable.
26. no outcome result mutates frozen 3A/B/C rules.
27. full existing `npm run verify` remains green.

## Rollout Order
1. chunked historical range fetcher;
2. coverage/warm-up contract;
3. daily 224MA feature engine;
4. frozen 3A detector;
5. separate 3B/3C annotator;
6. Universe-L/N classifier;
7. existing 1H candidate intersection;
8. deterministic A/B/C/D grouping;
9. extended 24H/72H/7D outcome engine;
10. initial 8–12 coin experiment runner;
11. stats/API/UI;
12. full TDD/review;
13. merge and production smoke;
14. only after results exist, discuss whether bowl signals should influence live scanner weighting.

## Success Criteria
The experiment is valid when:
- long historical ranges are fetched completely through chunking rather than one Binance page;
- all required warm-up data is explicitly verified;
- 3A/3B/3C are frozen before outcomes;
- 3B/3C confirmation data never leaks backward;
- every eligible event is mechanically extracted;
- A/B/C/D are deterministic and reproducible;
- Universe-N remains unaffected by bowl filtering;
- future outcome data is separated from all feature/group decisions;
- fixed outcome labels, MFE, MAE, MAE-before-hit, and time-to-hit are reproducible;
- the first 8–12 coin experiment completes without changing conditions mid-run.

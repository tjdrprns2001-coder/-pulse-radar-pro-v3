# Forex Book Blind Replay Protocol v1

## Purpose

This protocol validates the Forex Book / professional-state engine without letting known outcomes tune the rules.

The first replay batch is a **leakage / state-transition smoke test**, not a performance claim.

Do **not** wire the Forex Book score into the main market scanner until the formal replay gate is satisfied.

---

## Core rules

### 1. Success and failure are evaluated in the same batch

Do not run known surge samples first and tune rules before adding failures.

Replay decisions are generated without outcome labels.

Only after the decision record is frozen do future bars create:

- `SURGE`
- `CONTROL`
- `PENDING`

Outcome classes are therefore downstream labels, never feature-selection inputs.

### 2. T0 is a hard information boundary

For every replay cutoff:

- only candles with `closeTime <= replay_cutoff_ts` may be analyzed;
- the currently forming candle is excluded;
- MSS / Sweep / candlestick patterns used by the decision must come from confirmed bars;
- historical derivative / PRE-SURGE / DNA context must include an `asOfTs`;
- `historicalContext.asOfTs > replay_cutoff_ts` is rejected;
- current/live API state must never be substituted for missing historical context.

Future candles may exist in the provider response, but altering them must not change the T0 decision.

### 3. Record the decision before the outcome

Decision record:

- `stage_label`
- `stage_transition`
- `direction`
- selected timeframe
- MTF score / agreement
- local TF directional score / local quality
- Forex Book / technical features
- evidence coverage
- provenance / leakage audit

Outcome record:

- `next_open`
- `Hit_6H_8pct`
- `Hit_24H_12pct`
- 6H / 24H return
- MFE
- MAE
- RR
- outcome class

`next_open` is outcome-side data. It must not exist in the frozen decision input.

### 4. Stage transitions are mechanical

Replay the same symbol on a fixed historical evaluation grid.

A stage transition is recorded only when:

```
previous stage_label != current stage_label
```

The engine may emit:

- 준비중
- 점화대기
- 점화초기
- 진행중
- 과열
- 눌림위험
- 구조훼손

Do not manually relabel transitions after seeing the future result.

### 5. First batch and formal batch have different purposes

#### Smoke batch

Purpose:

- detect lookahead leakage;
- verify selected-TF consistency;
- verify next-open outcome calculation;
- verify stage transitions;
- verify success and controls can coexist in one batch.

No performance conclusion is allowed.

#### Formal batch

Minimum software gate:

- at least 50 evaluated records;
- at least 20 `SURGE` outcomes;
- at least 20 `CONTROL` outcomes.

Passing this gate **does not prove predictive value**. It only allows formal train/validation statistics to be interpreted.

Use the existing frozen-manifest and train/validation rules from `research-backtest-v2`.

---

## Cohort construction

Preferred formal cohort:

1. replay the historical scanner grid across the historical universe;
2. capture all qualifying stage transitions;
3. do not select rows by future return;
4. attach outcomes afterward;
5. compare stage/feature distributions for SURGE vs CONTROL;
6. keep survivorship warnings visible.

Known successful examples such as PEPE / WIF / FLOKI / BONK / FARTCOIN may be retained as **diagnostic anchors**, but they must not be the formal performance cohort.

Matched controls should be created mechanically, not hand-picked after viewing outcomes.

---

## Leakage invariants

The test suite must prove:

1. changing candles after T0 does not change the T0 decision;
2. historical context timestamped after T0 is rejected;
3. next-open is absent from the decision and only appears in the outcome;
4. current open candle is not used for pattern / MSS / Sweep decision logic;
5. replay records preserve the same result when future payload values are mutated.

---

## Output schema

Flat research record:

```
schema_version
event_id
symbol
replay_cutoff_ts
selected_tf
stage_label
stage_transition
is_stage_transition
direction
state_score
data_coverage
mtf_score
mtf_agreement
local_directional_score
local_quality
next_open
next_open_ts
outcome_class
hit_6h_8pct
hit_24h_12pct
h6_return_pct
h6_mfe_pct
h6_mae_pct
h6_rr
h24_return_pct
h24_mfe_pct
h24_mae_pct
h24_rr
future_candle_seen
context_not_after_cutoff
```

---

## Main-scanner gate

The main scanner must remain unchanged until all of the following are true:

- blind replay leakage tests pass;
- formal batch minimum size is reached;
- frozen validation manifest is used;
- validation results are reviewed separately from training;
- any parameter change creates a new manifest/version and restarts validation.

This prevents the Forex Book engine from contaminating the existing PRE-SURGE score before its incremental value is demonstrated.

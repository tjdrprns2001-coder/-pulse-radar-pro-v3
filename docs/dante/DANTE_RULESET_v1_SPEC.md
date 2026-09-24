# DANTE_RULESET_v1 — Deterministic Specification

Status: **SPEC FROZEN CANDIDATE**
Scope: specification only. No production ranking, no scanner-stage mutation, no live trading execution.
Mode: **SHADOW_ONLY**
Ranking contribution: **0**

---

## 1. Purpose

This document converts the discretionary concepts commonly associated with the Dante-style long-term moving-average framework into deterministic, replayable rules suitable for research, backtesting, and future PulseRadar integration.

The v1 implementation must preserve these principles:

- Existing Scanner v3 MA logic remains untouched.
- Dante moving averages live in an independent namespace.
- Dante state never mutates Scanner stage, Book AI setupState, PRE-SURGE, or official ranking.
- All decisions are based on **closed candles only**.
- No lookahead, no future outcome leakage, no inferred future confirmation.
- Rule evidence and lifecycle transitions are auditable and reproducible.
- “Accumulation”, “support”, “retest”, and “confirmation” are operational definitions, not claims about actor intent.

---

## 2. Versioned namespaces

### 2.1 Ruleset
`DANTE_RULESET_v1`

### 2.2 Evidence family
`DANTE_EVIDENCE_v1`

### 2.3 Rice Bowl lifecycle
`DANTE_RICE_BOWL_STATE_v1`

### 2.4 Gongguri parameters
`DANTE_GONGGURI_PARAMS_v1`

### 2.5 EMA Strike
`DANTE_EMA_STRIKE_v1`

### 2.6 Future modules
Reserved:
- `DANTE_256_v1`
- `DANTE_625_v1`
- `DANTE_HIGH_HEEL_v1`

No future module may silently change the semantics of v1.

---

## 3. Indicator namespace

Dante indicators are separate from Scanner v3 indicators.

```text
dante.indicators.ema5
dante.indicators.ema20
dante.indicators.ema60
dante.indicators.ema112
dante.indicators.ema224
dante.indicators.ema448
```

Initial v1 long-term core:
- EMA 112
- EMA 224
- EMA 448

Optional supporting series:
- EMA 5
- EMA 20
- EMA 60
- ATR 14
- Volume median / moving average
- OBV slope
- confirmed canonical swing highs/lows

Bollinger or Ichimoku may later be exposed as supporting evidence, but they are **not required for v1 lifecycle transitions**.

---

## 4. Data policy

Every Dante analysis result stores:

```text
analysisAsOf
generatedAt
dataPolicy.candlePolicy = CLOSED_ONLY
closedThrough[timeframe]
rulesetVersion = DANTE_RULESET_v1
paramsHash
```

Rules:

1. A candle with `partial === true`, `isClosed === false`, or `confirmed === false` cannot participate.
2. Any candle or event timestamp after `analysisAsOf` is rejected.
3. State transitions are evaluated using the information available at that transition bar only.
4. A later candle cannot retroactively convert a prior CANDIDATE into a historical CONFIRMED signal unless the replay explicitly advances to that later bar.
5. Backtests must execute on the same state machine used live.

---

## 5. Core parameter contract

Illustrative defaults are research defaults, not claims of an official proprietary formula.

```js
DANTE_RULESET_v1 = {
  ema: {
    fast: 112,
    pivot: 224,
    long: 448
  },

  dump: {
    lookbackBars: 120,
    minDrawdownPct: 25,
    minAtrExpansion: 1.5,
    requireBearishLongMaHistory: true
  },

  base: {
    minBars: 20,
    preferredDurationRatioMin: 1.5,
    preferredDurationRatioMax: 2.0,
    maxRangeAtr: 8.0,
    maxEma224SlopeAbsAtrPerBar: 0.05
  },

  breakout: {
    level: "EMA224_OR_GONGGURI",
    breakoutBufferAtr: 0.20,
    minRvol: 1.5,
    ignitionRvol: 3.0,
    requireConfirmedClose: true
  },

  retest: {
    toleranceAtr: 0.30,
    reclaimBufferAtr: 0.10,
    minHoldBars: 1,
    maxRetestBars: 20
  },

  expansion: {
    minDistanceAtrAboveTrigger: 1.5,
    requireHigherLow: true
  },

  reset: {
    newStructuralLow: true,
    emaSeparationReexpansion: true
  }
}
```

All numeric values must be stored in the result through `paramsHash` so historical results remain reproducible.

---

## 6. Rice Bowl lifecycle

### 6.1 States

```text
NO_PATTERN
PHASE_1_DUMP
PHASE_2_ACCUMULATION
PHASE_3_BREAKOUT
PHASE_3_RETEST
PHASE_3_CONFIRMED
PHASE_4_EXPANSION
FAILED_BREAKOUT
FAILED_RETEST
RESET
```

### 6.2 General transition rule

A state transition requires:
- current state
- closed-candle evidence
- transition reason
- transition bar/time
- relevant evidence IDs
- parameter hash

No state is inferred only from current price position.

---

## 7. PHASE_1_DUMP

Operational meaning: a material decline with long-MA bearish history / displacement.

### Required evidence
At least:
- significant drawdown from a confirmed prior range high, and
- either bearish long-MA regime history or strong downside displacement.

Preferred evidence:
- EMA112 < EMA224
- EMA224 < EMA448
- falling EMA224 / EMA448
- elevated downside ATR
- downside RVOL expansion

### Non-rule
A single red candle is not PHASE_1_DUMP.

### Transition
```text
NO_PATTERN -> PHASE_1_DUMP
```

---

## 8. PHASE_2_ACCUMULATION

Operational meaning: post-dump stabilization and compression.  
The system must not claim that a specific actor is “accumulating”; the UI may display “횡보/축적 후보”.

### Required evidence
- prior `PHASE_1_DUMP`
- no new structural low for `base.minBars`
- range width below configured ATR-normalized threshold
- EMA224 slope flattening relative to dump phase

Supporting evidence:
- duration ratio `baseDuration / dumpDuration`
- declining realized volatility
- contracting RVOL
- improving OBV slope
- repeated defense of the lower half of the base
- narrowing EMA112/EMA224 spread

### Duration evidence

```text
ratio < 1.0      = WEAK
1.0 – <1.5      = DEVELOPING
1.5 – 2.0       = PREFERRED
>2.0            = EXTENDED
```

Duration is evidence, not a hard requirement for every market.

### Transition
```text
PHASE_1_DUMP -> PHASE_2_ACCUMULATION
```

---

## 9. PHASE_3_BREAKOUT

Operational meaning: confirmed close above the relevant long-term trigger.

### Trigger priority
1. qualified Gongguri level, if present
2. EMA224
3. confluence of both

### Required evidence
- prior PHASE_2_ACCUMULATION
- confirmed candle close above trigger + `breakoutBufferAtr`
- no partial candle
- breakout RVOL >= configured minimum

Supporting:
- BOS / structure break
- EMA112 slope improving
- OBV expansion
- market-relative strength
- crypto adapter: OI/taker confirmation

### Transition
```text
PHASE_2_ACCUMULATION -> PHASE_3_BREAKOUT
```

---

## 10. FAILED_BREAKOUT

A breakout attempt occurred, but confirmation/hold failed before a valid retest sequence.

Examples:
- wick above EMA224 but confirmed close below threshold
- confirmed close above trigger followed by immediate decisive close back below invalidation boundary
- breakout lacks the required closed-candle confirmation

### Transition
```text
PHASE_3_BREAKOUT -> FAILED_BREAKOUT
```

A FAILED_BREAKOUT is not automatically RESET.

A later fresh breakout may re-enter PHASE_3_BREAKOUT if the underlying base remains structurally valid.

---

## 11. PHASE_3_RETEST

Operational meaning: after a valid breakout, price revisits the trigger/support zone within the permitted window.

### Required
- prior valid PHASE_3_BREAKOUT
- retest occurs within `maxRetestBars`
- price touches configured retest zone
- no hard structural invalidation before touch

Possible retest references:
- EMA224
- EMA112, when explicitly configured
- Gongguri level
- overlap/confluence zone

### Transition
```text
PHASE_3_BREAKOUT -> PHASE_3_RETEST
```

---

## 12. PHASE_3_CONFIRMED

This is the primary Dante “3번 자리” confirmed state.

### Required
- valid PHASE_3_RETEST
- confirmed reclaim/hold above the chosen support reference
- minimum hold requirement satisfied
- no invalidation close before confirmation

### Supporting evidence
- higher low
- bullish MSS / CHoCH
- RVOL re-expansion
- OBV recovery
- OI build / taker improvement in crypto adapter

### Important
Merely trading within ±N% of EMA224 does **not** qualify.

That condition may create:
```text
DANTE_3_CANDIDATE
```
but not `PHASE_3_CONFIRMED`.

### Transition
```text
PHASE_3_RETEST -> PHASE_3_CONFIRMED
```

---

## 13. FAILED_RETEST

A valid breakout existed, but the retest failed.

Examples:
- close below the configured support/invalidation threshold
- structural low violated
- retest window expires without reclaim
- Gongguri support flips back to resistance and holds below

### Transition
```text
PHASE_3_RETEST -> FAILED_RETEST
PHASE_3_CONFIRMED -> FAILED_RETEST
```

FAILED_RETEST preserves its lifecycle history.

---

## 14. PHASE_4_EXPANSION

Operational meaning: confirmed stage-3 support leads to trend expansion.

### Required
- prior PHASE_3_CONFIRMED
- price achieves configured ATR-normalized expansion
- structural higher low remains intact

Supporting:
- EMA112 > EMA224 transition
- EMA224 slope positive
- RVOL continuation
- broad market / BTC regime supportive

### Transition
```text
PHASE_3_CONFIRMED -> PHASE_4_EXPANSION
```

PHASE_4 is descriptive lifecycle state, not a buy instruction.

---

## 15. RESET

RESET means the current Rice Bowl sequence is no longer semantically continuous.

Examples:
- new structural low materially below the phase-1/phase-2 sequence
- base destroyed and long-MA bearish separation re-expands
- a new dump leg creates a distinct lifecycle
- data continuity is insufficient to connect the old and new structure safely

### Distinction

```text
FAILED_BREAKOUT = attempt failed, sequence may survive
FAILED_RETEST   = support confirmation failed, sequence history preserved
RESET           = prior sequence no longer valid as same pattern
```

A RESET creates a new `sequenceId` when a new Rice Bowl lifecycle begins.

---

## 16. Allowed transition matrix

```text
NO_PATTERN
  -> PHASE_1_DUMP

PHASE_1_DUMP
  -> PHASE_2_ACCUMULATION
  -> RESET

PHASE_2_ACCUMULATION
  -> PHASE_3_BREAKOUT
  -> RESET

PHASE_3_BREAKOUT
  -> PHASE_3_RETEST
  -> FAILED_BREAKOUT
  -> RESET

FAILED_BREAKOUT
  -> PHASE_3_BREAKOUT
  -> RESET

PHASE_3_RETEST
  -> PHASE_3_CONFIRMED
  -> FAILED_RETEST
  -> RESET

PHASE_3_CONFIRMED
  -> PHASE_4_EXPANSION
  -> FAILED_RETEST
  -> RESET

FAILED_RETEST
  -> PHASE_2_ACCUMULATION  // only if original base remains valid
  -> RESET

PHASE_4_EXPANSION
  -> RESET                 // only when a genuinely new lifecycle begins
```

Direct impossible transitions include:
- NO_PATTERN -> PHASE_3_CONFIRMED
- PHASE_1_DUMP -> PHASE_4_EXPANSION
- PHASE_2_ACCUMULATION -> PHASE_3_CONFIRMED
- FAILED_BREAKOUT -> PHASE_4_EXPANSION

---

## 17. Gongguri specification

Gongguri must not blindly inherit Trendline Retest parameters.

It may reuse generic evidence primitives, but the Dante classifier gets its own parameter namespace.

```js
DANTE_GONGGURI_PARAMS_v1 = {
  boxLookback: 20,
  minPriorTouches: 2,
  maxBoxAtrWidth: 6.0,
  breakoutBufferAtr: 0.20,
  retestToleranceAtr: 0.25,
  reclaimBufferAtr: 0.10,
  minHoldBars: 2,
  maxRetestBars: 15
}
```

### Reusable primitives
May reuse:
- confirmed canonical swing high
- horizontal level
- breakout event
- retest touch
- reclaim
- hold-after-reclaim
- BOS/MSS

### Must not reuse blindly
Do not inherit without explicit Dante params:
- trendline-specific slope tolerances
- trendline-specific breakBuffer
- trendline-specific dead-zone assumptions
- trendline line-projection semantics

### Gongguri confirmed chain

```text
QUALIFIED_HORIZONTAL_LEVEL
-> CONFIRMED_BREAKOUT
-> RETEST_TOUCH
-> RECLAIM
-> HOLD
-> DANTE_GONGGURI_CONFIRMED
```

A breakout without retest/hold is only `DANTE_GONGGURI_CANDIDATE`.

---

## 18. EMA Strike specification

Purpose: identify recovery path from deep long-MA dislocation.

States:

```text
NO_STRIKE
EMA112_APPROACH
EMA112_BREAK
EMA112_HOLD
EMA224_TARGET
EMA224_BREAK
EMA448_TARGET
FAILED
```

Minimum v1 logic:
- meaningful prior downside displacement / long-MA bearish regime
- confirmed EMA112 break
- EMA112 hold/reclaim
- next long MA becomes reference target

No fixed “10–20% profit” assumption is embedded in the signal engine.
Profit-taking belongs to a separate execution/backtest layer.

---

## 19. DANTE_256 / 625 / High Heel scope

These remain specified for later implementation.

### 256
Must define:
- exact 5/20/60 ordering
- required prior ordering
- transition/cross timing
- long-MA context
- no ambiguous same-bar lookahead

### 625
Must define:
- prior-day return
- gap definition
- candle reversal definition
- volume denominator
- session-market applicability

625 is market/session-specific and must not be applied unchanged to 24/7 crypto.

### High Heel
Must define:
- dump magnitude
- V-reversal window
- reclaim reference
- volume/displacement requirement
- failure boundary

---

## 20. Market adapters

### 20.1 Crypto adapter

Dante core can receive supporting evidence from:

- BTC / ETH market regime
- OI path
- taker ratio
- funding
- spot/futures volume
- cross-exchange confirmation
- unlock/listing event context

These are supporting evidence. They do not rewrite Rice Bowl lifecycle history.

### 20.2 Korea equity adapter

May later receive:

- KOSPI / KOSDAQ regime
- liquidity / trading value
- market cap
- corporate status filters
- fundamentals
- disclosure/event risks

Fundamental thresholds such as debt ratio 150%, reserve ratio 500%, or market cap 50B KRW are **research parameters**, not hardcoded “official Dante rules”.

---

## 21. Evidence output

Initial result shape:

```js
danteEvidence = {
  version: "DANTE_EVIDENCE_v1",
  mode: "SHADOW_ONLY",
  rulesetVersion: "DANTE_RULESET_v1",
  sequenceId,
  riceBowlState,
  stateReason,
  stateEnteredAt,
  paramsHash,

  evidenceFacts: [],
  counterEvidence: [],
  transitionPath: [],

  gongguri: {
    status,
    level,
    evidenceFactIds: []
  },

  emaStrike: {
    status,
    evidenceFactIds: []
  },

  rankingContribution: 0,
  scannerStageContribution: 0,
  bookEvidenceContribution: 0
}
```

No v1 Dante field may modify:
- Scanner v3 stage
- Scanner rank
- Book AI setupState
- BOOK_EVIDENCE_v1
- PRE-SURGE state

---

## 22. Confidence semantics

Do not use “win probability”.

Allowed terms:
- evidence completeness
- state confidence / condition fulfillment
- data coverage
- pattern completeness

Any displayed score must clearly state that it is **not expected return or win probability**.

---

## 23. State persistence

Each transition stores:

```text
from
to
transitionAt
transitionBarIndex
reason
evidenceFactIds
counterEvidenceFactIds
paramsHash
sequenceId
analysisAsOf
```

Transition history is append-only for replay.

A later state must not erase a prior FAILED_BREAKOUT or FAILED_RETEST transition.

---

## 24. Initial fixture plan

### Data integrity
1. partial candle cannot trigger any transition.
2. future candle after analysisAsOf => FAIL.
3. same closed input => same lifecycle result.
4. candle order mutation that preserves chronology must not alter result.
5. paramsHash change marks lifecycle configuration mismatch.

### Rice Bowl
6. dump alone cannot skip to phase 3.
7. EMA224 proximity alone => candidate only.
8. breakout wick without confirmed close => FAILED_BREAKOUT or no breakout.
9. confirmed breakout + no retest => PHASE_3_BREAKOUT only.
10. valid retest without reclaim => PHASE_3_RETEST only.
11. valid retest + reclaim + hold => PHASE_3_CONFIRMED.
12. failed retest cannot become PHASE_4.
13. new structural low can RESET sequence.
14. FAILED_BREAKOUT may retry within same sequence if base remains valid.
15. RESET must create new sequence on subsequent pattern.

### Gongguri
16. one historical touch is insufficient when minPriorTouches=2.
17. breakout without volume/close confirmation remains candidate.
18. valid horizontal breakout + retest + reclaim + hold => confirmed.
19. trendline-only touch cannot masquerade as horizontal Gongguri confirmation.
20. changing generic trendline params must not silently change Dante Gongguri params.

### No score/rank injection
21. Dante SHADOW_ONLY result cannot modify Scanner rank.
22. Dante result cannot mutate Scanner stage.
23. Dante result cannot mutate Book AI setupState.
24. Dante result cannot alter BOOK_EVIDENCE_v1 score.

### Replay
25. lifecycle transition path reproduces identically at the same analysisAsOf.
26. later candles may advance state but cannot rewrite earlier transition timestamps.
27. failure transitions remain visible after recovery.

---

## 25. Backtest requirements before activation

Before any ranking contribution is considered:

- sufficient sample count across multiple market regimes
- discovery/validation split
- no same-period parameter optimization and evaluation
- transaction costs/slippage where relevant
- delisted/failed assets retained where data allows
- regime-stratified results
- MFE / MAE
- failure rates by state
- breakout -> retest latency
- phase duration distributions
- parameter sensitivity

Activation must require a separately versioned readiness gate.  
`DANTE_RULESET_v1` itself never self-activates ranking contribution.

---

## 26. Implementation sequence after spec approval

1. `dante-contract.js`
2. Rice Bowl lifecycle engine
3. lifecycle fixtures
4. Gongguri classifier + Dante-specific params
5. EMA Strike
6. 256 / 625 / High Heel
7. research/backtest harness
8. Dante readiness gate
9. UI / snapshots
10. only after validation: discussion of advisory ranking integration

---

## 27. Frozen v1 principles

The following are frozen unless a new version is created:

- independent Dante MA namespace
- CLOSED_ONLY
- no-lookahead
- deterministic state machine
- SHADOW_ONLY
- rankingContribution = 0
- Scanner stage unchanged
- Book AI setupState unchanged
- Gongguri has its own params
- EMA224 proximity alone is not phase-3 confirmation
- FAILED and RESET are distinct lifecycle concepts
- transition history is preserved

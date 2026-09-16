# PulseRadar Milestone 3.3 — Annotation, Liquidity, ICT Context, and Multi-Chart Design

## Status

Approved in-chat design. This document freezes the Milestone 3.3 architecture before implementation planning.

## Goal

Extend PulseRadar's current Structure / SMC / Multi-Chart system with a reusable annotation layout engine, a dedicated Liquidity Engine, an ICT Context Engine, and a curated multi-chart / Full-mode integration without regressing the Milestone 3.1/3.2 declutter guarantees.

Milestone 3.3 is explicitly ordered as:

1. **3.3A — Universal Annotation / Collision Engine**
2. **3.3B — Liquidity Engine**
3. **3.3C — ICT Context Engine**
4. **3.3D — Multi-Chart Integration / Full Summary / Visual Regression**

The order is mandatory. Liquidity and ICT visual expansion must not be implemented ahead of 3.3A.

---

# 3.3A — Universal Annotation / Collision Engine

## Purpose

Replace per-plugin ad hoc label collision behavior with one shared annotation candidate and layout pipeline.

The existing `collision-policy.js` remains useful experience and compatibility logic, but Milestone 3.3A introduces a more general layer capable of handling Structure, SMC, Liquidity, and ICT annotations consistently.

## Candidate model

Every label-like annotation is normalized before rendering.

```text
{
  id,
  type,
  category,
  priority,
  barIndex,
  price,
  side,
  collisionGroup,
  allowOffset,
  maxOffset,
  viewportLevel,
  tf,
  sourceId,
  width,
  height,
  metadata
}
```

### Required semantics

- `id`: deterministic unique render candidate id.
- `type`: CHOCH / BOS / MSS / SWEEP / GRAB / PDH / PDL / EQH / EQL / FVG / IND / sequence marker, etc.
- `category`: structure / smc / liquidity / ict.
- `priority`: mode-aware ordering input.
- `barIndex`, `price`: anchor location.
- `side`: above / below / left / right / band.
- `collisionGroup`: labels compete only against relevant groups unless explicitly cross-group.
- `allowOffset`: whether auto-offset is permitted.
- `maxOffset`: hard displacement limit.
- `viewportLevel`: normal / focused / compact / 4-chart.
- `tf`: source timeframe.
- `sourceId`: original engine object id for validation and Narrative linkage.

## Layout pipeline

The exact order is fixed:

1. sort by effective priority
2. map anchors into screen coordinates
3. calculate bounding boxes
4. check collision against already accepted boxes
5. if collision and `allowOffset`, try deterministic offset slots
6. recalculate bounding box
7. if still colliding, hide candidate
8. apply viewport / mode cap
9. emit visible / hidden decisions and final offsets

The engine must not rely only on bar-distance heuristics. Final decisions must use actual screen-space bounding boxes.

## Mode-aware priority

### ICT mode

1. ICT sequence markers
2. Grab / Sweep
3. MSS
4. HTF target
5. OTE
6. FVG / OB context
7. EQH / EQL
8. ordinary Structure labels

### SMC mode

1. MSS / CHoCH
2. active OB / FVG
3. Grab / Sweep
4. BOS
5. EQH / EQL
6. swing labels

### Liquidity mode

1. Grab
2. fresh Sweep
3. PDH / PDL
4. HTF liquidity target
5. active EQH / EQL
6. session high / low
7. PWH / PWL
8. Liquidity Void
9. IND?
10. old swing liquidity

Priorities are presentation priorities only. They do not alter analytical definitions.

## Mobile / compact caps

Baseline mobile budget:

- Structure event labels: 4
- Sweep / Grab: 3
- EQH / EQL: 2
- PDH / PDL: 2
- PWH / PWL: 2
- SMC zones: 3
- ICT sequence: 1 sequence
- IND?: 1
- Liquidity Void: 1–2
- Session / Killzone labels: current / recent session only

Four-chart compact mode must use stricter budgets than normal mobile or desktop. Focused / expanded cards may use slightly higher budgets.

Global Foundation preset budgets remain unchanged. Multi-chart and viewport reductions remain a separate render-policy layer.

## Output

The layout engine returns a deterministic decision set including:

```text
visibleIds
hiddenIds
offsets
boundingBoxes
priorityDecisions
viewportBudget
```

This output is used for tests and visual diagnostics.

---

# 3.3B — Liquidity Engine

## Responsibility

Create a dedicated `liquidity-engine.js` layer that enriches existing Structure / SMC outputs with liquidity semantics, session levels, lifecycle, and quality metadata.

The Liquidity Engine must reuse existing SMC outputs instead of recomputing shared definitions.

### Reused data

- confirmed pivots
- EQH / EQL
- existing SMC Sweep events
- displacement
- MSS
- FVG / OB references where needed for context

### Newly calculated data

- PDH / PDL
- PWH / PWL
- session high / low
- Buy-side / Sell-side level classification
- Sweep enrichment
- Grab classification
- Liquidity Void
- conservative Inducement candidates

## Liquidity level model

```text
LiquidityLevel {
  id
  type
  side
  price
  startIndex
  confirmedAt
  sourceTf
  sourceId
  state
  quality
  touches
  definitionVersion
}
```

Supported states:

```text
active
probed
swept
consumed
expired
```

## Buy-side / Sell-side liquidity

Candidate sources:

### Buy-side

- confirmed swing high
- EQH
- PDH
- PWH
- session high

### Sell-side

- confirmed swing low
- EQL
- PDL
- PWL
- session low

Not every candidate is rendered. The engine emits quality / freshness metadata and 3.3A decides what is visible.

## PDH / PDL

Use the previous completed New York calendar day only.

The current incomplete day must never be used as PDH / PDL.

## PWH / PWL

Use the previous completed New York calendar week only.

## Sweep

Existing SMC Sweep remains the base analytical event. Liquidity Engine enriches it.

```text
baseType: SWEEP
variant: NORMAL
levelId
penetrationAtr
reclaimBars
reclaimDistanceAtr
displacementConfirmed
quality
definitionVersion
```

A valid Sweep requires:

- penetration of a confirmed liquidity level
- close back inside the level
- minimum ATR-based penetration threshold

## Grab

Grab is not a separate unrelated concept. It is a high-quality Sweep subset.

```text
baseType: SWEEP
variant: GRAB
```

A Sweep may be upgraded to Grab when deterministic v1 conditions indicate stronger rejection, such as:

- stronger penetration quality
- fast reclaim
- confirmed displacement within a limited window
- supporting MSS / structure confirmation
- strong body / ATR rejection behavior

Required invariants:

- every Grab is also a Sweep
- no Grab can exist without a source Sweep

The exact thresholds are frozen as deterministic v1 parameters and must not initially be optimized to trading returns.

## EQH / EQL

Reuse existing SMC EQ output by `sourceId`.

Liquidity Engine adds lifecycle, touch count, current-price distance, TF, and presentation quality only.

## Liquidity Void

Liquidity Void is distinct from FVG.

A Void is a wider directional inefficient move characterized by:

- strong displacement
- rapid travel across multiple candles
- low overlap / internal trade density

```text
VOID {
  id
  low
  high
  dir
  startIndex
  endIndex
  displacementAtr
  overlapRatio
  state
  sourceTf
  definitionVersion
}
```

FVG and Void may overlap but must not be merged into one object.

Suggested visual caps:

- Liquidity mode: 2–3 recent high-priority Voids
- Full mode: 1–2

## Inducement

Inducement is initially candidate-only.

It must be rendered as:

```text
IND?
```

and carry:

```text
confidence: candidate
```

It is never a confirmed trading signal in Milestone 3.3.

Initial candidate pattern may require:

- a major liquidity target
- a smaller opposing confirmed swing / EQ level before the major target
- the smaller level being swept first
- continuation toward the larger target

Inducement must remain conservative until validation data justifies stronger classification.

## Session and Killzone time handling

All raw candle timestamps are treated as UTC and converted through IANA timezone semantics:

```text
America/New_York
```

No manually maintained EST / EDT transition table is permitted.

Time-window definitions are stored in versioned profiles rather than scattered hard-coded values.

```text
SESSION_PROFILE_v1
KILLZONE_PROFILE_v1
```

Initial profiles may represent:

- Asia
- London
- New York
- London Close

Each completed session stores:

```text
sessionHigh
sessionLow
range
sweptHigh
sweptLow
profileVersion
```

Killzones are context labels only. They must not be treated as automatic entry signals.

## Definition versions

Initial version ids:

```text
LIQUIDITY_v1
SWEEP_v2
GRAB_v1
VOID_v1
INDUCEMENT_CANDIDATE_v1
SESSION_PROFILE_v1
KILLZONE_PROFILE_v1
```

---

# 3.3C — ICT Context Engine

## Responsibility

Create `ict-context-engine.js` as a composition / context layer.

It must not redefine or independently re-detect SMC or Liquidity events already owned by other engines.

Its main responsibilities are:

- Dealing Range
- Premium / Equilibrium / Discount
- OTE context
- HTF liquidity targets
- session / killzone context
- PD Array composition
- HTF → LTF sequence state
- Narrative generation

## Dealing Range

Use confirmed meaningful swing endpoints / structural legs.

Output:

```text
low
high
equilibrium
premiumRange
discountRange
oteLow
oteHigh
sourceIds
sourceTf
definitionVersion
```

Initial context definitions:

- Equilibrium = 50%
- OTE context = 61.8%–79% retracement band

These are context ranges, not automatic trade instructions.

## HTF context

The HTF context may include:

- bias
- major Buy-side / Sell-side liquidity target
- dealing range
- Premium / Discount position
- active PD Array references
- recent HTF Sweep / Grab
- current session / Killzone context

## LTF confirmation context

LTF context may reference:

- Sweep / Grab
- MSS / CHoCH
- displacement
- FVG / OB
- mitigation

## ICT sequence model

```text
ICTSequence {
  id
  direction
  htfContextId
  events: [
    sweep?,
    mss?,
    displacement?,
    pdArray?,
    mitigation?
  ]
  state
  quality
  sourceIds[]
  sourceTfs[]
  definitionVersion
}
```

Allowed states:

```text
forming
confirmed
invalidated
completed
```

### Sequence rules

- sequence cannot start at MSS without a valid Sweep / Grab source when using the standard liquidity-sequence path
- missing steps remain missing
- the engine must never fabricate a FVG, OB, MSS, Sweep, or mitigation event
- incomplete sequences remain `forming`
- a sequence becomes `confirmed` only when the deterministic v1 minimum evidence is present

## PD Array Context

The ICT engine references source objects instead of recalculating them.

Possible source types include:

- OB
- FVG / iFVG
- Breaker
- Mitigation block if available from source engine
- Liquidity Void
- OTE

```text
PDArrayContext {
  type
  sourceId
  tf
  side
  state
  distanceAtr
  freshness
  quality
}
```

Suggested ordering favors active HTF context over old / low-priority LTF context.

## Narrative

Narrative text must describe only source-linked observed state.

Example confirmed narrative:

```text
4H discount 영역에서 sell-side liquidity sweep 확인 → 1H bullish MSS → displacement → bullish FVG 형성.
```

Example forming narrative:

```text
4H sell-side sweep은 확인됐지만 1H MSS가 아직 없어 ICT sequence는 forming 상태.
```

Narrative must never speak ahead of the underlying state.

## Invalidation

A sequence may become invalidated based on deterministic v1 rules such as:

- opposite strong structure break
- invalidated dealing range context
- violation of the key referenced PD Array
- deterministic age / TTL expiry

Thresholds are fixed definitions first and only later evaluated through validation. They are not initially tuned against profit outcomes.

## Version ids

```text
ICT_CONTEXT_v1
ICT_SEQUENCE_v1
PD_ARRAY_CONTEXT_v1
KILLZONE_PROFILE_v1
ICT_NARRATIVE_v1
```

---

# 3.3D — Multi-Chart Integration, Full Summary, and Visual Regression

## Default multi-chart layout

Default two-chart composition:

- left: 1H Liquidity / SMC
- right: 4H ICT Context

Suggested four-chart context layout:

- 15m Liquidity
- 1H SMC
- 4H ICT
- 1D Structure

Symbol sync remains ON by default.

Timeframe and mode sync remain OFF by default.

Crosshair and visible-range synchronization remain optional future / polish controls unless implementation cost is minimal and independently testable.

## Full mode

Full is a curated summary, not a union of all available layers.

Suggested starting budgets:

- Structure labels: 3–4
- Liquidity events: 2–3
- SMC zones: 2–3
- ICT sequence: 1
- PDH / PDL: max 2
- PWH / PWL: max 2
- Liquidity Void: max 1–2
- IND?: max 1

3.3A may reduce the final count further if collision or viewport budgets require it.

## Mobile behavior

Two-chart mobile layout remains vertically stacked.

- chart card default height approximately 360–420 px
- cards support focus / expand
- focused card may use a larger annotation budget
- non-focused cards use stricter compact budgets
- ICT Narrative appears below the chart, preferably collapsible
- Killzone / session context uses restrained background shading
- long in-chart prose labels are prohibited

Four-chart mobile mode uses stacked cards and focused expansion rather than four tiny simultaneous charts.

## Failure isolation

Failures remain local.

Examples:

- 1H API failure affects only 1H card
- ICT Context failure degrades only ICT context / narrative
- Liquidity Engine failure does not remove working Structure / SMC data
- session profile failure disables session / Killzone context only

No full-workspace white screen is acceptable.

---

# Validation Strategy

Milestone 3.3 explicitly requires both functional and visual validation.

## 1. Geometry gate

For every pair of visible collision-relevant annotations:

```text
intersection(A.bounds, B.bounds) == false
```

Intentional zone / band overlaps use explicit exemption groups.

This is a required automated gate.

## 2. Deterministic layout snapshots

Representative fixtures store:

```text
visibleIds
hiddenIds
offsets
boundingBoxes
priorityDecisions
viewportBudget
```

Recommended fixtures include:

- UNIUSDT 1H dense Structure / SMC
- HYPEUSDT 1D dense label scenario
- mobile width 390 px
- desktop viewport
- two-chart layout
- four-chart compact layout

Snapshot output must be deterministic across repeated runs with the same fixture and viewport rules.

## 3. Screenshot regression

Use a fixed browser / viewport setup, preferably Playwright, for representative chart screenshots.

Screenshot regression is a visual review / warning gate, while geometry remains the machine-enforced overlap gate.

Do not treat pixel screenshots alone as proof of correctness.

## 4. Engine contracts

Liquidity tests must cover:

- deterministic outputs
- no future-candle lookahead
- previous completed day / week semantics
- Grab is always a Sweep subset
- no Grab without Sweep
- EQH / EQL sourceId linkage
- DST-safe session boundaries
- IND? never promoted to confirmed signal
- Void distinct from FVG

ICT tests must cover:

- all Narrative events have sourceIds
- no fabricated sequence steps
- no confirmed status for incomplete sequence
- deterministic state transitions
- source TF preserved
- deterministic Narrative for identical inputs
- session / DST stability
- invalidation state transitions

## 5. Existing regression suite

All existing Milestone 1 / 2 / 3 / 3.1 / 3.2 tests and `npm run verify` must remain green.

Milestone 3.3 must not change the global Foundation preset budgets:

- Clean: 3
- Structure: 5
- SMC: 8
- Dante: 5
- Full: 15

Viewport / multi-chart caps remain separate policies.

---

# Release Gate

Milestone 3.3 is complete only when all of the following are true:

- existing Structure / SMC analytical definitions remain compatible
- Annotation Engine outputs deterministic visible / hidden decisions
- representative geometry fixtures have zero prohibited bounding-box collisions
- Liquidity Engine is deterministic
- Grab ⊂ Sweep invariant passes
- IND? remains candidate-only
- session / DST tests pass using `America/New_York`
- ICT sequence state is source-linked and deterministic
- Narrative never exceeds source evidence
- Full stays inside budget
- mobile 390 px has no horizontal control / chart overflow
- two-chart and four-chart state persistence works
- full CI passes
- Vercel Preview succeeds
- representative mobile visual review succeeds
- only then is the feature branch eligible for `main`
- Production deployment is verified before final completion is reported

---

# Non-goals

Milestone 3.3 does not include:

- automatic order execution
- exchange permissions
- automatic entry / exit recommendations
- profitability-tuned Grab / IND thresholds
- replacing the existing SMC engine with a new combined engine
- converting all analysis into one monolithic Confluence Engine
- four tiny simultaneous charts on mobile
- claiming Killzone context as predictive by itself

---

# Implementation boundary

The implementation plan should preserve small, testable modules and avoid one large controller.

Expected module boundaries include, subject to exact repo inspection during planning:

- annotation candidate normalization / layout
- annotation geometry / collision
- liquidity engine
- versioned session profiles
- ICT context / sequence
- ICT narrative
- renderer adapters for Structure / SMC / Liquidity / ICT
- multi-chart integration hooks
- deterministic fixture and visual regression tests

Existing analytical engines remain authoritative for their current definitions.

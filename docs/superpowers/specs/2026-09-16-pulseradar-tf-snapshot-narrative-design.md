# PulseRadar TF Snapshot + Narrative Design

Date: 2026-09-16
Status: Approved design pending implementation plan
Target branch: feat/milestone-3-3-liquidity-ict

## Goal

Upgrade the existing `snapshot-analysis.html` flow so the user can select `15m`, `1h`, `4h`, or `1d` and receive a fully synchronized result for that timeframe:

- snapshot chart
- structure/SMC/liquidity overlays
- directional context
- interest zone
- invalidation level
- structural targets
- Korean narrative summary
- derivatives flow summary when available

The selected timeframe is always the primary analytical frame. Higher timeframes are supporting context only and may not overwrite the selected timeframe result.

## Existing foundation

The current repository already has `snapshot-analysis.html` with timeframe controls, chart rendering, structure/SMC-style analysis, momentum indicators, and a summary sidebar. This feature upgrades that existing route rather than creating a separate competing page.

Existing Structure, SMC, Liquidity, ICT Context, and Annotation/Collision components remain the authoritative analytical sources. Snapshot Narrative must reuse their results rather than duplicate their definitions.

## Architecture

The current monolithic snapshot page will be split into focused units while preserving the existing user-facing route.

### `snapshot-analysis.html`

Owns only the page shell, controls, chart containers, snapshot result cards, and loading/error states.

### `ui/snapshot/snapshot-analysis.js`

Owns page state and orchestration:

- symbol state
- selected timeframe state
- data loading
- calling analysis modules
- rendering results
- keeping chart, narrative, flow, and context synchronized to the same selected timeframe

### `lib/analysis/tf-analysis-engine.js`

Consumes authoritative Structure/SMC/Liquidity/ICT outputs and produces the selected-TF scenario model:

- `bias`: bullish / bearish / neutral
- `confidence`: low / medium / high
- interest zone
- invalidation
- up to three structural targets
- confirmations
- warnings
- HTF conflict metadata

It must not create synthetic structure events or levels.

### `lib/analysis/snapshot-builder.js`

Builds the display model for the snapshot chart from existing analytical objects.

It delegates final annotation density and collision handling to the Milestone 3.3 Annotation Engine.

### `lib/analysis/flow-summary-engine.js`

Normalizes derivatives/flow data when a source is available:

- open interest
- 24h OI change
- funding rate
- taker buy/sell ratio
- volume impulse
- optional CVD bias

Flow is optional. Flow failure must not fail the snapshot or narrative.

### `lib/analysis/narrative-renderer.js`

Creates Korean narrative text only from verified source objects and scenario fields. Every concrete analytical statement must be traceable to existing source IDs or directly derived selected-TF price structure.

It may describe HTF context, but HTF context is explicitly secondary.

## Timeframe synchronization

The following invariant is mandatory:

`selected TF -> candle data -> structure/SMC/liquidity/ICT inputs -> snapshot -> scenario levels -> narrative`

Examples:

- 15m selected => all primary outputs are 15m
- 1h selected => all primary outputs are 1h
- 4h selected => all primary outputs are 4h
- 1d selected => all primary outputs are 1d

Higher-timeframe context may be attached separately, for example a 15m bearish structure conflicting with a bullish 4h/1d context. It must not silently replace the 15m bias.

## Scenario model

```js
{
  symbol,
  tf,
  status,
  bias,
  confidence,
  interestZone,
  invalidation,
  targets,
  confirmations,
  warnings,
  htfConflict,
  sourceIds,
  flow,
  narrative
}
```

No field that represents a price level may be invented merely to complete the card.

## Bias rules

Bias is derived from selected-TF evidence such as:

- recent MSS / CHoCH direction
- recent BOS direction
- relevant liquidity Sweep/Grab
- active SMC zones
- Premium/Discount location
- active support/resistance structure

Conflicting evidence results in `neutral` or reduced confidence rather than a forced directional view.

## Interest zone rules

An interest zone is optional.

Candidate priority:

1. active Order Block
2. active FVG
3. OB/FVG overlap
4. Premium/Discount structural zone
5. confirmed support/resistance retest

A zone is rejected if it is invalidated, excessively broad, structurally unsupported, or too detached from the current scenario.

The UI label is `관심구간`, not an order instruction.

## Invalidation rules

Invalidation should be structurally meaningful and selected-TF specific.

Candidate priority:

- recent confirmed swing high/low
- MSS reference level
- active OB boundary
- Sweep/Grab source extreme

Default validation is by selected-timeframe close, not a wick touch.

Examples:

- 4h scenario => invalidation checked on 4h close
- 15m scenario => invalidation checked on 15m close

If no valid source exists, invalidation is `unconfirmed` rather than fabricated.

## Target rules

Targets must be existing structural/liquidity levels.

Candidate priority:

1. nearest opposite-side liquidity
2. EQH/EQL
3. recent confirmed swing
4. PDH/PDL
5. PWH/PWL
6. relevant HTF liquidity target

A maximum of three targets are shown. Near-duplicate levels are merged.

Targets are descriptive scenario levels, not guaranteed outcomes.

## Risk/reward metadata

A simple distance ratio may be calculated only when interest zone, invalidation, and at least one target are all valid.

It is informational metadata only and must not label a scenario as good/bad or recommend taking a trade.

## Snapshot rendering

The snapshot chart uses the selected timeframe and shows only a curated subset of overlays.

Default visible budget:

- Structure labels: up to 3
- Sweep/Grab: up to 2
- EQH/EQL: up to 2
- FVG/OB: up to 2
- interest zone: 1
- invalidation: 1
- targets: up to 3

The Annotation/Collision Engine owns final visibility, de-duplication, and mobile reduction.

### Timeframe emphasis

- 15m: recent structure, MSS, sweep, local liquidity
- 1h: balanced structure + SMC + liquidity
- 4h: broader SMC context, scenario levels, HTF context
- 1d: sparse labels, macro structure, major liquidity only

## Narrative rules

Narrative is generated from verified scenario fields and source objects only.

Typical order:

1. current selected-TF structure
2. condition that preserves or changes the scenario
3. interest zone if available
4. targets if available
5. invalidation if available
6. HTF conflict/alignment note
7. BTC/market context if a verified context source exists
8. Flow summary

If data is missing, the narrative must say that it is unconfirmed rather than synthesizing a value.

Example shape:

```text
📊 JUPUSDT · 4h

- 현재 4시간봉 기준 약세 구조가 우세합니다.
- 최근 구조 고점 위 4시간봉 종가 마감 전까지 현재 시나리오가 유지됩니다.
- 관심구간은 ...
- 구조적 목표는 ...
- ... 위 종가 마감 시 현재 시나리오는 무효화됩니다.
- 일봉 구조와 방향이 다르므로 상위 TF 불일치가 있습니다.

📊 Flow: OI ... · funding ... · taker ...
```

The renderer must not state unsupported certainty such as “확실히 상승/하락” when the evidence only supports a conditional scenario.

## Flow integration

Flow data is secondary and independently degradable.

Possible fields:

- OI
- OI 24h change
- Funding
- Taker ratio
- Volume impulse
- optional CVD bias

If some sources fail, available values remain visible and unavailable values are omitted or marked unavailable. Snapshot analysis continues.

## UI

The existing `snapshot-analysis.html` remains the canonical page.

Desktop order:

- symbol + timeframe controls
- selected-TF snapshot chart
- scenario summary
- Korean narrative
- Flow row
- optional HTF context

Mobile order:

- controls
- snapshot chart
- narrative
- Flow
- supporting details

390px viewport must not horizontally overflow. Long narrative content may collapse behind a `더보기` control.

## Error isolation

- candle/structure failure: selected-TF analysis card reports the specific failure
- Flow failure: chart + narrative continue
- HTF context failure: selected-TF analysis continues
- optional overlay failure: base candles continue
- no valid zone/target/invalidation: field becomes unconfirmed; no synthetic fallback level

The page must never fail as an all-white screen because one optional subsystem failed.

## Testing

### Unit tests

`tf-analysis-engine`

- selected TF remains authoritative
- no future candles are used
- invalid source levels are excluded
- targets come from existing structural/liquidity sources
- no interest zone is synthesized when no candidate exists
- HTF conflict does not overwrite selected-TF bias

`snapshot-builder`

- overlay source IDs are preserved
- annotation budgets are enforced
- final annotations are delegated through 3.3 layout policy

`narrative-renderer`

- no concrete price appears without a scenario/source field
- missing levels produce unconfirmed wording
- selected timeframe is correctly named in every primary statement
- HTF context is clearly secondary

`flow-summary-engine`

- partial flow data degrades cleanly
- unavailable CVD does not fail OI/Funding/Taker

### Integration tests

For each of `15m`, `1h`, `4h`, `1d`:

- selected timeframe matches candle source
- chart title matches timeframe
- scenario model matches timeframe
- narrative matches timeframe
- displayed levels match scenario source IDs

### Visual/release checks

- 390px mobile viewport
- desktop viewport
- no horizontal overflow
- no Structure/SMC annotation overlap regressions
- selected-TF snapshot and text visibly agree
- Flow failure state remains usable
- Preview screenshot/manual check before merge

## Release gate

Do not merge to `main` until all of the following are true:

- new unit/integration tests green
- existing Milestone 3.3 tests green
- full repository verify green
- Vercel Preview successful
- 15m/1h/4h/1d manual spot checks complete
- 390px visual check complete
- no unsupported generated price levels observed
- Production verified after merge

## Scope boundaries

Included in v1:

- single selected timeframe snapshot
- selected-TF narrative
- structural interest zone/invalidation/targets
- optional Flow summary
- HTF context note

Deferred:

- automatic order placement
- personalized trade sizing
- automatic trade recommendation scoring
- Telegram delivery
- image export/share workflow
- simultaneous four-TF narrative cards

These may be separate future milestones rather than expanding this implementation.

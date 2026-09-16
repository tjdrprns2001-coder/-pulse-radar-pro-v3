# PulseRadar Milestone 3.3 Liquidity / ICT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Milestone 3.3 in the fixed order 3.3A Annotation/Collision → 3.3B Liquidity → 3.3C ICT Context → 3.3D Multi-Chart/Full/Visual Regression without regressing the existing Structure/SMC definitions or Milestone 3.1/3.2 declutter guarantees.

**Architecture:** Preserve `ui/chart/smc-engine.js` as the owner of existing SMC definitions, add a shared annotation-layout pipeline for all label-like overlays, then layer dedicated Liquidity and ICT Context engines above the existing Structure/SMC outputs. Rendering plugins consume engine outputs and route all label-like annotations through the shared layout engine. Multi-chart integrates the new modes with local failure isolation and curated Full-mode budgets.

**Tech Stack:** Browser JavaScript (UMD-style modules already used in `ui/chart`), Lightweight Charts 5.2.1, Node-based contract tests, GitHub Actions, Vercel Preview/Production, Playwright only for fixed-viewport screenshot regression if the existing CI runtime can support it without destabilizing the current build.

**Spec:** `docs/superpowers/specs/2026-09-16-pulseradar-milestone-3-3-liquidity-ict-design.md`

## Global Constraints

- Implement strictly in order: 3.3A → 3.3B → 3.3C → 3.3D.
- Do not rewrite or duplicate existing MSS/FVG/OB/EQ/Sweep definitions owned by `ui/chart/smc-engine.js`.
- Existing global preset budgets remain unchanged: Clean maxZones 3, Structure 5, SMC 8, Dante 5, Full 15.
- Viewport/mobile/4-chart reductions belong in render/layout policy, not in global preset definitions.
- Every Grab must reference and remain a subset of a source Sweep.
- Inducement remains candidate-only and renders as `IND?`; it must never be promoted to a confirmed signal in Milestone 3.3.
- Raw candle time is UTC; session logic uses IANA `America/New_York`. Do not maintain a manual EST/EDT transition table.
- ICT Context composes source-linked events; it must never fabricate Sweep, MSS, FVG, OB, displacement, mitigation, or session events.
- Geometry overlap tests are a required automated release gate. Screenshot regression supplements but does not replace geometry checks.
- Multi-chart failures remain card-local; no new failure may create a workspace-wide white screen.
- Vercel Preview and full CI must pass before merging to `main`; Production must be rechecked after merge.

---

## File Map

### 3.3A — Annotation / Collision
- Create `ui/chart/annotation-model.js` — candidate normalization and stable ids.
- Create `ui/chart/annotation-layout.js` — screen-space bounding boxes, priorities, offsets, caps, and decision diagnostics.
- Modify `ui/chart/collision-policy.js` — compatibility adapter into the new layout rules; retain existing Milestone 3.2 behavior where equivalent.
- Modify `ui/chart/render-policy.js` — viewport-level budgets only; do not alter global preset budgets.
- Modify `ui/chart/plugins/structure-plugin.js` — emit annotation candidates instead of directly finalizing conflicting labels.
- Modify `ui/chart/plugins/smc-plugin.js` — same migration for SMC labels/events.
- Test `tests/annotation-layout.test.js`.
- Test `tests/annotation-regression-fixtures.test.js`.
- Create fixture `tests/fixtures/annotation-dense-uni-1h.json`.
- Create fixture `tests/fixtures/annotation-dense-hype-1d.json`.

### 3.3B — Liquidity Engine
- Create `ui/chart/liquidity-engine.js` — PDH/PDL, PWH/PWL, session levels, liquidity lifecycle, Sweep enrichment, Grab subset, Void, IND? candidate.
- Create `ui/chart/session-profile.js` — versioned session/killzone profiles and IANA conversion helpers.
- Create `ui/chart/plugins/liquidity-plugin.js` — liquidity visual layer; all labels route through annotation layout.
- Modify `ui/chart/chart-plugins.js` — register Liquidity plugin.
- Modify `ui/chart/chart-data.js` only if a reusable UTC timestamp normalization helper is required; do not alter API payload semantics.
- Test `tests/liquidity-engine.test.js`.
- Test `tests/session-profile.test.js`.
- Test `tests/liquidity-plugin-contract.test.js`.

### 3.3C — ICT Context
- Create `ui/chart/ict-context-engine.js` — dealing range, Premium/Equilibrium/Discount, OTE, HTF/LTF context, PD Array references, sequence state, narrative data.
- Modify `ui/chart/plugins/ict-plugin.js` — consume `ict-context-engine` output and shared annotation layout instead of owning independent event inference.
- Modify `ui/multi-chart/ict-presentation.js` — render source-linked narrative and bands from the context engine.
- Test `tests/ict-context-engine.test.js`.
- Modify `tests/ict-presentation.test.js` — verify no fabricated events and forming/confirmed narratives.

### 3.3D — Multi-Chart / Full / Visual Regression
- Modify `ui/multi-chart/mode-registry.js` — add `liquidity` mode and curated Full composition; preserve existing mode ids.
- Modify `ui/multi-chart/chart-card.js` — compute Liquidity/ICT context independently per card with degraded local error states.
- Modify `ui/multi-chart/multi-chart.js` — default two-chart roles and optional four-chart role preset.
- Modify `ui/multi-chart/multi-chart.css` — focused/compact annotation/narrative behavior, no horizontal overflow at 390 px.
- Modify `multi-chart.html` — load new engine/plugin modules in dependency order.
- Modify `ui/pulse-shell.js` only if navigation copy needs a Liquidity label; do not add another mobile bottom-nav item.
- Modify `package.json` — add `test:milestone3-3` and prepend it to `verify`.
- Create `scripts/verify-milestone3-3.js` — runs all new 3.3 tests.
- Modify `.github/workflows/foundation-verify.yml` — ensure 3.3 test runner and relevant paths are included.
- Modify `RELEASE_CHECKLIST.md` — explicit geometry, desktop, mobile 390 px, two-chart, four-chart, Vercel Preview, Production checks.
- Optional create `tests/visual/milestone3-3.spec.js` if Playwright is already supportable in CI without a framework/dependency migration.

---

### Task 1: 3.3A Candidate Model and Stable Annotation IDs

**Files:**
- Create: `ui/chart/annotation-model.js`
- Test: `tests/annotation-layout.test.js`

**Interfaces:**
- Consumes: raw annotation-like objects from Structure, SMC, Liquidity, and ICT plugins.
- Produces: `normalizeAnnotationCandidate(input, context)` and `makeAnnotationId(candidate)`.

- [ ] **Step 1: Write the failing normalization tests**

Add tests that require these fields after normalization: `id`, `type`, `category`, `priority`, `barIndex`, `price`, `side`, `collisionGroup`, `allowOffset`, `maxOffset`, `viewportLevel`, `tf`, `sourceId`, `width`, `height`, `metadata`.

```js
const assert = require('assert');
const AnnotationModel = require('../ui/chart/annotation-model');

const a = AnnotationModel.normalizeAnnotationCandidate({
  type: 'CHOCH', category: 'structure', barIndex: 12, price: 100,
  sourceId: 'structure:12', tf: '1h'
}, { mode: 'structure', viewportLevel: 'normal' });

assert.equal(a.type, 'CHOCH');
assert.equal(a.viewportLevel, 'normal');
assert.ok(a.id);
assert.equal(a.sourceId, 'structure:12');
```

Add a second assertion that identical logical inputs yield the same id and different `sourceId` values yield different ids.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/annotation-layout.test.js`

Expected: FAIL with module-not-found for `../ui/chart/annotation-model` or missing exported functions.

- [ ] **Step 3: Implement the minimal model module**

Implement a UMD/CommonJS-compatible module matching the repo style. `normalizeAnnotationCandidate()` must provide deterministic defaults and reject missing `type`, `category`, `barIndex`, `price`, and `sourceId` with a clear error. `makeAnnotationId()` must be deterministic and must not use random values or wall-clock time.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node tests/annotation-layout.test.js`

Expected: PASS for normalization and stable-id assertions.

- [ ] **Step 5: Commit**

```bash
git add ui/chart/annotation-model.js tests/annotation-layout.test.js
git commit -m "feat: add annotation candidate model"
```

---

### Task 2: 3.3A Screen-Space Layout, Priorities, Offsets, and Caps

**Files:**
- Create: `ui/chart/annotation-layout.js`
- Modify: `tests/annotation-layout.test.js`

**Interfaces:**
- Consumes: normalized candidates plus layout context `{mode, viewportLevel, width, height, xForBar, yForPrice}`.
- Produces: `layoutAnnotations(candidates, context)` returning `{visibleIds, hiddenIds, offsets, boundingBoxes, priorityDecisions, viewportBudget, visible}`.

- [ ] **Step 1: Add failing tests for geometry collision**

Create candidates whose initial boxes overlap. Assert the higher-priority candidate is visible; the lower candidate either receives a deterministic permitted offset or is hidden. For all returned collision-relevant visible boxes assert:

```js
assert.equal(intersects(boxA, boxB), false);
```

Also add tests for mode-aware ordering:
- ICT: sequence > Grab/Sweep > MSS > HTF target > OTE > FVG/OB > EQ > structure.
- SMC: MSS/CHoCH > active OB/FVG > Grab/Sweep > BOS > EQ > swing.
- Liquidity: Grab > fresh Sweep > PDH/PDL > HTF liquidity > EQ > session > PWH/PWL > Void > IND? > old swing.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/annotation-layout.test.js`

Expected: FAIL because `layoutAnnotations` does not exist.

- [ ] **Step 3: Implement bounding-box and deterministic offset logic**

Implement:
1. effective priority calculation by mode;
2. anchor to screen coordinate mapping using supplied callbacks;
3. bounding-box construction from width/height and side;
4. collision checks against accepted boxes;
5. fixed deterministic offset slots up to `maxOffset`;
6. hide if no slot works;
7. per-category viewport cap;
8. deterministic diagnostics object.

Do not use only `barIndex` distance as the final collision rule.

- [ ] **Step 4: Add viewport-cap tests**

Assert at mobile/compact defaults:
- structure events <= 4
- Sweep/Grab <= 3
- EQ <= 2
- PDH/PDL <= 2
- PWH/PWL <= 2
- SMC zones <= 3
- ICT sequence <= 1 sequence
- IND? <= 1
- Void <= 2

Assert `4-chart` is stricter than `normal`, and `focused` is not stricter than `compact`.

- [ ] **Step 5: Run and verify GREEN**

Run: `node tests/annotation-layout.test.js`

Expected: PASS, including zero non-exempt overlap.

- [ ] **Step 6: Commit**

```bash
git add ui/chart/annotation-layout.js tests/annotation-layout.test.js
git commit -m "feat: add universal annotation layout engine"
```

---

### Task 3: 3.3A Migrate Existing Structure/SMC Labels Through Shared Layout

**Files:**
- Modify: `ui/chart/collision-policy.js`
- Modify: `ui/chart/render-policy.js`
- Modify: `ui/chart/plugins/structure-plugin.js`
- Modify: `ui/chart/plugins/smc-plugin.js`
- Create: `tests/annotation-regression-fixtures.test.js`
- Create: `tests/fixtures/annotation-dense-uni-1h.json`
- Create: `tests/fixtures/annotation-dense-hype-1d.json`

**Interfaces:**
- Consumes: existing Structure and SMC event arrays.
- Produces: shared annotation candidates + final layout decisions while preserving legacy analytical output objects.

- [ ] **Step 1: Write fixture regression tests first**

The fixture tests must assert deterministic `visibleIds`, `hiddenIds`, `offsets`, `boundingBoxes`, `priorityDecisions`, and `viewportBudget` for dense scenarios. Include desktop, 390 px mobile, and 4-chart compact contexts.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/annotation-regression-fixtures.test.js`

Expected: FAIL because plugins still bypass the universal layout path or fixtures are not supported.

- [ ] **Step 3: Adapt `collision-policy.js` into compatibility helpers**

Keep existing compact Sweep-label and legacy grouping semantics where they remain useful, but have final placement delegated to `annotation-layout.js`. Remove no Milestone 3.2 behavior unless a new test proves equivalent or better collision handling.

- [ ] **Step 4: Update Structure and SMC plugins**

Convert label-like markers into normalized candidates with stable `sourceId`; call shared layout once per plugin render pass; render only `visible` decisions. Bands/zones that are intentionally overlap-capable remain outside text collision groups but still obey render budgets.

- [ ] **Step 5: Keep render-policy separation**

Update `render-policy.js` only for viewport/card-level caps. Assert global preset zone budgets remain Clean 3 / Structure 5 / SMC 8 / Dante 5 / Full 15.

- [ ] **Step 6: Run regression tests**

Run:
```bash
node tests/annotation-layout.test.js
node tests/annotation-regression-fixtures.test.js
npm run test:collision
npm run test:declutter
```

Expected: all PASS and zero non-exempt fixture overlaps.

- [ ] **Step 7: Commit**

```bash
git add ui/chart/collision-policy.js ui/chart/render-policy.js ui/chart/plugins/structure-plugin.js ui/chart/plugins/smc-plugin.js tests/annotation-regression-fixtures.test.js tests/fixtures/annotation-dense-uni-1h.json tests/fixtures/annotation-dense-hype-1d.json
git commit -m "refactor: route structure and smc annotations through shared layout"
```

---

### Task 4: 3.3B Session Profiles with DST-Safe New York Time

**Files:**
- Create: `ui/chart/session-profile.js`
- Test: `tests/session-profile.test.js`

**Interfaces:**
- Produces: `SESSION_PROFILE_v1`, `KILLZONE_PROFILE_v1`, `toNewYorkParts(utcMs)`, `resolveSession(utcMs, profile)`.

- [ ] **Step 1: Write failing DST/session tests**

Use dates immediately around U.S. DST transitions and assert local New York hour/day conversion is correct without a manual transition table. Add tests that profile version ids remain stable and that Asia/London/New York/London Close windows resolve through the profile object rather than scattered constants.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/session-profile.test.js`

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement IANA-based conversion**

Use `Intl.DateTimeFormat(..., {timeZone: 'America/New_York'})` and profile objects. Keep all session-window values inside the exported versioned profile. Do not encode per-year EST/EDT dates.

- [ ] **Step 4: Run and verify GREEN**

Run: `node tests/session-profile.test.js`

Expected: PASS for DST boundary and session-profile assertions.

- [ ] **Step 5: Commit**

```bash
git add ui/chart/session-profile.js tests/session-profile.test.js
git commit -m "feat: add versioned new york session profiles"
```

---

### Task 5: 3.3B Liquidity Levels, PDH/PDL, PWH/PWL, and Lifecycle

**Files:**
- Create: `ui/chart/liquidity-engine.js`
- Test: `tests/liquidity-engine.test.js`

**Interfaces:**
- Consumes: `{candles, timeframe, pivots, equalLevels, sweeps, displacement, mss, fvg, orderBlocks, sessionProfile}`.
- Produces: `analyzeLiquidity(input)` returning `{levels, sweeps, voids, inducements, sessions, versions}`.

- [ ] **Step 1: Write failing level/lifecycle tests**

Cover:
- confirmed swing high/EQH/PDH/PWH/session high → buy-side;
- confirmed swing low/EQL/PDL/PWL/session low → sell-side;
- current incomplete New York day is never used as PDH/PDL;
- current incomplete week is never used as PWH/PWL;
- lifecycle states are limited to `active|probed|swept|consumed|expired`;
- existing EQ objects retain source linkage via `sourceId`.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/liquidity-engine.test.js`

Expected: FAIL because `liquidity-engine` is absent.

- [ ] **Step 3: Implement minimal level aggregation and lifecycle**

Create deterministic ids, derive previous completed NY day/week levels, classify side, and attach freshness/touch/distance metadata. Reuse existing SMC objects by `sourceId`; do not recompute EQ definitions.

- [ ] **Step 4: Add no-lookahead assertion**

Feed the same prefix twice, once alone and once with future candles appended, then compare outputs restricted to the prefix. They must be identical.

- [ ] **Step 5: Run and verify GREEN**

Run: `node tests/liquidity-engine.test.js`

Expected: PASS for level, lifecycle, and no-lookahead cases.

- [ ] **Step 6: Commit**

```bash
git add ui/chart/liquidity-engine.js tests/liquidity-engine.test.js
git commit -m "feat: add liquidity level lifecycle engine"
```

---

### Task 6: 3.3B Sweep Enrichment and Grab Subset

**Files:**
- Modify: `ui/chart/liquidity-engine.js`
- Modify: `tests/liquidity-engine.test.js`

**Interfaces:**
- Produces enriched Sweep objects with `baseType`, `variant`, `levelId`, `penetrationAtr`, `reclaimBars`, `reclaimDistanceAtr`, `displacementConfirmed`, `quality`, `definitionVersion`.

- [ ] **Step 1: Write failing Sweep/Grab invariant tests**

Assert:
- every source Sweep remains a Sweep;
- a `variant:'GRAB'` record always references a source Sweep;
- no Grab exists in a fixture with no Sweep;
- classification is deterministic;
- future candles beyond the classification window do not retroactively alter prior closed-window outcomes.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/liquidity-engine.test.js`

Expected: FAIL for missing enrichment/grab fields.

- [ ] **Step 3: Implement deterministic v1 classification**

Use fixed v1 parameters for ATR penetration, reclaim speed/window, displacement confirmation, and optional MSS support. Store parameters in one exported constant object and version outputs as `SWEEP_v2` / `GRAB_v1`. Do not tune from profitability.

- [ ] **Step 4: Run and verify GREEN**

Run: `node tests/liquidity-engine.test.js`

Expected: PASS including Grab ⊂ Sweep invariants.

- [ ] **Step 5: Commit**

```bash
git add ui/chart/liquidity-engine.js tests/liquidity-engine.test.js
git commit -m "feat: classify grab as deterministic sweep subset"
```

---

### Task 7: 3.3B Liquidity Void and Conservative Inducement Candidates

**Files:**
- Modify: `ui/chart/liquidity-engine.js`
- Modify: `tests/liquidity-engine.test.js`

**Interfaces:**
- Produces `VOID_v1` objects and `INDUCEMENT_CANDIDATE_v1` objects.

- [ ] **Step 1: Write failing Void tests**

Assert a multi-candle low-overlap displacement can yield a Void, while an isolated 3-candle FVG fixture does not automatically become the same object. Assert Void and FVG ids/types remain distinct even when price ranges overlap.

- [ ] **Step 2: Write failing Inducement tests**

Assert every inducement output has `confidence:'candidate'` and presentation label `IND?`. Assert there is no `confirmed:true` or signal-strength promotion path in 3.3.

- [ ] **Step 3: Run and verify RED**

Run: `node tests/liquidity-engine.test.js`

Expected: FAIL for missing Void/IND candidate behavior.

- [ ] **Step 4: Implement minimal deterministic detectors**

Void: fixed displacement/overlap/window parameters. IND?: only source-linked small opposing swing/EQ before a larger liquidity target, swept first, then continuation toward the major target. If evidence is incomplete, emit nothing rather than guessing.

- [ ] **Step 5: Run and verify GREEN**

Run: `node tests/liquidity-engine.test.js`

Expected: PASS and no confirmed inducement output.

- [ ] **Step 6: Commit**

```bash
git add ui/chart/liquidity-engine.js tests/liquidity-engine.test.js
git commit -m "feat: add liquidity void and inducement candidates"
```

---

### Task 8: 3.3B Liquidity Rendering Plugin

**Files:**
- Create: `ui/chart/plugins/liquidity-plugin.js`
- Modify: `ui/chart/chart-plugins.js`
- Create: `tests/liquidity-plugin-contract.test.js`

**Interfaces:**
- Consumes: `analyzeLiquidity()` result and chart-core/plugin context.
- Produces: line/band series plus annotation candidates for PDH/PDL/PWH/PWL/EQ/Sweep/Grab/IND?; never finalizes label collision itself.

- [ ] **Step 1: Write failing plugin-contract tests**

Assert:
- labels are compact (`S↑/S↓`, `G↑/G↓`, `IND?`, `PDH`, `PDL`, `PWH`, `PWL`, `EQH`, `EQL`);
- all label-like outputs expose annotation candidates with `sourceId`;
- Full-mode caps are not hardcoded inside the plugin;
- Void is emitted as a band/region object distinct from FVG.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/liquidity-plugin-contract.test.js`

Expected: FAIL because plugin is absent.

- [ ] **Step 3: Implement plugin and registration**

Follow existing `structure-plugin.js`/`smc-plugin.js` factory style. Use restrained lines/bands and delegate final label visibility to `annotation-layout.js`.

- [ ] **Step 4: Run tests**

Run:
```bash
node tests/liquidity-plugin-contract.test.js
node tests/annotation-layout.test.js
node tests/liquidity-engine.test.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/chart/plugins/liquidity-plugin.js ui/chart/chart-plugins.js tests/liquidity-plugin-contract.test.js
git commit -m "feat: add decluttered liquidity chart plugin"
```

---

### Task 9: 3.3C ICT Context Engine — Dealing Range, OTE, and PD Array References

**Files:**
- Create: `ui/chart/ict-context-engine.js`
- Test: `tests/ict-context-engine.test.js`

**Interfaces:**
- Consumes: confirmed Structure/SMC/Liquidity source objects plus HTF/LTF metadata.
- Produces: `buildIctContext(input)` returning `{dealingRange, htf, ltf, pdArrays, sequences, narrative, versions}`.

- [ ] **Step 1: Write failing dealing-range tests**

Assert:
- equilibrium = 50% of confirmed range;
- OTE context = 61.8%–79% retracement band under versioned `ICT_CONTEXT_v1` rules;
- output retains source ids and source TF;
- engine does not create new OB/FVG/Void objects; it references source ids.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/ict-context-engine.test.js`

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement context composition**

Build deterministic dealing range and PD Array reference ranking using source objects. Keep the module pure and independent from rendering.

- [ ] **Step 4: Run and verify GREEN**

Run: `node tests/ict-context-engine.test.js`

Expected: PASS for range/reference tests.

- [ ] **Step 5: Commit**

```bash
git add ui/chart/ict-context-engine.js tests/ict-context-engine.test.js
git commit -m "feat: add ict context composition engine"
```

---

### Task 10: 3.3C ICT Sequence State Machine and Narrative Truthfulness

**Files:**
- Modify: `ui/chart/ict-context-engine.js`
- Modify: `tests/ict-context-engine.test.js`
- Modify: `tests/ict-presentation.test.js`

**Interfaces:**
- Produces `ICTSequence {id,direction,htfContextId,events,state,quality,sourceIds,sourceTfs,definitionVersion}` and source-linked narrative data.

- [ ] **Step 1: Write failing sequence-state tests**

Cover:
- standard liquidity path cannot start at MSS without source Sweep/Grab;
- missing steps remain missing;
- Sweep-only is `forming`;
- deterministic minimum evidence moves to `confirmed`;
- invalidation is deterministic;
- no absent FVG/OB/MSS/displacement/mitigation appears in events or narrative;
- same input yields byte-equivalent normalized sequence output.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/ict-context-engine.test.js`

Expected: FAIL for missing state machine/narrative behavior.

- [ ] **Step 3: Implement state transitions**

Implement only `forming|confirmed|invalidated|completed`. Every event stored in `events` must carry a valid source id. Use fixed v1 invalidation/TTL parameters; do not optimize to return data.

- [ ] **Step 4: Implement narrative formatter from state, not inference**

Narrative may say that a step is missing, e.g. Sweep exists but MSS is absent. It may never describe an event that is not in `events`.

- [ ] **Step 5: Run and verify GREEN**

Run:
```bash
node tests/ict-context-engine.test.js
node tests/ict-presentation.test.js
```

Expected: PASS, including no-fabrication assertions.

- [ ] **Step 6: Commit**

```bash
git add ui/chart/ict-context-engine.js tests/ict-context-engine.test.js tests/ict-presentation.test.js
git commit -m "feat: add source-linked ict sequence state machine"
```

---

### Task 11: 3.3C ICT Plugin and Presentation Integration

**Files:**
- Modify: `ui/chart/plugins/ict-plugin.js`
- Modify: `ui/multi-chart/ict-presentation.js`
- Modify: `tests/ict-presentation.test.js`

**Interfaces:**
- Consumes: `buildIctContext()` output.
- Produces: restrained Premium/Equilibrium/Discount/OTE visuals, sequence annotation candidates, and narrative UI model.

- [ ] **Step 1: Add failing integration tests**

Assert sequence markers are generated only for present events and retain fixed numbering order. Assert missing steps do not create fake markers. Assert Premium/Discount/OTE visuals derive from `dealingRange` and not from ad hoc plugin math.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/ict-presentation.test.js`

Expected: FAIL until plugin/presentation consume ICT context.

- [ ] **Step 3: Refactor ICT plugin**

Remove independent event inference from the plugin. Generate annotation candidates (`①`, `②`, etc. with compact event codes where needed) from context events and route them through shared annotation layout. Keep in-chart prose prohibited.

- [ ] **Step 4: Refactor narrative presentation**

Render confirmed/forming state text from context output. Keep narrative below chart, not as long chart labels.

- [ ] **Step 5: Run tests**

Run:
```bash
node tests/ict-context-engine.test.js
node tests/ict-presentation.test.js
node tests/annotation-layout.test.js
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/chart/plugins/ict-plugin.js ui/multi-chart/ict-presentation.js tests/ict-presentation.test.js
git commit -m "refactor: drive ict visuals from context engine"
```

---

### Task 12: 3.3D Multi-Chart Modes, Default Roles, and Local Failure Isolation

**Files:**
- Modify: `ui/multi-chart/mode-registry.js`
- Modify: `ui/multi-chart/chart-card.js`
- Modify: `ui/multi-chart/multi-chart.js`
- Modify: `multi-chart.html`
- Modify: `tests/multi-chart-mode-registry.test.js`
- Modify: `tests/multi-chart-card.test.js`
- Modify: `tests/multi-chart-ui-contract.test.js`

**Interfaces:**
- `liquidity` mode uses Liquidity plugin.
- `ict` mode uses ICT Context + ICT plugin.
- Full remains curated and omits duplicate ICT/SMC overlays where they communicate the same event.

- [ ] **Step 1: Write failing mode/default tests**

Assert default two-chart workspace roles are:
- left: 1H Liquidity/SMC role (implementation may choose `liquidity` as visible mode with SMC zones enabled by registry policy);
- right: 4H ICT Context.

Assert suggested four-chart role preset is 15m Liquidity / 1H SMC / 4H ICT / 1D Structure.

- [ ] **Step 2: Write failing failure-isolation tests**

Stub Liquidity and ICT failures independently. Assert Structure/SMC rendering can remain active and only the affected card/layer reports degraded state.

- [ ] **Step 3: Run and verify RED**

Run:
```bash
node tests/multi-chart-mode-registry.test.js
node tests/multi-chart-card.test.js
node tests/multi-chart-ui-contract.test.js
```

Expected: FAIL until new mode/role/error contracts are implemented.

- [ ] **Step 4: Update registry and card composition**

Add Liquidity mode, keep existing Clean/Structure/SMC/ICT/Dante/Full ids stable, and make Full a curated composition. Compute Liquidity/ICT context per card. Preserve shared symbol and independent TF/mode behavior.

- [ ] **Step 5: Update page module dependency order**

Load `annotation-model.js`, `annotation-layout.js`, `session-profile.js`, `liquidity-engine.js`, `ict-context-engine.js`, Liquidity plugin, then ICT/multi-chart code in `multi-chart.html`.

- [ ] **Step 6: Run and verify GREEN**

Run the three multi-chart tests plus `npm run test:multi-chart`.

Expected: PASS, with no workspace-wide failure from one engine/card error.

- [ ] **Step 7: Commit**

```bash
git add ui/multi-chart/mode-registry.js ui/multi-chart/chart-card.js ui/multi-chart/multi-chart.js multi-chart.html tests/multi-chart-mode-registry.test.js tests/multi-chart-card.test.js tests/multi-chart-ui-contract.test.js
git commit -m "feat: integrate liquidity and ict context into multi-chart"
```

---

### Task 13: 3.3D Mobile/Focused Layout and Full-Mode Budget Contracts

**Files:**
- Modify: `ui/multi-chart/multi-chart.css`
- Modify: `ui/chart/render-policy.js`
- Modify: `tests/multi-chart-ui-contract.test.js`
- Modify: `tests/annotation-layout.test.js`

**Interfaces:**
- Uses `viewportLevel: normal|focused|compact|4-chart`.

- [ ] **Step 1: Write failing mobile contract tests**

Assert 390 px layout has no required horizontal overflow, cards stack vertically, focused card may receive a higher annotation budget, and 4-chart cards use stricter caps. Assert Narrative remains below the chart and can be collapsed/hidden in compact state.

- [ ] **Step 2: Run and verify RED**

Run:
```bash
node tests/multi-chart-ui-contract.test.js
node tests/annotation-layout.test.js
```

Expected: FAIL for missing focused/compact contracts.

- [ ] **Step 3: Implement CSS and render-policy behavior**

Keep chart card height approximately 360–420 px on mobile. Do not add long in-chart labels. Maintain one existing mobile bottom-nav only.

- [ ] **Step 4: Assert Full-mode curated budgets**

Ensure starting Full budgets remain within:
- Structure labels 3–4
- Liquidity events 2–3
- SMC zones 2–3
- ICT sequence 1
- PDH/PDL <= 2
- PWH/PWL <= 2
- Void <= 1–2
- IND? <= 1

The annotation engine may reduce further because of collision/viewport constraints.

- [ ] **Step 5: Run and verify GREEN**

Run the two tests plus `npm run test:collision` and `npm run test:declutter`.

- [ ] **Step 6: Commit**

```bash
git add ui/multi-chart/multi-chart.css ui/chart/render-policy.js tests/multi-chart-ui-contract.test.js tests/annotation-layout.test.js
git commit -m "feat: add compact multi-chart annotation budgets"
```

---

### Task 14: Milestone 3.3 Unified Verification Runner

**Files:**
- Create: `scripts/verify-milestone3-3.js`
- Modify: `package.json`
- Modify: `.github/workflows/foundation-verify.yml`

**Interfaces:**
- Produces `npm run test:milestone3-3` and includes it at the front of `npm run verify`.

- [ ] **Step 1: Write the verification runner**

The script must execute, in deterministic order:

```text
tests/annotation-layout.test.js
tests/annotation-regression-fixtures.test.js
tests/session-profile.test.js
tests/liquidity-engine.test.js
tests/liquidity-plugin-contract.test.js
tests/ict-context-engine.test.js
tests/ict-presentation.test.js
tests/multi-chart-mode-registry.test.js
tests/multi-chart-card.test.js
tests/multi-chart-ui-contract.test.js
```

Exit non-zero on the first failing child process.

- [ ] **Step 2: Update npm scripts**

Add:

```json
"test:milestone3-3": "node scripts/verify-milestone3-3.js"
```

and prepend it to `verify` before existing multi-chart/collision/declutter gates.

- [ ] **Step 3: Update GitHub Actions paths/command**

Ensure the existing verification workflow runs `npm run verify` for changes to new engine/plugin/test files and the multi-chart page.

- [ ] **Step 4: Run full verification**

Run: `npm run verify`

Expected: PASS for 3.3 plus all pre-existing gates.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-milestone3-3.js package.json .github/workflows/foundation-verify.yml
git commit -m "test: add milestone 3.3 verification gate"
```

---

### Task 15: Deterministic Geometry/Visual Regression Release Gate

**Files:**
- Modify: `tests/annotation-regression-fixtures.test.js`
- Optional Create: `tests/visual/milestone3-3.spec.js`
- Modify: `RELEASE_CHECKLIST.md`

**Interfaces:**
- Geometry and JSON snapshots are mandatory.
- Pixel screenshot regression is supplemental and only added if CI supports Playwright cleanly.

- [ ] **Step 1: Lock deterministic geometry snapshots**

For UNIUSDT 1H, HYPEUSDT 1D, desktop, 390 px mobile, two-chart, and four-chart compact fixtures, assert exact normalized diagnostics: `visibleIds`, `hiddenIds`, offsets, bounding boxes, priority decisions, viewport budget.

- [ ] **Step 2: Add screenshot regression if runtime support is already safe**

If Playwright/browser runtime is already available or can be added without restructuring the project, create fixed-viewport captures. If not, do not introduce a heavy dependency migration in 3.3; record manual Vercel Preview screenshot review in the release checklist instead. Geometry remains the mandatory automated gate in either case.

- [ ] **Step 3: Update release checklist**

Require:
- all automated 3.3 tests;
- no non-exempt geometry overlaps;
- desktop visual check;
- iPhone-like 390 px check;
- two-chart and four-chart check;
- no horizontal overflow;
- ICT narrative truthfulness spot-check;
- Vercel Preview success;
- Production recheck after merge.

- [ ] **Step 4: Run full verification again**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/annotation-regression-fixtures.test.js RELEASE_CHECKLIST.md tests/visual/milestone3-3.spec.js
git commit -m "test: lock milestone 3.3 visual regression gates"
```

If `tests/visual/milestone3-3.spec.js` is intentionally not created because Playwright is not available without a scope-expanding migration, omit it from `git add` and make the manual Preview review explicit in `RELEASE_CHECKLIST.md`.

---

### Task 16: Final Regression, Preview, PR, Merge, and Production Verification

**Files:**
- No new feature files unless verification reveals a defect.
- May modify `RELEASE_CHECKLIST.md` only to record a discovered reproducible release condition.

**Interfaces:**
- Release gate for Milestone 3.3.

- [ ] **Step 1: Run fresh full verification**

Run: `npm run verify`

Expected: PASS. Do not rely on an earlier run.

- [ ] **Step 2: Review diff against the spec**

Verify:
- SMC analytical definitions were not duplicated/redefined;
- global preset zone budgets remain unchanged;
- Grab ⊂ Sweep;
- IND? is candidate-only;
- IANA New York time is used;
- ICT narratives reference real source ids only;
- multi-chart errors remain local;
- geometry overlap gate is active.

- [ ] **Step 3: Push feature branch and wait for GitHub Actions**

Expected: complete successful CI for the final branch head.

- [ ] **Step 4: Require a successful Vercel Preview**

Open the Preview and manually verify at least:
- UNIUSDT 1H dense annotations;
- HYPEUSDT 1D dense annotations;
- 390 px mobile layout;
- two-chart 1H Liquidity/SMC + 4H ICT;
- four-chart compact layout;
- no visible CH/CHoCH/MSS overlap regression;
- no duplicated Y-axis badges;
- no workspace-wide white screen when one card is degraded.

If Preview is unavailable or rate-limited, stop before merge.

- [ ] **Step 5: Open/update PR and review**

PR summary must explicitly list 3.3A/B/C/D, test gates, and manual Preview checks.

- [ ] **Step 6: Merge only after CI + Preview are green**

Use the repository's normal merge strategy. Do not bypass the Preview gate unless the human explicitly changes the release criteria.

- [ ] **Step 7: Verify Production**

Check `https://pulse-radar-pro-v3.vercel.app/` and `https://pulse-radar-pro-v3.vercel.app/multi-chart.html` after Production deploy. Repeat mobile and dense-annotation smoke checks.

- [ ] **Step 8: Final completion report**

Report final main commit SHA, PR number, GitHub Actions result, Vercel Production result, and any intentionally deferred optional item such as crosshair/range synchronization.

---

## Self-Review Notes

- **Spec coverage:** 3.3A candidate/layout/migration/geometry; 3.3B sessions/levels/Sweep-Grab/Void/IND/plugin; 3.3C dealing range/OTE/PD Array/sequence/narrative/plugin; 3.3D multi-chart/mobile/Full/failure isolation/visual regression/release are each mapped to explicit tasks.
- **Placeholder scan:** No TBD/TODO/"implement later" placeholders. Optional Playwright behavior has an explicit branch: use it only if runtime support exists without scope expansion; otherwise manual Preview screenshot review is mandatory and geometry remains automated.
- **Type consistency:** Shared names are fixed as `normalizeAnnotationCandidate`, `layoutAnnotations`, `analyzeLiquidity`, `buildIctContext`, `SESSION_PROFILE_v1`, `KILLZONE_PROFILE_v1`.
- **Scope check:** Crosshair/visible-range sync remains outside the required 3.3 implementation because the approved spec marks it optional future/polish behavior.

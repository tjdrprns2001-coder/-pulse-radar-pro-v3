# PulseRadar Milestone 3 SMC v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, versioned SMC v2 context engine to Unified Chart without changing existing Structure/Calibration formulas, then render only high-priority validated context through the existing plugin architecture.

**Architecture:** Keep `/api/structure` as the source of canonical swing structure and candles. Add a pure browser/Node-compatible SMC engine that derives internal structure, MSS, equal highs/lows, sweeps, displacement, FVG/iFVG, OB/breaker candidates, Premium/Discount/OTE, lifecycle, and HTF alignment from already-closed candles. The chart plugin only renders engine output; it never invents analytical state.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, Lightweight Charts 5.2.1, existing `/api/structure`, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-16-pulseradar-unified-analysis-v2-design.md`

## Global Constraints

- Preserve existing `/api/structure` response contracts and current calibration formulas.
- Use only confirmed/closed candles for structural labels.
- Version every SMC definition in output.
- Treat SMC output as context tags, not trade instructions or probability guarantees.
- Never call an ordinary retest a breaker.
- Rendering obeys `Clean / Structure / SMC / Dante / Full` preset budgets.
- Clean preset remains visually minimal; SMC context is opt-in through SMC/Full.
- No look-ahead: a pivot becomes usable only after its right-side confirmation bars exist.
- Keep `/technique-lab.html` available as rollback.

---

## File Structure

Create:
- `ui/chart/smc-engine.js` — pure deterministic SMC v2 calculations and definition registry.
- `ui/chart/plugins/smc-plugin.js` — Lightweight Charts renderer for SMC engine output.
- `tests/smc-engine.test.js` — definition, no-look-ahead, lifecycle, quality and HTF tests.
- `tests/smc-plugin.test.js` — rendering-budget and visibility contract tests.
- `scripts/verify-milestone3.js` — Milestone 3 test gate.

Modify:
- `unified-chart.html` — load/register SMC plugin and expose compact SMC context summary.
- `ui/chart/unified-chart.css` — compact SMC context chips/drawer styling.
- `ui/chart/chart-plugins.js` — no interface change; verify SMC plugin conforms.
- `package.json` — add `test:smc` before earlier gates.
- `.github/workflows/foundation-verify.yml` — run on Milestone 3 branch.
- `RELEASE_CHECKLIST.md` — add SMC v2 production checks.

---

### Task 1: Lock SMC definition registry and confirmed internal pivots

**Files:** Create `ui/chart/smc-engine.js`; Create `tests/smc-engine.test.js`.

**Interfaces:**
- `DEFINITIONS` exact ids: `INTERNAL_v1`, `EQ_v1`, `SWEEP_v1`, `MSS_v1`, `DISPLACEMENT_v1`, `FVG_v1`, `IFVG_v1`, `OB_v1`, `BREAKER_v1`, `PD_OTE_v1`, `HTF_BIAS_v1`.
- `confirmedPivots(candles,{left=2,right=2}) -> Pivot[]` where each pivot has `{index, confirmedAt, type:'H'|'L', price}`.

- [ ] Write failing tests proving a pivot is invisible before `confirmedAt=index+right` and input candles are not mutated.
- [ ] Run `node --test tests/smc-engine.test.js` and verify RED because the module does not exist.
- [ ] Implement UMD/CommonJS-compatible module and definition registry.
- [ ] Implement confirmed internal pivots with strict greater/less-than comparison and `confirmedAt`.
- [ ] Run tests and verify GREEN.
- [ ] Commit `feat: add versioned SMC definition registry`.

### Task 2: Equal highs/lows and liquidity sweeps

**Interfaces:**
- `detectEqualLevels({candles,pivots,atrSeries}) -> EqualLevel[]`.
- `detectSweeps({candles,equalLevels,swingLevels,atrSeries}) -> Sweep[]`.

Exact `EQ_v1` rules:
- same-type confirmed pivots;
- at least 3 bars apart;
- tolerance = `max(price*0.0010, ATR*0.20)`;
- level uses mean price of the matched pivots;
- output `EQH` or `EQL`, first/last pivot index, and touch count.

Exact `SWEEP_v1` rules:
- high sweep: high exceeds level by at least `0.05*ATR` and close finishes back below the level;
- low sweep: low exceeds level downward by at least `0.05*ATR` and close finishes back above the level;
- sweep consumes only levels confirmed before the sweep bar;
- output carries `source:'EQH'|'EQL'|'swing'`, direction, level, bar index, excessAtr.

- [ ] Add RED fixtures for EQH, EQL, valid sweep and a wick that does not close back inside.
- [ ] Implement exactly the rules above.
- [ ] Verify GREEN and commit `feat: add equal liquidity and sweep detection`.

### Task 3: Displacement quality and MSS

**Interfaces:**
- `detectDisplacements({candles,atrSeries,volumeSma20}) -> Displacement[]`.
- `detectMss({candles,internalPivots,sweeps,displacements}) -> MssEvent[]`.

Exact `DISPLACEMENT_v1` baseline retained from existing ICT lab:
- body/ATR >= 0.90;
- volume / SMA20 >= 1.30 when volume history is available;
- directional close edge <= 0.28 of full range;
- quality components: `bodyAtr`, `volumeRatio`, `closeEdge`, with `quality` capped 0–100.

Exact `MSS_v1`:
- requires a confirmed internal opposite-side pivot level;
- close, not wick, breaks that level;
- a same-direction displacement must occur on the break bar or within 2 bars after it;
- if a same-direction liquidity sweep occurred within the previous 6 bars, tag `sweepConfirmed:true`; otherwise MSS remains valid but lower quality;
- do not relabel ordinary BOS from `/api/structure`; MSS is separate context.

- [ ] Add RED tests for weak-body rejection, low-volume rejection, valid bullish/bearish MSS, and wick-only non-MSS.
- [ ] Implement displacement and MSS.
- [ ] Verify GREEN and commit `feat: add displacement quality and MSS context`.

### Task 4: FVG/iFVG and zone lifecycle

**Interfaces:**
- `detectFvgs({candles,atrSeries,displacements}) -> Zone[]`.
- `advanceZoneLifecycle({zones,candles,currentIndex,ttlBars=160}) -> Zone[]`.

Exact `FVG_v1`:
- bullish gap when `low[i] > high[i-2]`; bearish gap when `high[i] < low[i-2]`;
- gap size must be >= `0.15*ATR[i]`;
- displacement on bar `i-1`, `i`, or `i+1` increases quality but is not required for existence;
- zone stores CE midpoint.

Lifecycle states: `active`, `approaching`, `touched`, `mitigated`, `violated`, `expired`.
- `approaching`: current close within 0.5 ATR of nearest boundary;
- `touched`: wick enters zone but close remains outside far boundary;
- `mitigated`: close reaches or crosses CE while structural direction is not yet violated;
- `violated`: bullish zone close below lower boundary / bearish close above upper boundary;
- `expired`: age > 160 closed bars and not already violated.

`IFVG_v1`: a violated FVG becomes `inverted:true` only after a confirmed close through the far boundary; subsequent rendering is opposite-context reference.

- [ ] Add lifecycle transition tests and confirm no state can move backward from `violated`/`expired`.
- [ ] Implement FVG/iFVG and lifecycle.
- [ ] Verify GREEN and commit `feat: add FVG lifecycle and inversion`.

### Task 5: OB, breaker, Premium/Discount and OTE

**Interfaces:**
- `detectOrderBlocks({candles,displacements,mssEvents,atrSeries}) -> Zone[]`.
- `classifyBreaker({orderBlocks,candles,mssEvents}) -> Zone[]`.
- `buildPdOte({candles,canonicalSwings,currentPrice}) -> PdOteContext`.

Exact `OB_v1`:
- must have qualified displacement;
- must have same-direction MSS or canonical BOS within 3 bars of displacement;
- choose the last opposite-direction candle within the previous 7 bars;
- reject source candle if its full range > 2.5 ATR;
- quality includes displacement quality + structure link + optional FVG overlap.

Exact `BREAKER_v1`:
- original OB must first become `violated`;
- a confirmed opposite-direction MSS must occur after violation;
- only then expose breaker candidate; an ordinary revisit is never a breaker.

`PD_OTE_v1`:
- use latest confirmed canonical swing pair that defines an active dealing range;
- equilibrium = 50%; below = Discount, above = Premium;
- OTE window is 62%–79% retracement of that dealing range and is context only;
- return `unavailable` if no valid swing pair.

- [ ] Add RED tests for OB without structure rejection, valid OB, ordinary retest not breaker, valid breaker, PD and OTE math.
- [ ] Implement and verify GREEN.
- [ ] Commit `feat: add order block breaker and PD OTE context`.

### Task 6: HTF Bias Lock and aggregate engine output

**Interfaces:**
- `deriveHtfBias({currentBias,htfBias}) -> 'aligned'|'counter-trend'|'neutral'`.
- `analyzeSmcV2({candles,canonicalSwings,canonicalEvents,trendlines,htf}) -> SmcAnalysis`.

Rules:
- HTF bias never hard-disables a lower-TF context.
- matching directional structure => `aligned`;
- opposite clear structure => `counter-trend`;
- missing/mixed => `neutral`.
- `analyzeSmcV2` includes `definitions`, `internalStructure`, `equalLevels`, `sweeps`, `mss`, `displacements`, `fvgs`, `orderBlocks`, `breakers`, `pdOte`, `htfBias`.

- [ ] Add RED aggregate-output/version tests.
- [ ] Implement deterministic aggregate function.
- [ ] Verify GREEN and commit `feat: compose SMC v2 analysis context`.

### Task 7: Render SMC through the existing plugin budget

**Files:** Create `ui/chart/plugins/smc-plugin.js`; Create `tests/smc-plugin.test.js`; Modify `unified-chart.html`, `ui/chart/unified-chart.css`.

**Interfaces:** Plugin id `smc`, version `2.0.0`, required methods `mount/update/setVisible/dispose`.

Rendering policy:
- only active/approaching/touched/mitigated high-priority zones;
- never render violated/expired unless Full preset explicitly asks for research history;
- prioritize recent, HTF-tagged, quality, active, distance-to-price using existing preset budget policy;
- markers: MSS, sweep, EQH/EQL; zones: FVG/iFVG, OB/breaker; PD/OTE is subtle background/line context;
- Clean and Structure presets keep SMC plugin hidden; SMC and Full enable it.
- labels use short forms only (`MSS`, `EQH`, `EQL`, `FVG`, `iFVG`, `OB`, `BRK`) to avoid mobile clutter.

- [ ] Write RED fake-chart tests asserting hidden preset produces zero SMC series/markers and SMC budget is respected.
- [ ] Implement plugin and compact summary chips in workspace.
- [ ] Ensure plugin receives engine output and does not recalculate definitions.
- [ ] Verify tests GREEN and commit `feat: render SMC v2 context in unified chart`.

### Task 8: Milestone gate, CI and production checks

**Files:** Create `scripts/verify-milestone3.js`; Modify `package.json`, `.github/workflows/foundation-verify.yml`, `RELEASE_CHECKLIST.md`.

- [ ] Add `test:smc` running `tests/smc-engine.test.js` and `tests/smc-plugin.test.js`.
- [ ] Set `verify` order to `test:smc && test:chart && test:foundation && check:calibration && gate:release`.
- [ ] Add release checks for definition ids, no-look-ahead, lifecycle, breaker distinction, PD/OTE, HTF bias, mobile budget, and fallback route.
- [ ] Run full `npm run verify`; require zero failures.
- [ ] Require Vercel Preview status success on the exact branch head.
- [ ] Open PR only after branch is 0 commits behind `main`; merge with expected head SHA.
- [ ] Require Production Vercel status success on the resulting `main` merge commit.

## Completion Gate

Milestone 3 is complete only when:
- all SMC v2 definition tests pass;
- confirmed-pivot/no-look-ahead behavior is proven by tests;
- MSS requires close break + displacement context;
- EQH/EQL and sweep use deterministic tolerances;
- FVG/iFVG and OB/breaker lifecycle is explicit;
- ordinary retests cannot become breakers;
- PD/OTE is contextual only;
- HTF Bias Lock never hard-blocks countertrend context;
- SMC rendering obeys preset budgets and remains hidden in Clean/Structure;
- existing Structure/Calibration tests still pass;
- Preview and Production deployments both succeed.
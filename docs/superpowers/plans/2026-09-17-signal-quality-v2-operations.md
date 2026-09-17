# Signal Quality v2 Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Signal Quality v2 operational research features without alerts or automatic trading.

**Architecture:** Extend the existing browser-side signal-quality modules with validation-source separation, hierarchical calibration resolution, historical replay/backfill helpers, policy gates, performance aggregation, alert history, abstention analytics, DEX feature normalization, and a reference-only risk calculator. Wire these into the snapshot/scanner/unified-shell UI with explicit provenance and live-vs-backtested labels.

**Tech Stack:** Vanilla JavaScript, Node.js `node:test`, static HTML/CSS, existing Netlify/Vercel routing.

**Spec:** `docs/superpowers/specs/2026-09-17-signal-quality-v2-operations-design.md`

## Global Constraints

- No Telegram, Discord, push notification, exchange-key, automatic-order, or automatic model-weight rewriting features.
- `LIVE_VALIDATED` and `BACKTESTED` evidence remain separate and visibly labeled.
- Backtested-only evidence never unlocks live `ARMED`, `TRIGGERED`, or `CONFIRMED` states.
- Missing evidence produces `unknown`, `insufficient`, `NO_SIGNAL`, or a conservative state cap.
- Drift warning may tighten gates but never loosen them.
- Pattern score remains distinct from calibrated probability.

---

### Task 1: Validation-source storage and historical backfill core

**Files:**
- Modify: `lib/signal-quality/outcome-recorder.js`
- Create: `lib/signal-quality/historical-backfill.js`
- Test: `tests/signal-quality-v2-operations.test.js`

**Interfaces:**
- Produces `VALIDATION_SOURCES`, `snapshotKey(snapshot)`, source-aware `resolvedSamples()`, and `HistoricalBackfill.backfill(candles, detector, opts)`.

- [ ] Write failing tests for deterministic snapshot keys, source filtering, historical 5/10/20/50 outcomes, and duplicate prevention.
- [ ] Run `node --test tests/signal-quality-v2-operations.test.js` and verify RED.
- [ ] Implement source-aware outcome recording and deterministic historical replay.
- [ ] Re-run the test and verify GREEN.
- [ ] Commit.

### Task 2: Hierarchical calibration backoff and known-value statistical sanity

**Files:**
- Modify: `lib/signal-quality/calibration.js`
- Test: `tests/signal-quality-v2-operations.test.js`

**Interfaces:**
- Produces `resolveHierarchical(samples, context, opts)` returning `bucketLevel`, `bucketLabel`, `broaderBucket`, `validationSource`, `N`, `probability`, `ci`, and calibration metrics.

- [ ] Add failing tests for fallback chain, live preference, backtested separation, Wilson 60/100 known interval, Brier and ECE fixed examples.
- [ ] Run test and verify RED.
- [ ] Implement resolver and sanity helpers using existing `report()`.
- [ ] Run test and verify GREEN.
- [ ] Commit.

### Task 3: Drift 30/90 UI and conservative policy gate

**Files:**
- Create: `lib/signal-quality/policy-gate.js`
- Modify: `ui/snapshot/snapshot-quality.js`
- Modify: `tests/snapshot-quality-ui-contract.test.js`
- Test: `tests/signal-quality-v2-operations.test.js`

**Interfaces:**
- Produces `PolicyGate.evaluate({integrityState, calibration, drift, materiallyContributing})` and snapshot UI output for both 30d and 90d drift windows.

- [ ] Add failing tests requiring `compareWindows()` in UI and WATCH cap on drift warning / insufficient calibration.
- [ ] Run tests and verify RED.
- [ ] Implement policy gate and wire 30/90 drift display + policy reason into STATE.
- [ ] Run tests and verify GREEN.
- [ ] Commit.

### Task 4: Outcome/performance aggregation and dashboard

**Files:**
- Create: `lib/signal-quality/performance.js`
- Create: `performance-dashboard.html`
- Create: `ui/signal-quality/performance-dashboard.js`
- Modify: `pulse-unified.html`
- Modify: `ui/pulse-shell.js`
- Test: `tests/signal-quality-v2-dashboard.test.js`

**Interfaces:**
- Produces `Performance.aggregate(rows, dimensions)` and `Performance.abstentionComparison(rows)`.

- [ ] Add failing aggregation tests for count, hit rate, mean/median return, average R, drawdown proxy, source separation, calibration metrics, and alert-state grouping.
- [ ] Run test and verify RED.
- [ ] Implement aggregation module.
- [ ] Build dashboard with filters and snapshot drilldown from local outcome storage.
- [ ] Add shell navigation entry.
- [ ] Run tests and verify GREEN.
- [ ] Commit.

### Task 5: Alert transition history and abstention analytics

**Files:**
- Create: `lib/signal-quality/alert-history.js`
- Modify: `lib/signal-quality/outcome-recorder.js`
- Modify: `ui/snapshot/snapshot-quality.js`
- Test: `tests/signal-quality-v2-operations.test.js`

**Interfaces:**
- Produces `AlertHistory.recordTransition()`, `AlertHistory.list()`, `AlertHistory.summary()`, and abstention snapshots with reason/context.

- [ ] Add failing tests for transition persistence, reason/context fields, NO_SIGNAL capture, and 20/50-bar abstention outcomes.
- [ ] Run test and verify RED.
- [ ] Implement history store and abstention capture.
- [ ] Wire snapshot state changes to history.
- [ ] Run tests and verify GREEN.
- [ ] Commit.

### Task 6: SURGE/scanner one-click research flow

**Files:**
- Modify: `index.html`
- Modify: `surge-pattern-lab.html`
- Modify: `ui/pulse-shell.js`
- Test: `tests/signal-quality-v2-links.test.js`

**Interfaces:**
- Deep links preserve `symbol`, optional `tf`, `source`, and `context` to unified analysis, snapshot, ICT, and performance views.

- [ ] Add failing contract tests for deep links and symbol preservation.
- [ ] Run test and verify RED.
- [ ] Add research action links/buttons to scanner and SURGE views.
- [ ] Run test and verify GREEN.
- [ ] Commit.

### Task 7: DEX microstructure expansion

**Files:**
- Modify: `lib/signal-quality/microstructure.js`
- Modify: `lib/market-flow/dex.js`
- Test: `tests/signal-quality-v2-operations.test.js`

**Interfaces:**
- DEX feature object exposes swap-volume acceleration, swap imbalance, pool liquidity delta, LP net flow, price impact, liquidity/market-cap ratio, unique-trader acceleration, whale-swap concentration, provenance, and freshness; unavailable values remain `null`.

- [ ] Add failing tests for complete DEX schema and null/provenance behavior.
- [ ] Run test and verify RED.
- [ ] Extend DEX feature normalization while preserving CEX/DEX separation.
- [ ] Run test and verify GREEN.
- [ ] Commit.

### Task 8: Reference-only risk and staged-exit calculator

**Files:**
- Create: `lib/signal-quality/risk-calculator.js`
- Create: `risk-calculator.html`
- Modify: `pulse-unified.html`
- Modify: `ui/pulse-shell.js`
- Test: `tests/signal-quality-v2-risk.test.js`

**Interfaces:**
- Produces `RiskCalculator.calculate({accountSize,riskPct,entry,invalidation,targets,exitWeights})` with risk amount, stop distance, quantity/notional estimate, R:R values, and staged-exit arithmetic.

- [ ] Add failing arithmetic and no-order contract tests.
- [ ] Run test and verify RED.
- [ ] Implement pure calculator and reference-only UI with no API/order action.
- [ ] Run test and verify GREEN.
- [ ] Commit.

### Task 9: Full verification

**Files:**
- Modify: `scripts/verify-milestone3-1.js`
- Modify: `.github/workflows/foundation-verify.yml` if required to include v2 tests.

- [ ] Add all v2 tests to the verification script.
- [ ] Run the full verification suite and confirm zero failures.
- [ ] Open PR from `signal-quality-v2-operations` to `main`.
- [ ] Confirm CI status and inspect deployment preview before any merge claim.

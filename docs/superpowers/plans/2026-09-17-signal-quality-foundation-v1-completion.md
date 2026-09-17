# Signal Quality Foundation v1 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining Signal Quality Foundation v1 gaps and integrate them into the restored snapshot quality UI.

**Architecture:** Add small signal-quality modules for clock/order integrity and drift, extend existing outcome/calibration/alert modules, then wire only verified available data into the existing snapshot quality bridge. Preserve the compact DATA/CALIBRATION/REGIME/STATE surface and move diagnostics into expandable details.

**Tech Stack:** Browser JavaScript, Node.js built-in test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-17-signal-quality-foundation-v1-completion-design.md`

## Global Constraints
- No automatic order execution.
- Raw model score must never be presented as calibrated probability.
- Calibration sample insufficiency must hard-block ARMED/TRIGGERED/CONFIRMED.
- Missing CEX/DEX fields remain null rather than fabricated.
- Existing 15m/1h/4h/1d/1w snapshot behavior remains compatible.

---

### Task 1: Clock and ordering integrity
**Files:** Create `lib/signal-quality/clock-integrity.js`; modify `lib/signal-quality/data-integrity.js`; test `tests/signal-quality-v1-completion.test.js`.
**Produces:** `observeEvent`, `summarizeClock`, feed counters and enriched provenance.
- [ ] Write failing tests for delay, out-of-order, gap, reconnect/backfill counters.
- [ ] Run Node tests and confirm failure.
- [ ] Implement minimal module and data-integrity extensions.
- [ ] Run tests and confirm pass.

### Task 2: Outcome and calibration completion
**Files:** Modify `lib/signal-quality/outcome-recorder.js`, `lib/signal-quality/calibration.js`; test same file.
**Produces:** 50-bar outcomes, metadata-filtered samples, Wilson CI, adequacy status.
- [ ] Write failing tests for metadata filters and CI/status.
- [ ] Run and confirm failure.
- [ ] Implement minimal changes.
- [ ] Run and confirm pass.

### Task 3: Alert lifecycle metadata
**Files:** Modify `lib/signal-quality/alert-state.js`; test same file.
**Produces:** armedAt, triggeredAt, confirmedAt, reasonChangedAt, cooldownUntil while preserving calibration gate.
- [ ] Write failing lifecycle metadata tests.
- [ ] Run and confirm failure.
- [ ] Implement transition metadata.
- [ ] Run and confirm pass.

### Task 4: Feature drift monitor
**Files:** Create `lib/signal-quality/drift-monitor.js`; test same file.
**Produces:** recent 30/90 day versus historical contribution diagnostics with insufficient/stable/warning states.
- [ ] Write failing drift tests.
- [ ] Run and confirm failure.
- [ ] Implement diagnostic monitor.
- [ ] Run and confirm pass.

### Task 5: Snapshot integration and provenance UI
**Files:** Modify `snapshot-analysis-restored.html`, `ui/snapshot/snapshot-quality.js`, `tests/snapshot-quality-ui-contract.test.js`.
**Produces:** 5/10/20/50 outcome resolution, clock/order health, counters, provenance details, CI/status, drift details, available microstructure metadata.
- [ ] Add contract assertions first.
- [ ] Run and confirm failure.
- [ ] Wire modules and expandable diagnostics.
- [ ] Run focused tests.

### Task 6: Verification
**Files:** Modify `scripts/verify-milestone3-1.js` to include the new test.
- [ ] Run focused Signal Quality tests.
- [ ] Run `npm run test:declutter`.
- [ ] Run Foundation Verify workflow on branch.
- [ ] Compare branch to main and merge only after successful verification.
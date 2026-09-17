# Signal Quality Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production-safe signal-quality layer to the restored snapshot screen: feed integrity, immutable outcome recording, calibration metrics, simple regime classification, CEX/DEX microstructure separation, abstention, and alert-state lifecycle.

**Architecture:** Keep the existing snapshot analysis engine unchanged. Add focused UMD/CommonJS modules under `lib/signal-quality/` and a browser adapter under `ui/snapshot/` that observes the existing snapshot page, captures source data, records outcomes locally, and renders a compact quality strip. The UI must never fabricate a calibrated probability; until enough resolved observations exist it displays collection/insufficient-sample state.

**Tech Stack:** Node.js CommonJS tests, browser JavaScript, localStorage, existing Vercel/static frontend.

**Spec:** Approved chat design: Feed → Integrity → Outcome logging → Structure/SMC → Flow → Calibration → Regime → CEX/DEX Microstructure → Alert State → Historical validation → UI.

## Global Constraints
- Existing MTF snapshot remains intact.
- Restored snapshot keeps 15m/1h/4h/1D/1W.
- No automatic orders.
- No fabricated win-rate/probability.
- CEX order-book metrics and AMM DEX metrics stay separate.
- Data can abstain with `NO SIGNAL / INSUFFICIENT EVIDENCE`.

---

### Task 1: Core signal-quality modules
**Files:** Create `lib/signal-quality/data-integrity.js`, `outcome-recorder.js`, `calibration.js`, `regime.js`, `alert-state.js`, `microstructure.js`; Test `tests/signal-quality-foundation.test.js`.

- [ ] Write tests for state transitions, immutable records, Brier/ECE/saturation, regime output, alert hysteresis, and CEX/DEX metric separation.
- [ ] Implement minimal modules to satisfy tests.
- [ ] Add the test to repository verification.

### Task 2: Snapshot quality UI
**Files:** Create `ui/snapshot/snapshot-quality.js`; Modify `snapshot-analysis-restored.html`.

- [ ] Load signal-quality modules before the existing snapshot orchestrator.
- [ ] Wrap fetch non-destructively to record latency/source/freshness and clone structure responses.
- [ ] Render DATA / CALIBRATION / REGIME / STATE cards below the existing snapshot layout.
- [ ] Record immutable snapshots and resolve prior outcomes from later candles.
- [ ] Show `NO SIGNAL` when integrity/evidence gates are not met.

### Task 3: Verification and rollout
- [ ] Run the repository verification on the implementation commit.
- [ ] Fast-forward `main` only after verification is green.
- [ ] Confirm Vercel deployment status is success.

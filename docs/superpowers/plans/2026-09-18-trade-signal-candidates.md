# Trade Signal Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic pre-surge and buy-candidate signal metadata to the existing whole-market scanner without adding automatic order execution.

**Architecture:** Keep the existing 8 scanner categories as the primary market-state classification. Add a separate `tradeSignal` synthesis layer in `scanner-core.js`, expose it on summary/deep scan items, and render it on the existing mobile scanner cards. Strong signals require live data plus multiple independent confirmations; stale/failed/delayed and already-surged states cannot become a buy candidate.

**Tech Stack:** Node.js/CommonJS, existing PulseRadar deterministic scanner, Netlify/Vercel API wrappers, vanilla browser JS/CSS, repository verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-17-auto-coin-scanner-classification-design.md`

## Global Constraints

- Keep existing 8 primary scanner categories unchanged.
- No automatic order placement, wallet actions, leverage sizing, or exchange-key trading actions.
- `stale`, `failed`, `reconnecting`, `backfill`, `verifying`, `unknown`, and `delayed` must not produce a strong buy candidate.
- `이미 급등함` and `약세·이탈` must not produce a buy candidate.
- Signal output must expose level, confidence, confirmations, reasons, and invalidations.
- Existing scanner and Pulse AI paths must continue working when the new field is absent.

---

### Task 1: Deterministic trade-signal synthesis

**Files:**
- Modify: `scripts/verify-coin-scan-core.js`
- Modify: `lib/coin-scan/scanner-core.js`

**Interfaces:**
- Produces: `buildTradeSignal(input) -> {level, confidence, confirmations, reasons, invalidations}`

- [ ] Add failing assertions for strong buy candidate, watch candidate, delayed-data block, already-surged block, and bearish block.
- [ ] Run `node scripts/verify-coin-scan-core.js` and confirm failure because `buildTradeSignal` is missing.
- [ ] Implement `buildTradeSignal` using data state, category, structure, PRE-SURGE label, taker ratio, volume acceleration, price change, and reaccumulation evidence.
- [ ] Re-run `node scripts/verify-coin-scan-core.js` and confirm PASS.

### Task 2: Expose signal through scanner API objects

**Files:**
- Modify: `scripts/verify-coin-scan-api.js`
- Modify: `lib/coin-scan/scan-service.js`

**Interfaces:**
- Consumes: `Core.buildTradeSignal(...)`
- Produces: each scanner item contains `tradeSignal`.

- [ ] Add failing API/service assertions that summary and deep items contain a well-formed `tradeSignal` object.
- [ ] Run the coin-scan API verifier and confirm the new assertion fails.
- [ ] Populate `tradeSignal` after classification in `baseItem` and `deepItem`; delayed fallback must downgrade it to a blocked/watch state.
- [ ] Re-run API/core verifiers and confirm PASS.

### Task 3: Render buy-candidate state on scanner cards

**Files:**
- Modify: `scripts/verify-coin-scan-ui.js`
- Modify: `ui/coin-scan.js`
- Modify: `ui/coin-scan.css`

**Interfaces:**
- Consumes: `item.tradeSignal.level`, `.confidence`, `.confirmations`, `.invalidations`

- [ ] Add failing UI assertions for trade-signal badge and confidence text.
- [ ] Run `node scripts/verify-coin-scan-ui.js` and confirm failure.
- [ ] Render `매수 후보`, `관찰`, `제외` badges with confidence and confirmation count while preserving existing category/priority/candidate score.
- [ ] Add compact mobile-safe styles for the new badge.
- [ ] Re-run UI verifier and confirm PASS.

### Task 4: Regression verification and PR

**Files:**
- Verify: repository scripts only

- [ ] Run `npm run test:coin-scan`.
- [ ] Run `npm run test:radar` if the focused suite passes.
- [ ] Compare branch to `main` and review only intended files.
- [ ] Open a PR describing deterministic signal rules, data-state blocks, and no-auto-order boundary.

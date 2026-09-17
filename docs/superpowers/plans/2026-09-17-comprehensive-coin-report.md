# Comprehensive Coin Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first single-symbol report that reuses existing scanner/Signal Quality infrastructure and renders 1W→15m analysis plus a decluttered annotated chart.

**Architecture:** Add a deterministic `lib/coin-report` layer over the existing Binance provider/deep-scan modules, expose it through one Netlify API, and render a dedicated report page/canvas. Existing Pulse AI web-search is optional and isolated from the deterministic report path.

**Tech Stack:** Node.js CommonJS, existing Binance provider, existing Signal Quality browser modules, Netlify Functions, browser JS/CSS/Canvas.

**Spec:** `docs/superpowers/specs/2026-09-17-comprehensive-coin-report-design.md`

## Global Constraints
- No independent HIGH/MEDIUM/LOW confidence system.
- Calibration status comes only from existing Outcome Recorder + PulseCalibration.
- Missing calibration or bad data produces NO SIGNAL / 판단 보류 copy.
- AI/news failure never breaks core report.
- Mobile overlay label count is bounded.

---

### Task 1: Deterministic report analyzer
**Files:** Create `lib/coin-report/analyzer.js`; create `scripts/verify-coin-report-core.js`.
- [ ] Test 1W→15m summaries, swing-derived levels, FVG/liquidity, conflict detection, bounded overlay labels and missing-frame fallback.
- [ ] Run core verifier RED.
- [ ] Implement analyzer.
- [ ] Run core verifier GREEN.

### Task 2: Report service and API
**Files:** Create `lib/coin-report/service.js`, `api/coin-report.js`, `netlify/functions/coin-report.js`; modify `netlify.toml`; create `scripts/verify-coin-report-api.js`.
- [ ] Test symbol validation, provider integration, partial timeframe failure, deterministic response and API 4xx/5xx contract.
- [ ] Run API verifier RED.
- [ ] Implement service/API/Netlify wrapper.
- [ ] Run API verifier GREEN.

### Task 3: Mobile report UI and annotated snapshot
**Files:** Create `coin-report.html`, `ui/coin-report.js`, `ui/coin-report.css`; create `scripts/verify-coin-report-ui.js`.
- [ ] Test five sections, calibration modules, report endpoint, canvas renderer, NO SIGNAL copy and absence of trade/order controls.
- [ ] Run UI verifier RED.
- [ ] Implement page, calibration derivation from local outcomes, and 4H canvas overlay.
- [ ] Run UI verifier GREEN.

### Task 4: Scanner/Pulse AI click-through and shell routing
**Files:** Modify `ui/coin-scan.js`, `ui/pulse-ai.js`, `ui/pulse-shell.js`; create `scripts/verify-coin-report-wiring.js`.
- [ ] Test report links/card navigation and shell `report` view.
- [ ] Run wiring verifier RED.
- [ ] Implement click-through wiring.
- [ ] Run verifier GREEN.

### Task 5: Optional sourced news enrichment
**Files:** Extend `lib/coin-report/service.js` and `api/coin-report.js`; reuse `lib/pulse-ai/openai-gateway.js`.
- [ ] Test missing-key unavailable state and AI web-search isolation.
- [ ] Implement `mode=news` without affecting core report.
- [ ] Verify fallback stays deterministic.

### Task 6: Repository verification and deployment
**Files:** Modify `package.json`.
- [ ] Register four report test scripts in `test:radar`/`verify`.
- [ ] Run report verifiers and full repository verification where available.
- [ ] Open PR, verify Netlify Deploy Preview, merge to main, verify production SHA.
- [ ] Smoke-test report page and report API on production.
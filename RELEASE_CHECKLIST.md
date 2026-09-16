# PulseRadar Pro v3 Release Checklist

## Automated gate
Run `npm run verify` before updating `main`.

Required PASS conditions:
- Milestone 3.3 annotation/liquidity/ICT/multi-chart verification passes with zero failures.
- Deterministic geometry snapshots pass for UNIUSDT 1H at 390 px, desktop, two-chart focused, and HYPEUSDT 1D four-chart compact scenarios.
- Every collision-relevant visible annotation pair has zero bounding-box overlap unless explicitly exempted as a band/zone.
- Multi-chart workspace state/request/mode/ICT/card/page/shell tests pass with zero failures.
- Milestone 3.1 declutter/mobile contract tests pass with zero failures.
- SMC v2 Milestone 3 tests pass with zero failures.
- Unified Chart Milestone 2 tests pass with zero failures.
- Foundation shell/preset/data-state tests pass with zero failures.
- Calibration engine and calibration-set versions match across detector and profile.
- Freeze Manifest produces a deterministic 64-character SHA-256 fingerprint.
- Dataset split totals 100% and free-parameter budget stays at three or fewer per family.
- Unified API dispatcher contains pattern-validation, calibration-health and calibration-freeze.
- Vercel rewrites exist for those routes.
- Analysis shell loads Calibration Lab v3 and Calibration Readiness v2.
- `calibration-lab` Vercel deployment remains disabled during development.

## Milestone 3.3 Preview gate
Pixel screenshot automation is not a required dependency for Milestone 3.3. The repository does not add a Playwright/browser dependency solely for this release; deterministic geometry remains the mandatory automated visual-layout gate. A real Vercel Preview review is mandatory before merge.

- [ ] Vercel Preview deployment for the final branch head is successful.
- [ ] UNIUSDT 1H dense Structure/SMC/Liquidity annotations are readable with no visible CH/CHoCH/MSS label collision.
- [ ] HYPEUSDT 1D dense scenario is readable in four-chart compact mode.
- [ ] 390 px mobile view has no required horizontal overflow; cards stack vertically.
- [ ] Two-chart default shows 1H Liquidity context and 4H ICT context with shared symbol and independent timeframe/mode.
- [ ] Four-chart preset is 15m Liquidity / 1H SMC / 4H ICT / 1D Structure.
- [ ] Mobile four-chart narrative is compact by default and becomes readable when a card is focused/expanded.
- [ ] ICT narrative describes only source-linked events; forming sequences do not claim missing MSS/FVG/OB/mitigation events.
- [ ] Grab markers are a subset of source Sweep events; `IND?` remains candidate-only.
- [ ] No duplicated Y-axis value badges regress into the chart.
- [ ] Degrading Liquidity or ICT context on one card does not blank sibling cards or the workspace.
- [ ] Global Foundation preset budgets remain Clean 3 / Structure 5 / SMC 8 / Dante 5 / Full 15; viewport reductions remain separate policy.

## Manual pre-main review
- [ ] Multi-chart defaults to two charts and supports 1/2/4 layouts.
- [ ] Shared symbol updates every chart while timeframe and analysis mode remain chart-local.
- [ ] Default 2-chart example renders one Liquidity/SMC-context chart and one visually distinct ICT chart.
- [ ] SMC mode uses zone/liquidity emphasis; ICT uses Premium/Discount/OTE plus source-linked sequence context only from confirmed engine data.
- [ ] Mobile 2/4 layouts stack vertically and can focus/restore a chart without horizontal compression.
- [ ] Identical symbol+TF loads are deduplicated; one card API failure does not blank siblings.
- [ ] Multi-chart workspace persists layout/TF/mode state and does not persist API results.
- [ ] Embedded multi-chart uses the single product shell; no duplicate top/bottom navigation.
- [ ] Mobile shows exactly one product topbar and one bottom navigation.
- [ ] No floating shell control covers chart candles.
- [ ] Mobile symbol input shows complete `USDT` suffix without clipping.
- [ ] Mobile SMC summary remains a compact horizontal strip instead of wrapping over the chart.
- [ ] Repeated Sweep markers are capped and rendered compactly; no vertical `SWP` wall.
- [ ] Structure labels share one total rendering budget and omit old low-priority markers.
- [ ] Clean/Structure/SMC/Liquidity/ICT/Dante/Full modes persist across reload where supported by workspace state.
- [ ] Global preset budgets remain compatible with Foundation; viewport-specific caps are applied by render policy.
- [ ] Rendering budgets are enforced by preset policy.
- [ ] Live/Confirmed/Partial/Stale/Insufficient-history/API-degraded states are distinguishable.
- [ ] Unified Chart loads the pinned Lightweight Charts 5.2.1 build.
- [ ] BTCUSDT renders candles on 15m/1h/4h/1d.
- [ ] RSI/MACD/Stoch RSI render in separate panes when enabled.
- [ ] Structure plugin displays only existing API structure/trendline outputs.
- [ ] Dante preset exposes EMA 5/20/60/112/224/256/448 without fabricating long-period values on short history.
- [ ] SMC definition ids are emitted and versioned.
- [ ] Internal pivots are confirmed only after right-side bars exist; no future pivots are consumed.
- [ ] MSS requires a close break plus same-direction displacement context.
- [ ] EQH/EQL and sweep rules use deterministic ATR/price tolerances.
- [ ] FVG/iFVG and OB/Breaker lifecycle states are explicit.
- [ ] Ordinary OB retests are never labeled Breaker without violation plus opposite MSS.
- [ ] Premium/Discount and OTE are context only, not entry instructions.
- [ ] HTF Bias Lock reports aligned/counter-trend/neutral and does not hard-disable setups.
- [ ] SMC/Full respect viewport render budgets; Clean/Structure keep SMC layers hidden.
- [ ] Legacy `/technique-lab.html` remains reachable for rollback.
- [ ] Library/API failure produces a visible fallback state, never a white screen.
- [ ] HOLDOUT remains locked and is not used to tune parameters.
- [ ] No calibration proposal is auto-applied.
- [ ] Review `CALIBRATION_CHANGELOG.md` and freeze fingerprint.
- [ ] Review mobile analysis layout for duplicate cards, overflow and unusable horizontal width.
- [ ] Review one futures-only symbol after production deployment to preserve browser futures fallback.

## Production sequence
1. Freeze the calibration configuration and record the SHA-256 fingerprint.
2. Run `npm run verify` and require PASS.
3. Require successful Vercel Preview plus every Milestone 3.3 Preview gate above.
4. Merge the verified work branch into `main`.
5. Wait for the Vercel Production deployment.
6. Verify `/api/calibration-health`, `/api/calibration-freeze`, `/api/pattern-validation`, `/unified-chart.html`, `/multi-chart.html`, and the canonical analysis route.
7. Repeat the 390 px, two-chart, four-chart, dense-annotation, narrative-truthfulness, and degraded-card smoke checks on Production.
8. If production verification fails, do not inspect HOLDOUT; fix on the work branch and repeat with a new verified head.

This checklist governs detector research quality and deployment integrity. It is not a trading-performance certification.
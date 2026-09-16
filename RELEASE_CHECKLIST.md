# PulseRadar Pro v3 Release Checklist

## Automated gate
Run `npm run verify` before updating `main`.

Required PASS conditions:
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

## Manual pre-main review
- [ ] Multi-chart defaults to two charts and supports 1/2/4 layouts.
- [ ] Shared symbol updates every chart while timeframe and analysis mode remain chart-local.
- [ ] Default 2-chart example renders one SMC chart and one visually distinct ICT chart.
- [ ] SMC mode uses zone/liquidity emphasis; ICT uses Premium/Discount/OTE plus ①→④ sequence context only from confirmed engine data.
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
- [ ] Clean/Structure/SMC/Dante/Full presets persist across reload.
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
- HOLDOUT remains locked and is not used to tune parameters.
- No calibration proposal is auto-applied.
- Review `CALIBRATION_CHANGELOG.md` and freeze fingerprint.
- Review mobile analysis layout for duplicate cards, overflow and unusable horizontal width.
- Review one futures-only symbol after production deployment to preserve browser futures fallback.

## Production sequence
1. Freeze the calibration configuration and record the SHA-256 fingerprint.
2. Run `npm run verify` and require PASS.
3. Merge the verified work branch into `main`.
4. Wait for the Vercel Production deployment.
5. Verify `/api/calibration-health`, `/api/calibration-freeze`, `/api/pattern-validation`, `/unified-chart.html`, `/multi-chart.html`, and the canonical analysis route.
6. If production verification fails, do not inspect HOLDOUT; fix on the work branch and repeat with a new verified head.

This checklist governs detector research quality and deployment integrity. It is not a trading-performance certification.
# PulseRadar Pro v3 Release Checklist

## Automated gate
Run `npm run verify` before updating `main`.

Required PASS conditions:
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
- [ ] Mobile shows exactly one product topbar and one bottom navigation.
- [ ] No floating shell control covers chart candles.
- [ ] Clean/Structure/SMC/Dante/Full presets persist across reload.
- [ ] Rendering budgets are enforced by preset policy.
- [ ] Live/Confirmed/Partial/Stale/Insufficient-history/API-degraded states are distinguishable.
- [ ] Unified Chart loads the pinned Lightweight Charts 5.2.1 build.
- [ ] BTCUSDT renders candles on 15m/1h/4h/1d.
- [ ] RSI/MACD/Stoch RSI render in separate panes when enabled.
- [ ] Structure plugin displays only existing API structure/trendline outputs.
- [ ] Dante preset exposes EMA 5/20/60/112/224/256/448 without fabricating long-period values on short history.
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
5. Verify `/api/calibration-health`, `/api/calibration-freeze`, `/api/pattern-validation`, `/unified-chart.html`, and the canonical analysis route.
6. If production verification fails, do not inspect HOLDOUT; fix on the work branch and repeat with a new verified head.

This checklist governs detector research quality and deployment integrity. It is not a trading-performance certification.

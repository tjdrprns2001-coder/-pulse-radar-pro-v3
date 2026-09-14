# PulseRadar Pro v3 Release Checklist

## Automated gate
Run `npm run verify` before updating `main`.

Required PASS conditions:
- Calibration engine and calibration-set versions match across detector and profile.
- Freeze Manifest produces a deterministic 64-character SHA-256 fingerprint.
- Dataset split totals 100% and free-parameter budget stays at three or fewer per family.
- Unified API dispatcher contains pattern-validation, calibration-health and calibration-freeze.
- Vercel rewrites exist for those routes.
- Analysis shell loads Calibration Lab v3 and Calibration Readiness v2.
- `calibration-lab` Vercel deployment remains disabled during development.

## Manual pre-main review
- HOLDOUT remains locked and is not used to tune parameters.
- No calibration proposal is auto-applied.
- Review `CALIBRATION_CHANGELOG.md` and freeze fingerprint.
- Review mobile analysis layout for duplicate cards, overflow and unusable horizontal width.
- Review BTCUSDT on 15m/1h/4h/1d after production deployment.
- Review one futures-only symbol after production deployment to preserve browser futures fallback.

## Production sequence
1. Freeze the calibration configuration and record the SHA-256 fingerprint.
2. Run `npm run verify` and require PASS.
3. Fast-forward `main` once from the verified `calibration-lab` head.
4. Wait for the single Vercel Production deployment.
5. Verify `/api/calibration-health`, `/api/calibration-freeze`, `/api/pattern-validation` and the analysis page.
6. If production verification fails, do not inspect HOLDOUT; fix on the work branch and repeat with a new verified head.

This checklist governs detector research quality and deployment integrity. It is not a trading-performance certification.

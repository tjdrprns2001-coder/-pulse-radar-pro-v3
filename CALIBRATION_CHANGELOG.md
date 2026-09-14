# Calibration Change Ledger

This ledger records research-protocol changes before any pinned HOLDOUT inspection.

## calib-2026-09-14-b
- Added 10/20/40-bar evaluation horizons.
- Replaced static point-in-time audit claim with runtime future-pivot, future-anchor, future-confirmation and detector-input counters.
- Added Binance open-time deduplication for paginated validation history.
- Added confidence-bin and market-regime diagnostics.
- Added bounded parameter metadata and proposal-only calibration; auto-apply remains disabled.
- Strengthened HOLDOUT gate with exact engine/calibration pins plus explicit `inspect=1`.
- Added deterministic Freeze Manifest SHA-256 fingerprint.
- Added Calibration Readiness classification and regime stability diagnostics.
- Added governance checklist requiring frozen versions, disabled auto-apply/HOLDOUT tuning, point-in-time policy and at least one READY research candidate before pinned inspection.

## Governance rules
- Never tune from HOLDOUT output.
- Any detector definition, structural rule, accepted calibration parameter or evaluation-policy change requires a new calibration version and a new freeze fingerprint.
- Keep HOLDOUT absent from the normal analysis UI.
- Reliability and readiness describe historical detector diagnostics, not future return probability or trading instructions.

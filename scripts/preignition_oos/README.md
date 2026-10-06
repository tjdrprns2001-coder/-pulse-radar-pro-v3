# Pre-ignition OOS live validation

This folder contains the Python reference scanner and the forward-validation
collector used to test pre-ignition signals without using future candles.

## What is measured

- Scanner type: A / B / A+B / C
- Stage: PRE / COMPRESSED / ARMED / IGNITION / CONFIRM / EARLY_IGNITION
- Volume context: VOLUME-ECHO / RECENT-PRELOAD / ECHO+RECENT-PRELOAD / QUIET
- Forward returns: 1h / 4h / 24h
- Matched controls: nearest symbols by log 24h quote volume and 24h price change

The forward validator stores the market price observed after a completed scan.
It does not assume entry at a historical signal price.

## Setup

```bash
python -m pip install -r scripts/preignition_oos/requirements.txt
python scripts/preignition_oos/scanner.py --self-test
```

## One live collection

```bash
python scripts/preignition_oos/validate.py collect --once
```

## Continuous collection every 15 minutes

Run on a long-lived runner with outbound access to `fapi.binance.com`.

```bash
python scripts/preignition_oos/validate.py collect --interval 900
```

## Report

After forward prices have accumulated:

```bash
python scripts/preignition_oos/validate.py report
```

The report includes observed sample counts and matched-control counts. Missing
future prices are excluded rather than backfilled.

## Research constraints

The historical 159-coin tables were successful examples and are not a control
group. Do not treat their condition frequencies as success probabilities.

The scanner intentionally keeps:
- 1D compression as context, not a hard requirement.
- 4H compression or pullback/recovery as the main setup split.
- PRE-stage RVOL unconstrained.
- Negative MACD histogram allowed when improving.
- 15m as the main ignition timeframe.
- 5m as structure/taker confirmation rather than a hard RVOL gate.
- Volume Echo separate from recent preload.
- OI missing => no A/A+B promotion.

Generated SQLite and JSON outputs are ignored by git.

## 112/224/448 + Ichimoku A-F full-universe scan

The scanner also runs an independent daily structural pass over the complete Binance USDT perpetual universe. It uses SMA 112/224/448 and standard Ichimoku (9/26/52, projected 26 bars) and does **not** reject symbols by 24h quote volume.

Lifecycle output:

- A: 112 recovery with room toward 224
- B: first 112 pullback/hold
- C: cloud/224 resistance zone
- D: cloud-top + 224 breakout/retest/hold
- TREND_PULLBACK: 112 > 224 > 448 with a 112/cloud pullback
- E: 448 target/management zone; excluded from new-entry candidates
- F: 224/cloud failure; excluded from new-entry candidates

Top A/B/C/D candidates are enriched with 1H readiness, 15m/5m execution gates, OI and futures taker flow. Candle RVOL is a confirmation/quality input only; quote volume remains disabled as a hard filter.

# Comprehensive Coin Report Design

## Goal
Turn a selected Binance spot USDT symbol into one readable report that combines 1W→15m structure, SMC/ICT, pattern/anomaly analysis, support/resistance and a decluttered chart snapshot, with optional Pulse AI/news enrichment.

## Product Rules
- Reuse existing scanner, Signal Quality, calibration and NO_SIGNAL concepts; do not create a second confidence system.
- `adequate / weak / insufficient` is the only calibration vocabulary shown to users.
- Beginner copy must abstain when data/calibration are insufficient; it must not turn weak evidence into a directional conclusion.
- News is a separate evidence layer with source/time. Do not claim a news item caused a price move.
- AI is enhancement only. Core report, MTF summary and overlay chart work without an API key.
- No order placement, leverage, wallet signing, custody or automated trade actions.

## Data Flow
1. User selects a symbol from Auto Coin Classification or Pulse AI, or opens the report with `?symbol=`.
2. `/api/coin-report?symbol=...` fetches Binance 1W/1D/4H/1H/15m frames and derivatives context through the existing provider.
3. Deterministic analyzers produce per-TF metrics, swing pivots, support/resistance, supply/demand, FVG, liquidity, structural breaks, chart-pattern candidates and anomaly summaries.
4. The server returns a compact report plus 4H candles/overlay geometry for client rendering.
5. Browser derives calibration state from existing local Outcome Recorder samples. If the local sample count is insufficient, the report displays `insufficient / NO SIGNAL` rather than a new confidence badge.
6. Optional `/api/coin-report?mode=news&symbol=...` uses the existing Pulse AI gateway with web search when OpenAI is configured. Failure returns an explicit unavailable state and never breaks the report.

## UI
`coin-report.html` is a mobile-first single-symbol report with five sections/tabs:
- Summary: easy explanation, data state, calibration/no-signal, anomalies.
- Multi-TF: 1W, 1D, 4H, 1H, 15m roles and summaries.
- Smart Money: structure break, OB-like supply/demand, FVG, liquidity and plain-language glossary.
- Snapshot: rendered 4H candlestick canvas with only the highest-priority overlays: support/resistance, supply/demand, pattern geometry, FVG/liquidity markers.
- Evidence: deterministic reasons, signal conflicts, derivatives context and optional sourced news.

## Click-through Integration
- Auto Coin Classification cards open `/coin-report.html?symbol=...` when the card or `종합 분석` link is selected.
- Pulse AI highlight/watch rows become report links for their symbols.
- The unified shell recognizes `report` as a view and routes to `coin-report.html` so the top symbol selector can refresh the current report.

## Overlay Declutter
Maximum visible labels on mobile: 8. Priority: support/resistance > supply/demand > active pattern > structural break > FVG > liquidity. Lower-priority duplicates are collapsed.

## Error/Fallback
- Missing one timeframe marks that TF unavailable but keeps the rest of the report.
- Complete Binance failure returns an error report without changing scanner behavior.
- Missing OpenAI key returns deterministic report and `news.available=false`.
- Bad or stale data cannot produce a strong directional beginner summary.

## Verification
Add Node verification scripts for the deterministic analyzer, API contract, UI contract and click-through wiring. Include them in `test:radar` / `verify`.
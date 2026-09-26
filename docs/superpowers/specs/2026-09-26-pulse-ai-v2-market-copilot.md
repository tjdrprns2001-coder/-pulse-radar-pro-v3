# Pulse AI v2 Market Copilot

## Purpose

Pulse AI v2 is the market briefing and question layer for PulseRadar. It must remain useful when external generative AI is unavailable, while never changing production scanner ranking or executing trades.

## Runtime layers

1. **Deterministic analyst**
   - Reads the existing scanner summary.
   - Separates pre-ignition candidates from already-surged names.
   - Computes breadth, major-asset context, sector concentration, data quality, selected-symbol focus, and Research AI state.
   - Answers common questions locally when Gemini is unavailable.

2. **Material event detector**
   - Emits only threshold crossings and state transitions: pre-surge entry/upgrade/exit, score jumps, RVOL/taker/OI crossings, data warnings/recovery, and meaningful sector rotation.
   - Sector changes use count thresholds rather than every symbol-order change to avoid noisy AI calls.

3. **Research AI integration**
   - Pulse AI reads Research AI v2 status only.
   - Research AI stays SHADOW_ONLY and Pulse AI cannot promote or alter scanner decisions.

4. **Optional Gemini grounding**
   - Server-side key only.
   - Bounded timeout and one transient retry.
   - Scanner/news text is treated as untrusted data.
   - External claims require sources and are normalized before UI rendering.
   - Failure falls back to deterministic analysis.

5. **Mobile UI**
   - Market breadth and regime.
   - Pre-ignition candidate rail with already-surged names separated.
   - Selected-symbol focus and report navigation.
   - Sector flow, Research AI warm-up state, catalysts, technical changes, warnings, sources.
   - Visibility-aware 60-second polling and manual forced refresh.
   - Chat with quick prompts and optional deep analysis.

## API

- GET /api/pulse-ai?mode=brief&symbol=BTCUSDT
- GET /api/pulse-ai?mode=brief&symbol=BTCUSDT&fresh=1
- GET /api/pulse-ai?mode=health
- POST /api/pulse-ai?mode=chat

Chat body example:

    {
      "question": "XLM 지금 왜 관찰 후보야?",
      "selectedSymbol": "XLMUSDT",
      "deep": false
    }

## Safety and data rules

- No automatic order placement, leverage changes, wallet signing, or withdrawals.
- Missing market data remains missing; Pulse AI must not invent values.
- Already-surged/extended names are not presented as pre-ignition priorities.
- Stale or degraded data is surfaced explicitly.
- Web events are catalysts, not proof of price causation.
- Gemini output is advisory text only; scanner and Research AI state machines remain independent.

## Verification

Focused CI runs:

- syntax checks for Pulse AI v2 modules and browser JS
- core/event/context/fallback tests
- Gemini gateway normalization and retry tests
- API brief/chat/health tests
- mobile UI contract tests
- full Foundation Verify

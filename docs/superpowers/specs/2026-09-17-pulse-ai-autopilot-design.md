# Pulse AI Autopilot Design

## Goal
Add an embedded AI operator to PulseRadar Pro v3 that continuously summarizes market changes, explains scanner signals, and enriches high-priority events with fresh web/news context. The AI is informational only and must not place trades or submit orders.

## User experience
- A persistent `Pulse AI` briefing panel appears in the unified shell and mobile navigation.
- Without a user prompt, the panel automatically produces a concise market brief from scanner changes.
- New high-signal events are grouped into: new PRE-SURGE candidates, category changes, sector clustering, abnormal volume/buy pressure, already-surged names, and data-quality warnings.
- Users can also ask follow-up questions in a chat drawer. The assistant automatically receives the currently selected symbol plus the latest scanner context.
- Every web-derived claim includes source title/domain and timestamp when available.
- If internal scanner data and web context conflict, the UI marks the item as `확인 필요` instead of forcing a conclusion.

## Architecture

### 1. Event detector
Create `lib/pulse-ai/event-detector.js`.
- Input: current coin-scan summary and the previous accepted summary.
- Emits only material changes to avoid repetitive AI calls.
- Triggers include:
  - category changed into `급등 전조 강함` or `급등 전조 관찰`
  - material candidate-score increase
  - new volume anomaly or buy-pressure state
  - multiple coins in the same sector changing state together
  - data state changing to stale/failed/delayed
- Deterministic thresholds live in one config object and are unit tested.

### 2. AI context builder
Create `lib/pulse-ai/context-builder.js`.
- Converts scanner output into a compact, bounded JSON payload.
- Includes only top changed symbols and the evidence already produced by PulseRadar.
- Never fabricates missing metrics; missing fields stay `null`/`unavailable`.
- Redacts secrets and does not send API keys, cookies, or raw user identifiers.

### 3. OpenAI gateway
Create `lib/pulse-ai/openai-gateway.js` and `api/pulse-ai.js`.
- Server-side only. Browser never receives `OPENAI_API_KEY`.
- Uses the OpenAI Responses API.
- Default model: `gpt-5.6-luna` for routine briefs and chat.
- Escalation model: `gpt-5.6-sol` only for complex multi-symbol analysis or explicit deep-analysis requests.
- Enables the Responses API web-search tool only when fresh external context is needed.
- Uses structured JSON output for briefing cards so the UI can render predictable fields.
- Request timeouts, bounded output tokens, retry-on-transient-failure, and graceful fallback are required.

### 4. Automatic briefing service
Create `lib/pulse-ai/briefing-service.js`.
- Reads coin-scan output, runs event detection, and calls AI only when there is meaningful change or the cached brief is old.
- Stores the latest in-memory brief for fast same-instance reuse; first version does not require a database.
- If AI is unavailable or `OPENAI_API_KEY` is missing, returns a deterministic non-AI brief from scanner evidence instead of breaking the site.
- AI failure must never affect the scanner API.

### 5. API routes
Add:
- `GET /api/pulse-ai?mode=brief` -> latest/generated automatic brief.
- `POST /api/pulse-ai?mode=chat` -> follow-up question with selected symbol/scanner context.

Response shape for brief:
```json
{
  "status": "ok",
  "generatedAt": 0,
  "model": "...",
  "usedWeb": false,
  "summary": "...",
  "highlights": [],
  "watch": [],
  "dataWarnings": [],
  "sources": []
}
```

Each highlight contains symbol, category, sector, explanation, evidence, confidence label (`낮음/보통/높음`), and optional source references. Confidence is a communication label derived from evidence completeness, not a price prediction probability.

### 6. UI
Add `ui/pulse-ai.js`, `ui/pulse-ai.css`, and a `Pulse AI` view in `pulse-unified.html`.
- Mobile-first briefing cards.
- Sections: `지금 시장 요약`, `새로 포착`, `섹터 움직임`, `관련 뉴스`, `주의/데이터 상태`.
- Shows `AI 분석` versus `기본 분석` badge so fallback output is obvious.
- Refresh button and automatic refresh aligned with scanner cadence.
- Chat drawer supports concise follow-up questions and shows loading/error states.
- No order buttons or automatic trade actions.

## Data flow
1. UI fetches `/api/coin-scan?mode=summary` as today.
2. Pulse AI brief endpoint obtains the same scanner service result server-side.
3. Event detector compares it with the prior snapshot.
4. Context builder creates a small evidence payload.
5. If changes are meaningful, OpenAI Responses API generates a structured brief and may use web search for fresh context.
6. Briefing service caches the result.
7. UI renders cards and sources. If AI fails, deterministic scanner-based fallback is returned.

## News/web behavior
- Web search is event-driven, not run for every coin.
- Prefer project/issuer/official exchange announcements and reputable reporting when the model returns sources.
- Sources must be displayed; uncited external claims are omitted from the rendered news section.
- Freshness-sensitive statements include observed/published time where available.
- Web context explains possible catalysts; it must not be treated as proof of causation when evidence is ambiguous.

## Safety and product boundaries
- Informational market analysis only.
- No automatic order placement, leverage configuration, wallet signing, withdrawals, or custody actions.
- The AI must distinguish observed data from inference.
- It must avoid guaranteed-return language or claims that a rise/fall will definitely occur.
- Data-quality states continue to override signal interpretation; stale/failed data is surfaced as a warning.

## Cost controls
- Luna handles routine summaries/chat.
- Sol is opt-in by routing rules for complex analysis.
- Maximum changed-symbol count per brief is bounded.
- Web search runs only for selected high-priority events.
- Cache repeated briefs and suppress unchanged events.

## Error handling
- Missing `OPENAI_API_KEY`: deterministic fallback brief, `aiAvailable:false`.
- OpenAI timeout/429/5xx: one bounded retry, then fallback.
- Web-search failure: AI may summarize internal scanner evidence but marks external context unavailable.
- Scanner failure: no AI interpretation from empty data; return data-warning state.
- Invalid structured output: validate and normalize before returning to UI.

## Testing
TDD coverage must include:
- event detector suppresses unchanged scans and emits meaningful transitions
- stale/failed scanner data cannot produce a strong AI highlight
- context builder is bounded and preserves missing values
- gateway never exposes API key to client payloads
- fallback works without an API key
- web-source normalization rejects malformed links/items
- API brief/chat contract tests
- mobile UI contains brief/chat sections and safe HTML rendering
- full repository `npm run verify` passes before merge

## Deployment
- Store `OPENAI_API_KEY` only as a Netlify production/runtime environment variable.
- No key is committed to GitHub.
- Merge through PR after CI passes.
- Verify Netlify production deploy commit SHA and run a live `/api/pulse-ai?mode=brief` smoke test.
- If no API key is configured yet, deploy remains usable in deterministic fallback mode until the key is added.

## Acceptance criteria
1. Site automatically shows a useful brief without the user typing a question.
2. Meaningful scanner changes are summarized while unchanged scans do not spam new AI calls.
3. High-priority events can be enriched with fresh web context and visible sources.
4. User can ask follow-up questions about the selected symbol.
5. AI/network failures never break the scanner dashboard.
6. OpenAI secret remains server-side only.
7. No trading/order execution capability is introduced.

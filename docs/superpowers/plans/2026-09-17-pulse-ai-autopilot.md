# Pulse AI Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an embedded Pulse AI operator that automatically summarizes meaningful scanner changes, optionally enriches them with fresh web context through the OpenAI Responses API, and supports follow-up chat without affecting the existing scanner when AI is unavailable.

**Architecture:** Keep deterministic market-event detection and context preparation local to the app, then call OpenAI only through a server-side gateway. The briefing service owns throttling/cache/fallback behavior; the browser talks only to `/api/pulse-ai`. UI is mobile-first and clearly distinguishes AI-generated from deterministic fallback output.

**Tech Stack:** Node.js CommonJS, Netlify serverless routing already used by the repo, browser JavaScript/CSS, OpenAI Responses API via direct HTTPS `fetch` (no new npm dependency).

**Spec:** `docs/superpowers/specs/2026-09-17-pulse-ai-autopilot-design.md`

## Global Constraints

- `OPENAI_API_KEY` is server-side only and never serialized to client responses.
- Routine model is `gpt-5.6-luna`; complex/deep analysis may route to `gpt-5.6-sol`.
- Web search is event-driven, never run for every coin.
- AI/network failure must not break `/api/coin-scan` or the dashboard.
- No order placement, leverage changes, wallet signing, withdrawals, custody, or automated trading actions.
- Stale/failed scanner evidence cannot become a strong highlight.
- Full repository `npm run verify` must pass before merge.

---

### Task 1: Deterministic event detection and bounded context

**Files:**
- Create: `lib/pulse-ai/event-detector.js`
- Create: `lib/pulse-ai/context-builder.js`
- Create: `scripts/verify-pulse-ai-core.js`

**Interfaces:**
- Produces `detectEvents(current, previous, config?) -> {material:boolean, events:[], sectorClusters:[]}`.
- Produces `buildContext(scan, detected, options?) -> compact JSON-safe object`.

- [ ] Write failing tests for unchanged suppression, PRE-SURGE transition, score jump, sector cluster, data-quality warning, bounded symbol count, and preservation of missing values.
- [ ] Run `node scripts/verify-pulse-ai-core.js` and confirm RED.
- [ ] Implement detector/context builder with deterministic thresholds and no secret-bearing fields.
- [ ] Run the core test and confirm GREEN.

### Task 2: OpenAI gateway and response normalization

**Files:**
- Create: `lib/pulse-ai/openai-gateway.js`
- Create: `scripts/verify-pulse-ai-gateway.js`

**Interfaces:**
- Produces `createOpenAIGateway({fetchImpl,apiKey,baseUrl})` with `brief({context,useWeb,deep})` and `chat({context,question,selectedSymbol,deep})`.
- Produces normalized brief shape `{status,model,usedWeb,summary,highlights,watch,dataWarnings,sources}`.

- [ ] Write failing tests proving missing key is reported as unavailable, API key is used only in request headers, malformed structured output is normalized/rejected, transient 429/5xx retries once, and source URLs are validated.
- [ ] Run gateway test and confirm RED.
- [ ] Implement direct HTTPS call to `POST https://api.openai.com/v1/responses`, Luna/Sol routing, optional `web_search` tool, bounded timeout/output, structured JSON parsing, source normalization, and one transient retry.
- [ ] Run gateway test and confirm GREEN.

### Task 3: Automatic briefing service and API contract

**Files:**
- Create: `lib/pulse-ai/briefing-service.js`
- Create: `api/pulse-ai.js`
- Create: `scripts/verify-pulse-ai-api.js`

**Interfaces:**
- `createBriefingService({scanService,gateway,now})` with `getBrief()` and `chat(input)`.
- `GET /api/pulse-ai?mode=brief`; `POST /api/pulse-ai?mode=chat`.

- [ ] Write failing tests for first brief, unchanged-scan cache reuse, missing-key deterministic fallback, scanner failure warning, strong-signal suppression on bad data, and chat validation.
- [ ] Run API test and confirm RED.
- [ ] Implement service with prior snapshot, brief cache, bounded refresh age, event-driven AI call, deterministic fallback, and safe API responses.
- [ ] Run API test and confirm GREEN.

### Task 4: Pulse AI mobile UI and shell integration

**Files:**
- Create: `ui/pulse-ai.js`
- Create: `ui/pulse-ai.css`
- Modify: `pulse-unified.html`
- Create: `scripts/verify-pulse-ai-ui.js`

**Interfaces:**
- UI fetches `/api/pulse-ai?mode=brief`, renders market summary/highlights/watch/news/data warnings/sources, and posts chat questions to `mode=chat`.

- [ ] Write failing UI contract tests for Pulse AI navigation/view, automatic refresh, AI/fallback badge, source rendering, chat drawer, safe text escaping, and absence of order/trade controls.
- [ ] Run UI test and confirm RED.
- [ ] Implement mobile-first view and chat drawer following existing unified-shell patterns.
- [ ] Run UI test and confirm GREEN.

### Task 5: Repository verification and deployment wiring

**Files:**
- Modify: `package.json`
- Modify: `netlify.toml` only if an explicit redirect is required by existing routing conventions.

**Interfaces:**
- Adds `test:pulse-ai-core`, `test:pulse-ai-gateway`, `test:pulse-ai-api`, `test:pulse-ai-ui`, and includes them in `test:radar`/`verify`.

- [ ] Add test scripts and routing entry if necessary.
- [ ] Run all Pulse AI tests.
- [ ] Run `npm run verify` and require exit code 0.
- [ ] Open PR against `main`, verify Foundation Verify success, merge, verify Netlify production deploy SHA, and smoke-test `/api/pulse-ai?mode=brief`.
- [ ] If `OPENAI_API_KEY` is not configured, confirm live endpoint returns deterministic fallback with `aiAvailable:false` rather than failing.

# PulseRadar Pro v3 Unified Renewal Design

Date: 2026-09-16
Status: Approved design direction, implementation pending
Repository: `tjdrprns2001-coder/-pulse-radar-pro-v3`

## 1. Goal

Reorganize PulseRadar Pro v3 from a collection of scattered standalone pages into one coherent product shell without breaking the existing market, chart, ICT/SMC, pattern, validation, and research logic.

The renewal must solve four current problems:

1. Important functions are hidden because many pages are only reachable by direct URLs.
2. Navigation is inconsistent between pages and between desktop/mobile.
3. Related tools are spread across multiple HTML files with versioned shells exposed to users.
4. Users must remember where a feature lives instead of following a predictable product structure.

The renewal is primarily an information architecture and navigation project. Existing analytical APIs and calculations should be reused wherever possible.

## 2. Product Principles

- Preserve working analysis logic before refactoring it.
- Make every production feature discoverable from a single global navigation system.
- Use one mental model across desktop and mobile.
- Separate user-facing production tools from research/diagnostic tools.
- Keep versioned or legacy pages accessible only through archive/developer paths, not the main navigation.
- Avoid duplicating the same analysis in multiple visible screens when one shared entry point is sufficient.
- Maintain the current research disclaimer: scores and validation metrics are analytical signals, not guaranteed future returns or automatic trading instructions.

## 3. Target Information Architecture

### 3.1 Dashboard

Primary landing page and market scanner.

Functions:
- Spot + futures symbol scanner
- Symbol search
- PRE / SURGE filtering
- Favorites
- Recently viewed symbols
- Pagination / page size
- Market summary
- Selected symbol quick preview
- Direct entry into Unified Analysis

Current source to preserve:
- `index.html`
- `/api/market`
- `/api/detail`

### 3.2 Unified Analysis (Chart Lab)

This becomes the main symbol workspace.

Primary sections/tabs:
- Overview
- Structure
- ICT / SMC
- Dante
- Momentum
- Multi-Timeframe
- Patterns
- Validation summary

Core overlays and diagnostics:
- Candlesticks
- Swing points
- BOS / CHoCH
- Trendlines
- Support / resistance
- Liquidity pools
- FVG
- Order blocks
- Displacement
- Premium / Discount
- Ichimoku cloud only
- RSI 14
- MACD 12/26/9
- Stochastic RSI
- EMA 5 / 20 / 60
- EMA 112 / 224 / 448
- Add the requested 256-period Dante-related view during implementation

Current sources to consolidate:
- `technique-lab.html`
- `analysis-workspace.html`
- `analysis-native.html`
- `analysis-stable.html`
- supporting clients such as `analysis-futures-client.js`, `trendline-visual-client.js`, `mtf-snapshot-client.js`

Rule: production navigation should expose only one analysis entry point even if legacy pages remain in the repository.

### 3.3 ICT / SMC Workspace

A focused deep-dive section available as a tab in Unified Analysis and as a top-level shortcut.

Functions:
- Liquidity sweep interpretation
- Order flow
- Balance / imbalance
- MSS / CHoCH
- CISD
- Displacement
- FVG
- Valid order-block context
- Premium / Discount
- IPDA stage
- Fractal / multi-timeframe narrative alignment

Current source:
- `ict-narrative-lab.html`
- structure/detail APIs already used by the page

The standalone page may remain for deep research, but navigation and symbol context should be shared with Unified Analysis.

### 3.4 Multi-Timeframe Workspace

Functions:
- 15m / 1h / 4h / 1d synchronized view
- Per-timeframe structure state
- Momentum state
- Snapshot cards
- Alignment / conflict summary

Current source:
- `mtf-snapshot-client.js`
- existing detail/structure handlers

### 3.5 Pattern Lab

Functions:
- Current supported pattern detection
- Pattern chart annotations
- Pattern validation / reliability summary
- Future extensibility for additional chart patterns

Currently confirmed pattern set:
- Falling wedge
- Ascending triangle
- Descending triangle
- Symmetrical triangle
- Ascending channel
- Descending channel
- Head and shoulders
- Inverse head and shoulders
- Double top
- Double bottom

Current sources:
- `pattern-falling-wedge-client.js`
- `pattern-validation-client.js`
- `/api/pattern`
- `/api/pattern-validation`
- `surge-pattern-lab.html`

The UI should not claim “all patterns” until additional detectors are actually implemented and validated.

### 3.6 Research & Validation

All research-oriented pages are grouped under one clearly labeled section instead of being scattered throughout the site.

Subsections:
- Backtest
- Pattern validation
- Structure validation
- Historical validation
- Temporal validation
- Independent validation
- Calibration Lab
- Trendline study
- Micro diagnostics / stability

Current sources include:
- `backtest.html`
- `historical-validation.html`
- `structure-validation.html`
- `temporal-validation.html`
- `independent-validation.html`
- `v311-validation.html`
- `trendline-study.html`
- `micro-diagnostics.html`
- `micro-stability.html`
- calibration documents and clients

Research tools remain available, but they must be visually separated from the normal trading-analysis workflow.

### 3.7 Coin Intel

Functions:
- Symbol information
- Market data
- Derivatives context
- News / event extension point
- Future on-chain extension point

Current sources:
- `coin-intel.html`
- `derivatives-client.js`

### 3.8 System

Developer / operational tools.

Subsections:
- Diagnostics
- Feature diagnostics
- API/data health
- Version information
- Release/readiness information

Current sources:
- `diagnostics.html`
- `feature-diagnostics.html`
- calibration readiness tooling
- `RELEASE_CHECKLIST.md`

This section should not compete visually with the primary market-analysis navigation.

## 4. Navigation Design

### 4.1 Desktop

Use a persistent left sidebar with grouped navigation.

Primary groups:
- Dashboard
- Analysis
  - Unified Analysis
  - ICT / SMC
  - Multi-TF
  - Pattern Lab
- Research
  - Backtest
  - Validation
- Intelligence
  - Coin Intel
- System
  - Diagnostics

The top bar should contain:
- Global symbol search
- Active symbol
- Active timeframe where relevant
- Data/API status indicator
- Refresh action

### 4.2 Mobile

Use the same information architecture with two layers:

Bottom navigation for high-frequency items:
- Home
- Chart
- ICT/SMC
- Patterns
- More

“More” opens the complete grouped menu containing Multi-TF, Research, Coin Intel, and System.

Requirements:
- No important feature should require horizontal scrolling to discover.
- Controls must remain reachable on narrow iPhone-class screens.
- Symbol selection and active symbol context must persist while moving between analysis sections.

## 5. Shared App Shell

Create a common UI shell used by all production pages.

Responsibilities:
- Global navigation
- Mobile drawer / bottom nav
- Active-route state
- Symbol context propagation via query string and local storage
- Active timeframe context where applicable
- Shared page title / breadcrumbs
- API status indicator
- Responsive layout

Preferred implementation direction for the existing static architecture:
- Shared CSS file for tokens/layout/components
- Shared JavaScript shell file for navigation/context behavior
- Minimal changes to analytical calculation code during the first renewal pass

This avoids converting the entire application to a framework before the navigation problem is solved.

## 6. Legacy and Archive Strategy

The repository currently contains many visible versioned pages such as `analysis-shell-v2.html` through later versions.

Rules:
- Do not delete them during the first renewal pass unless proven unused.
- Remove them from production navigation.
- Keep only canonical production entry points visible.
- Move or classify obsolete screens under `archive/` in a later cleanup after route/deployment verification.
- Maintain redirects for known public entry URLs when practical.

Canonical user-facing entries after renewal:
- `/` Dashboard
- `/analysis` or canonical analysis HTML route
- `/ict` shortcut/deep-dive route
- `/patterns`
- `/research`
- `/intel`
- `/system`

Exact Vercel rewrites will follow the repository's existing static deployment model.

## 7. API and Data Flow

Existing API router must remain compatible.

Confirmed handler categories include:
- market
- detail
- structure
- pattern
- pattern-validation
- backtest
- trendline-study
- historical-structure-study
- micro-features
- temporal-features
- calibration endpoints

Renewal rules:
- UI refactoring must not silently change scoring formulas.
- API response contracts should remain stable during the first UI pass.
- If a shared data client is introduced, it should normalize errors and caching behavior without changing analytical meaning.
- Symbol and timeframe must be encoded consistently and preserved through navigation.

## 8. Error Handling

Every production page must have explicit states for:
- Initial loading
- Empty results
- Invalid symbol
- Unsupported market
- API error
- Partial analysis when insufficient confirmed candles are available

A global data-status indicator should show whether the problem is:
- Market list loading
- Detail analysis loading
- Validation/research loading

Do not replace specific errors with a generic white/blank screen.

## 9. Visual Direction

Retain the current dark professional trading interface, but simplify hierarchy.

Design rules:
- One consistent spacing/radius/type scale
- Strong contrast between primary analysis and research-only features
- Avoid showing every overlay by default
- Use presets such as Basic / Structure / SMC / Full
- Keep chart area visually dominant
- Use cards for secondary diagnostics, not for every single label
- Use consistent status colors and terminology across pages
- Avoid duplicated navigation rows inside individual tools once the shared shell exists

## 10. Implementation Phases

### Phase 1 — Shared shell and navigation
- Add shared design tokens/styles
- Add shared desktop sidebar
- Add mobile bottom nav and drawer
- Preserve symbol context
- Make every canonical feature reachable

### Phase 2 — Canonical Dashboard
- Refactor current scanner into the shared shell
- Keep existing market/detail behavior
- Improve quick analysis entry

### Phase 3 — Unified Analysis
- Consolidate the production analysis experience
- Keep one canonical chart workspace
- Integrate existing Structure, ICT/SMC, Dante, Momentum, MTF, Pattern, and validation-summary tabs
- Add 256-period Dante-related logic/display without removing 112/224/448

### Phase 4 — Research hub
- Group validation/backtest/study pages
- Add a consistent research navigation layer
- Clearly mark experimental/research outputs

### Phase 5 — Legacy cleanup
- Verify routes and Vercel rewrites
- Archive non-canonical versioned pages
- Remove dead navigation links
- Confirm no external/canonical route is unintentionally broken

## 11. Testing and Acceptance Criteria

Desktop acceptance:
- All canonical sections reachable from persistent navigation.
- No production feature requires a direct hidden URL.
- Dashboard scanner remains functional.
- Selected symbol flows into analysis, ICT, pattern, and intel screens.
- Existing market/detail/structure/pattern APIs continue returning usable data.

Mobile acceptance:
- Bottom navigation fits on iPhone-class widths.
- Full menu is reachable through More/drawer.
- No key menu is hidden off-screen.
- Chart and controls remain usable without forced horizontal page scrolling.

Regression acceptance:
- Candlestick rendering remains intact.
- SMC/ICT overlays remain optional and do not obscure the chart by default.
- Ichimoku remains cloud-only.
- EMA 112/224/448 remains available; 256 is added rather than substituted.
- Pattern validation still exposes current reliability/calibration research data.
- Existing backtest/validation endpoints remain reachable.

Operational acceptance:
- No blank-screen failure for normal API errors.
- Vercel routes resolve canonical pages.
- Production navigation no longer exposes versioned analysis-shell pages.

## 12. Non-Goals for This Renewal

The first renewal does not include:
- Automatic order execution
- Exchange account trading permissions
- Replacing all static HTML with React/Next.js
- Rewriting validated scoring formulas solely for UI consistency
- Claiming predictive certainty from PRE/SURGE, pattern reliability, or research metrics

These can be separate projects after the unified navigation and canonical analysis experience are stable.

## 13. Success Definition

A user should be able to open PulseRadar, find a symbol, open its unified chart analysis, inspect ICT/SMC, Dante, momentum, MTF, patterns, research validation, and coin information without knowing individual page filenames or hidden URLs.

The repository may still contain specialized and legacy files internally, but the product should feel like one application rather than a collection of separate experiments.

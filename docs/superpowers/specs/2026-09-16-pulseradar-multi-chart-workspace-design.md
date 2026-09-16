# PulseRadar Multi-Chart Workspace Design

## Goal

Add a real multi-chart workspace to PulseRadar so one symbol can be analyzed across multiple independent chart instances at the same time. The first release focuses on a clean 2-chart workflow and keeps the architecture open for 1/2/4-chart layouts later.

The default mental model is:

- Shared symbol across the workspace
- Independent timeframe per chart
- Independent analysis mode per chart
- Independent render budget per chart
- Shared data/cache where safe
- No duplicated analytical calculations unless required by different TFs

Example default layout:

- Chart A: UNIUSDT · 1h · SMC
- Chart B: UNIUSDT · 4h · ICT

## Why this is a new subsystem

The current Unified Chart is a single chart instance and the existing snapshot/MTF page analyzes one chart view at a time. Multi-chart requires a workspace-level state model, multiple Lightweight Charts instances, independent plugin stacks, optional synchronization, mobile layout rules, and shared data coordination. It must therefore be implemented as a dedicated workspace layer rather than by embedding multiple iframes.

## Architecture

### Workspace shell

Create a canonical multi-chart workspace page, proposed route `/multi-chart`.

The workspace owns:

- active symbol
- layout mode: 1, 2, or 4 charts
- chart configuration objects
- shared request/cache coordinator
- optional synchronization settings
- persistence of the last used layout

Each chart instance owns:

- timeframe
- analysis mode
- plugin set
- local visual state
- expanded/maximized state
- indicator-pane visibility

The workspace must not own indicator formulas or SMC definitions. Existing engines remain authoritative.

### Chart instance model

Each chart instance receives a compact configuration object:

```text
{
  id,
  symbol,
  timeframe,
  mode,
  preset,
  syncGroup,
  expanded
}
```

The symbol normally follows workspace state. TF and mode remain independent by default.

### Reuse existing chart engine

Reuse the current Lightweight Charts chart core and existing plugin architecture rather than cloning `unified-chart.html` into iframes.

The multi-chart page creates multiple chart-core instances and attaches plugins per chart.

Benefits:

- one source of truth for rendering behavior
- one collision/declutter policy
- lower memory overhead than iframe duplication
- easier symbol/time/crosshair synchronization later
- shared request cache

## Analysis modes

### Clean

Candles and volume with minimal annotations.

### Structure

Show only market structure context:

- swing HH/HL/LH/LL
- important BOS/CHoCH
- trendlines

Hide SMC/ICT-specific zones unless explicitly enabled.

### SMC

Use a distinct SMC visual language:

- Order Block: translucent blue/cyan region
- FVG/iFVG: thin violet region
- liquidity levels: short restrained dotted lines
- EQH/EQL: compact level marker
- sweep: compact S↑/S↓ marker or clustered marker
- only the minimum BOS/CHoCH needed for context

SMC should emphasize zones and liquidity, not duplicate Structure mode.

### ICT

ICT is treated as a workflow/narrative layer rather than another dense overlay collection.

Primary visual elements:

- Premium: restrained red translucent band
- Discount: restrained teal translucent band
- OTE: violet translucent band
- sequence markers for confirmed workflow events such as:
  1. liquidity sweep
  2. MSS
  3. displacement
  4. FVG/entry context

Detailed explanation belongs in a narrative card below the chart rather than directly on the candle area.

ICT must only describe events actually produced by existing analysis data. It must not invent additional signals.

### Dante

Focus on the Dante EMA family and keep SMC/ICT annotations minimal.

### Full

Full is not "everything visible." It is a curated summary preset that selects only the highest-priority elements from Structure, SMC, ICT and Dante according to the existing render-budget and collision rules.

## Visual language

The purpose is immediate category recognition without reading every label.

- Structure: mint/teal directional annotations
- SMC: blue/cyan zones and violet imbalance regions
- ICT: red premium, teal discount, violet OTE
- Dante: blue EMA family
- bearish risk/resistance context: restrained red/pink

Exact colors must meet dark-theme contrast requirements and remain visually distinct on mobile.

Text labels remain secondary. Prefer shape, band, icon, and position first.

## Layout behavior

### Desktop/tablet

Initial implementation supports:

- 1 chart
- 2 charts side-by-side
- 4 charts in a 2x2 grid

Default is 2 charts.

Each chart header includes:

- timeframe selector
- mode selector
- maximize/restore
- duplicate chart action

A shared symbol control remains at workspace level.

### Mobile

Never force two narrow side-by-side charts.

For 2-chart mode use vertical stacking. Each chart can be expanded to a focused full-height view and restored.

For 4-chart mode, use stacked cards with focused expansion rather than four miniature charts visible simultaneously.

The bottom application navigation must remain single-instance and must not cover chart controls.

## Synchronization

### Phase 1

- symbol synchronization: ON by default
- timeframe synchronization: OFF
- mode synchronization: OFF
- crosshair synchronization: OFF
- visible time-range synchronization: OFF

### Future optional sync

Add toggles for:

- crosshair sync
- visible time-range sync
- timeframe sync

Synchronization must be event-driven and guarded against feedback loops.

## Data flow

Workspace symbol change:

1. update workspace symbol
2. notify each chart instance
3. chart instance requests its TF-specific structure/market data
4. request coordinator deduplicates identical requests
5. each chart runs the existing adapters/engines
6. each chart renders only plugins enabled by its mode

Different TFs may require separate API requests. Identical symbol+TF requests should be cached/deduplicated.

A failure in one chart must not blank the entire workspace.

## State persistence

Persist lightweight workspace configuration in localStorage:

- layout count
- chart TFs
- chart modes
- optional sync flags

Symbol continues to participate in the existing PulseRadar symbol context so scanner/unified-chart/multi-chart remain consistent.

Do not persist transient API data or stale analysis results.

## Relationship to current pages

- `unified-chart.html` remains the canonical single-chart implementation and fallback.
- Existing chart-core and plugins become reusable building blocks.
- `snapshot-analysis.html` remains available initially; useful behavior may later be migrated into the workspace.
- Multi-chart must not duplicate or fork SMC/Structure definitions.

The new workspace should be linked from the MTF navigation once stable.

## Error handling

Each chart has independent loading/error/stale states.

Examples:

- one TF API fails: only that chart shows degraded/error state
- Lightweight Charts initialization fails: show a local fallback link to the single-chart page
- unsupported/insufficient history: show the existing data-state semantics
- shared symbol remains unchanged when a child chart fails

No white-screen failure state is acceptable.

## Performance constraints

The first implementation must avoid unnecessary rendering and duplicated API traffic.

- only active chart plugins render
- mobile indicator panes remain collapsed unless opened
- identical symbol+TF requests are deduplicated
- hidden/maximized-away chart cards may reduce render frequency
- 4-chart mode uses stricter render budgets than 1/2-chart mode

Do not add WebSocket fan-out or complex worker infrastructure in this milestone unless measurements prove it necessary.

## Testing

Required automated contracts:

1. workspace creates the correct number of chart configs for 1/2/4 layouts
2. symbol changes propagate to every chart
3. timeframe changes remain chart-local by default
4. mode changes remain chart-local by default
5. identical requests can be deduplicated
6. one chart failure does not destroy sibling charts
7. SMC and ICT plugin sets are distinct
8. Full mode does not attach every available layer blindly
9. mobile 2-chart layout is vertical
10. workspace state round-trips through persistence
11. no duplicate bottom navigation/shell injection
12. existing `npm run verify` remains green

Manual smoke cases:

- UNIUSDT 1h SMC + UNIUSDT 4h ICT
- BTCUSDT 15m Structure + BTCUSDT 4h SMC
- symbol changed from workspace header updates both charts
- maximize/restore on mobile
- switch 2-chart to 1-chart and back without losing chart configs

## Delivery phases

### Phase A — Multi-chart foundation

- workspace state model
- 1/2/4 layout controller
- multiple chart-core instances
- shared symbol state
- independent TF/mode
- vertical mobile layout
- local persistence

### Phase B — Visual-language split

- dedicated SMC presentation rules
- dedicated ICT presentation rules
- curated Full mode
- compact sequence markers
- narrative placeholder/card shell

### Phase C — Synchronization polish

- optional crosshair sync
- optional visible-range sync
- duplicate-chart action
- stronger shared request cache
- layout usability polish

Phase C must not block Phase A/B production release.

## Non-goals for the first release

- exchange order entry
- automatic trading
- new predictive models
- new SMC definitions
- four simultaneous mobile mini-charts
- mandatory crosshair/time synchronization
- replacing all legacy pages immediately

## Acceptance criteria

The feature is successful when:

- a user can view the same symbol in at least two charts simultaneously
- each chart can use a different timeframe and analysis mode
- SMC and ICT are visually distinguishable at a glance
- the multi-chart workspace is usable on mobile without horizontal compression
- chart annotations remain within declutter/render budgets
- failures are isolated per chart
- existing analytical outputs remain unchanged
- CI and Vercel preview/production validation pass

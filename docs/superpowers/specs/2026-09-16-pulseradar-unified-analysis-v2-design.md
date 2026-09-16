# PulseRadar Unified Analysis v2 — Large-Scale Renewal Design

Date: 2026-09-16
Status: User-approved direction; implementation planning pending
Repository: `tjdrprns2001-coder/-pulse-radar-pro-v3`

## 1. Purpose

Evolve PulseRadar Pro v3 from a collection of capable but scattered analysis modules into a coherent, chart-first analysis platform that preserves the existing analysis engines while improving usability, maintainability, validation discipline, and mobile behavior.

The guiding principle is:

> Do not add features merely because they exist. Keep price action visually dominant and surface only the information that is relevant, validated, and useful in context.

This design combines the previously approved site-wide renewal with the Unified Analysis v2 expansion.

## 2. Program Structure

This work is intentionally split into major phases so that each part can be implemented, tested, and rolled back independently.

### Phase A — Product Shell and Declutter Foundation
- Consolidate navigation and visible entry points.
- Maintain one canonical Unified Analysis workspace.
- Remove duplicate/hidden mobile shell behavior.
- Introduce chart presets: `Clean`, `Structure`, `SMC`, `Dante`, `Full`.
- Add a rendering budget per preset.
- Keep chart area dominant and move secondary controls into drawers/panels.
- Add consistent loading, stale, partial, and insufficient-history states.

### Phase B — Unified Chart Engine Migration
- Introduce Lightweight Charts v5 for the new canonical chart workspace.
- Reuse current data and analysis APIs.
- Preserve old canvas pages during migration as fallback/legacy paths.
- Use panes for RSI, MACD, Stochastic RSI, future CVD, and other secondary indicators.
- Build an internal plugin interface for overlays and analysis modules.

Initial plugin boundaries:
- Structure Plugin
- SMC Plugin
- Dante Plugin
- Pattern Plugin
- Derivatives Plugin
- Narrative Plugin

The chart engine must allow plugins to attach/detach without rewriting the chart core.

### Phase C — Structure + SMC Core v2
- Separate Swing Structure and Internal Structure.
- Detect and display BOS, CHoCH, MSS with explicit definitions.
- Add EQH/EQL liquidity context.
- Add liquidity sweep quality filters.
- Add FVG quality and ATR-size filters.
- Add inverse FVG (iFVG).
- Add breaker block support.
- Add OB lifecycle and explicit state transitions.
- Add Premium/Discount context.
- Add OTE as an optional contextual overlay, not a mandatory signal.
- Add displacement quality scoring using ATR/body expansion/volume context.
- Add HTF source labels such as `4H OB`, `1H FVG`.
- Add optional session/killzone context later in this phase, disabled by default.

### Phase D — Confluence + Narrative
- Build a confluence engine that reports evidence categories rather than a fabricated probability.
- Separate evidence into:
  - Structure
  - Liquidity
  - Imbalance
  - Momentum
  - HTF Alignment
  - Volume / Derivatives context
- Prefer category breakdown over one headline score.
- Add Calibration-based caps so weak or unvalidated combinations cannot receive exaggerated scores.
- Build a narrative panel that explains the active sequence, for example:
  - `4H bullish structure → 1H sell-side sweep → bullish MSS → displacement → discount FVG`
- Always include an opposing/invalidating scenario.
- Attach data-state tags such as `Live`, `Confirmed`, `Partial`, `Stale`, and `Insufficient history`.

### Phase E — Derivatives Context
- Add a dedicated derivatives pane/section.
- Candidate inputs:
  - Open Interest
  - Funding Rate
  - Long/Short context where reliable
  - Buy/Sell Delta
  - CVD-style context where data quality permits
- Treat derivatives metrics as contextual evidence, not guaranteed edge.
- Add Calibration experiments for combinations such as:
  - extreme funding + HTF zone
  - CVD divergence + liquidity sweep
  - OI expansion + structural break
- Keep inconclusive combinations labeled as reference-only.

### Phase F — Pattern Engine v2 + Calibration Integration
- Keep the current validated pattern set intact during migration.
- Upgrade lifecycle:
  - Detected
  - Confirmed
  - Confirmed but Weakening
  - Invalidated
- Separate detection time from confirmation time to prevent look-ahead bias.
- Keep point-in-time evaluation and no-future-pivot rules.
- Segment reliability by:
  - timeframe
  - volatility regime
  - trend/range regime
- Connect Pattern Engine outputs to Calibration Lab metrics.

### Phase G — Volume Profile
- Implement Visible Range Volume Profile as a separate module.
- Explicitly treat this as custom implementation work, not a built-in Lightweight Charts feature.
- Compute and display:
  - volume histogram by price
  - POC
  - VAH
  - VAL
- Add optional confluence between profile levels and OB/FVG/structure zones.
- Keep this phase independent so it cannot block earlier chart migration.

### Phase H — Alerts and External Context
- Add user-defined event alerts after the core engine is stable.
- Candidate conditions:
  - BOS / CHoCH / MSS
  - liquidity sweep
  - FVG entry
  - OB mitigation / violation
  - PRE/SURGE state transition
- Add trigger modes such as `Once`, `Every occurrence`, and `Confirmed bar close`.
- Defer liquidation heatmap integrations to a later extension due to third-party API dependency, licensing, rate limits, and data-quality concerns.

## 3. SMC Definition Discipline

SMC/ICT labels must not be loose visual guesses. Each concept must have a versioned, testable definition.

Suggested definition registry:
- `OB_v1`
- `FVG_v1`
- `MSS_v1`
- `SWEEP_v1`
- `BREAKER_v1`
- `IFVG_v1`

Each definition version must be stored in analysis output and validation records so Calibration results remain traceable after rule changes.

### Example OB baseline definition
A candidate order block should require all of the following:
1. A defined opposite-direction candle or compact source zone before expansion.
2. Meaningful displacement after the zone.
3. A structure event of sufficient significance, not merely a local random break.
4. Optional contextual weighting from Premium/Discount, FVG overlap, volume, or HTF alignment.

An OB must not be considered high quality solely because a colored candle exists before a move.

### Breaker / Mitigation distinction
- Mitigation reflects price revisiting a previously valid zone.
- Breaker requires the original structural premise to fail and the prior zone to transition into an opposite-context reference after a meaningful structure change.
- Ordinary retests must not be labeled breakers.

## 4. Zone Lifecycle

Every zone should have an explicit lifecycle state.

Common states:
- Active
- Approaching
- Touched
- Mitigated
- Violated
- Inverted / Breaker candidate
- Expired

Lifecycle must be determined by code and should drive visibility, opacity, and prioritization.

Old, invalid, or low-priority zones should automatically leave the chart according to preset-specific rules.

## 5. Rendering Budget

The chart must enforce a maximum visual budget to prevent overlay accumulation.

Priority ordering:
1. Current/recent
2. Higher timeframe
3. Higher quality/reliability
4. Unmitigated/active
5. Closer to current price

Suggested initial limits:
- Clean: 0–3 zones, only critical structure labels
- Structure: up to 5 zones/events
- SMC: up to 8 high-priority zones
- Dante: Dante MAs + minimal structure context
- Full: up to 15 zones/events, including research overlays

These numbers are starting defaults and may be tuned through usability testing.

Zone lifecycle should be represented primarily with subtle tone/opacity/icon treatment rather than large text boxes.

## 6. Premium / Discount / OTE

Premium/Discount should act as a contextual filter, not a trade instruction.

Behavior:
- Bullish OB/FVG may be emphasized more strongly in Discount when structure supports it.
- Bearish OB/FVG may be emphasized more strongly in Premium when structure supports it.
- OTE is optional and should not override structure or invalidation logic.
- OTE visibility belongs in SMC/Full presets, not Clean by default.

## 7. HTF Bias Lock

HTF Bias Lock reduces lower-timeframe confidence when a setup conflicts with a strong 4H/1D structural bias.

It must not hard-disable opposite setups by default.

Recommended output:
- `Aligned`
- `Counter-trend`
- `Neutral / unclear`

The Confluence Engine should consume this as one evidence dimension rather than as a binary rule.

## 8. Displacement Quality

Displacement should be measured, not merely named.

Candidate components:
- candle body / ATR
- full range / ATR
- close location within candle
- relative volume
- follow-through
- associated structure break significance

Weak displacement should reduce zone priority and may make the originating OB/FVG hidden in conservative presets.

## 9. Confluence Engine Rules

The engine must not output a fabricated win probability.

Primary display format:
- Structure: 3/4
- Liquidity: 2/3
- Imbalance: 2/3
- Momentum: 1/2
- HTF Alignment: 1/1
- Volume/Derivatives: 1/2

A secondary normalized context score may exist, but it must be clearly labeled as context alignment, not predicted probability.

Calibration-based cap example:
- unvalidated combination → low maximum score
- mixed VALID results → medium cap
- stable positive edge across allowed regimes → higher cap

No HOLDOUT result should silently leak into ordinary tuning.

## 10. Calibration Lab Integration

Each engine consumes calibration outputs differently.

### Pattern Engine
Consumes:
- sample count
- multi-horizon edge
- MFE/MAE
- confidence bins
- regime-specific reliability
- walk-forward retention

### SMC / Confluence Engine
Consumes:
- combination frequency
- edge by sequence
- regime stability
- timeframe stability
- confidence interval

### Derivatives Engine
Consumes:
- persistence of OI/funding/CVD states
- continuation/reversal behavior by regime
- interaction with structure events

Calibration output should produce recommendation sets rather than silently rewrite engine definitions.

Recommended user presets:
- Conservative: hides low-reliability research signals
- Default: balanced production set
- Aggressive / Research: exposes broader experimental signals with clear labels

## 11. Lightweight Charts Architecture

Lightweight Charts v5 becomes the preferred renderer for the new Unified Chart.

Use it for:
- candlesticks
- volume
- multi-pane secondary indicators
- realtime updates
- synchronized crosshair
- synchronized visible range where appropriate
- plugin/primitives-based custom overlays

Important constraint:
- Volume Profile is not assumed to be built into core; it is a custom module inspired by available plugin examples.

Legacy canvas implementation stays available until parity checks pass.

## 12. Plugin Contract

Each chart plugin should define a small interface such as:
- `id`
- `version`
- `requiredData`
- `mount(chartContext)`
- `update(analysisState)`
- `setVisible(bool)`
- `dispose()`

Plugins must not directly own global symbol or timeframe state.

Shared state should be supplied by the Unified Analysis controller.

This prevents SMC, patterns, and derivatives from becoming tightly coupled to chart internals.

## 13. Multi-Timeframe Workspace

Support 15m / 1h / 4h / 1d synchronized analysis.

Targets:
- 2x2 mini chart layout
- symbol synchronization
- optional crosshair synchronization
- optional time-range synchronization
- maximize-one-panel action
- independent partial/confirmed bar state per timeframe
- structural alignment summary

Do not assume every timeframe must display every overlay.

## 14. Mobile Design

Mobile is a first-class acceptance target.

Principles:
- chart takes most of the viewport
- no duplicated navigation shell
- no floating control over critical candles
- SMC and overlay controls move into bottom sheet/drawer
- bottom nav uses only the highest-frequency destinations
- indicator panes can collapse
- safe-area insets must be respected
- no key navigation hidden by horizontal scrolling

Suggested bottom nav:
- Chart
- MTF
- Structure
- SMC
- More

## 15. Data-State Integrity

Every analysis output should carry data-state metadata.

Possible states:
- Live
- Confirmed
- Partial
- Stale
- Insufficient history
- API degraded

Rules:
- A stale value must never be shown as live.
- Partial HTF candles must be distinguishable from confirmed bars.
- When history is insufficient for 224/256/448 calculations, the UI must say so rather than inventing a state.

## 16. Dante Module

Preserve current EMA logic and add the requested 256-period component.

Required periods:
- 5 / 20 / 60
- 112 / 224 / 256 / 448

Possible diagnostics:
- alignment
- convergence
- slope
- distance from price
- compression / expansion

Dante lines should not all be visible in Clean or SMC presets.

## 17. Pattern Engine Lifecycle

Pattern states:
- Detected
- Confirmed
- Confirmed but Weakening
- Invalidated

Weakening examples:
- breakout immediately re-enters the pattern
- follow-through disappears
- structure confirmation is lost

All detection and confirmation rules must be point-in-time safe.

## 18. Workspace Presets

Saveable workspace presets:
- Clean
- Scalp
- Intraday
- Swing
- SMC
- Dante
- Research / Full

Presets store presentation preferences, not hidden trading logic.

They may store:
- visible plugins
- visible panes
- overlay limits
- layout
- preferred timeframes

## 19. Alerts

Alerts are a later phase after core structure is stable.

Potential alert events:
- BOS
- CHoCH
- MSS
- sweep
- FVG touch
- OB mitigation
- OB violation
- PRE/SURGE transition

Use explicit bar-close semantics where applicable to reduce ambiguous live-bar alerts.

## 20. Non-Goals for Initial v2 Rollout

Not required for the first production slice:
- automatic order execution
- exchange trading permissions
- liquidation heatmap
- fully custom volume profile before core chart migration is stable
- guaranteed predictive scores
- rewriting all validated analytics at once
- replacing the entire static application with a framework migration

## 21. Testing Strategy

### Unit / deterministic tests
- definition registry
- zone lifecycle transitions
- displacement scoring
- structure event classification
- rendering-budget prioritization
- confluence breakdown
- data-state handling

### Point-in-time tests
- no future pivot leakage
- no future confirmation leakage
- confirmed vs partial bar behavior
- pattern detection vs confirmation separation

### Visual regression targets
- mobile shell is not duplicated
- chart remains readable under each preset
- max zone count is enforced
- active/mitigated/invalidated zones have distinct but subtle rendering
- panes do not obscure main chart

### Integration tests
- symbol change propagates consistently
- timeframe change updates plugins
- existing API contracts remain usable
- legacy analysis fallback remains reachable during migration

### Calibration tests
- DEV/VALID/HOLDOUT separation remains intact
- HOLDOUT remains locked from tuning
- recommendation presets consume only approved calibration outputs

## 22. Rollout and Feature Flags

Each large phase should be feature-flagged or isolated behind a new canonical workspace until verified.

Suggested rollout:
1. New Unified Chart available as opt-in/internal route.
2. Compare outputs against current production analysis.
3. Verify mobile and desktop behavior.
4. Promote to default only after parity and regression checks.
5. Keep legacy route temporarily for rollback.

## 23. Program Milestones

### Milestone 1 — Foundation
- shell cleanup
- preset system
- rendering budget
- data-state model

### Milestone 2 — New Chart
- Lightweight Charts v5
- pane architecture
- plugin API
- structure/Dante parity

### Milestone 3 — SMC v2
- swing/internal structure
- MSS
- EQH/EQL
- lifecycle
- Premium/Discount + OTE
- displacement quality
- HTF bias lock

### Milestone 4 — Intelligence
- confluence breakdown
- narrative
- opposing scenario
- calibration caps

### Milestone 5 — Derivatives
- OI/funding/delta/CVD context
- validation experiments

### Milestone 6 — Pattern v2
- lifecycle
- weakening state
- regime reliability

### Milestone 7 — Advanced Visuals
- custom volume profile
- MTF 2x2 chart

### Milestone 8 — Automation and External Context
- alerts
- optional liquidation heatmap integration after API review

## 24. Success Criteria

The v2 program is successful when:
- price remains visually dominant
- no important feature is hidden behind undocumented routes
- overlays are lifecycle-managed and capped
- SMC concepts have versioned definitions
- chart modules can be attached/detached independently
- users can understand why an analysis was produced
- opposite/invalidating scenarios are visible
- data freshness and bar-confirmation state are explicit
- calibration informs context without masquerading as certainty
- mobile works without duplicated menus or obscured chart content
- existing analysis APIs and validated logic survive migration unless deliberately versioned

## 25. Implementation Order

Recommended order, from lowest migration risk to highest:
1. Product shell cleanup + mobile stability
2. Presets + Rendering Budget
3. Unified Chart engine + plugin architecture
4. Swing/Internal Structure + SMC lifecycle
5. Premium/Discount + OTE + Displacement + HTF Bias Lock
6. Confluence + Narrative
7. Derivatives
8. Pattern v2 + Calibration integration
9. Volume Profile
10. Alerts
11. Optional Liquidation Heatmap

This order preserves the existing engine while moving the user experience toward a clean, modular, validated analysis platform.
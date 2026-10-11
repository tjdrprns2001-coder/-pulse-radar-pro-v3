# Site audit — 2026-10-11

The shell routes to 35 distinct user-facing documents. The audit covers those routes, browser asset delivery, desktop/mobile startup with unavailable APIs, selected interactive flows, the existing engine/API verification suite, and all discovered Node test files. It does not establish that every possible interaction or external exchange response is error-free.

## Reproduced and corrected

| Area | Fault | Result |
| --- | --- | --- |
| LIVE RADAR | Extra brace prevented the altcoin flow script from executing | Filters, rows, sorting and details execute in Chromium |
| Legacy analysis pages | Invalid return syntax and an unclosed function | Inline scripts parse; missing-event lookup returns safely |
| Chart input | Null values became zero; RSI/Stoch warmup was plotted as zero | Missing values are omitted; invalid OHLC and times are rejected; candles are sorted and duplicate updates use the last valid row |
| Risk calculator | Nonpositive stops, invalid targets/allocations and arithmetic overflow could yield misleading size | Invalid input returns no quantity and an explicit reason; valid long/short allocations remain supported |
| HTTP delivery | Repository and server files were publicly readable | Public documents/assets and explicitly referenced browser library modules remain available; internal paths and symlinks are denied |
| HTTP input | Malformed URL produced 500; invalid JSON was passed through; request bodies were unbounded | 400/413/405 responses are explicit; API body errors return JSON |
| Shell messages | Any window could change navigation/symbol via a message | Only the current same-origin child frame is accepted |
| Health metadata | A manually pinned release could lag behind the deployed commit | Render commit metadata takes precedence over the manual fallback |
| Installation | `ws` dependency was absent from the lock file | A clean `npm ci --ignore-scripts` succeeds |

## Regression coverage

- 432 Node tests pass across `tests/`, its nested suites, and `lib/coin-scan/`.
- Existing `npm run verify` and chart checks; additional pattern evidence, Research AI v2, ignition bridge, Auto Chart Lab and transport checks.
- Syntax parsing of every UI JavaScript file and every classic inline script in the 82 root HTML documents.
- Chromium at 1440px and 375px: all 35 shell pages initialize without uncaught errors, missing local assets, or horizontal document overflow under an unavailable-API fixture.
- Positive candle fixture draws the unified chart; interactive checks cover symbol/preset propagation, trusted/untrusted frame messages, the risk calculator and RADAR mode/timeframe/sort/details.
- Existing condition-audit browser test covers expiry, missing evidence, expanded details and independent OB/FVG switches.
- Real HTTP server test confirms all menu pages and their browser assets, internal-file denial, malformed URL/JSON and a body over 2MiB.

Browser market/API fixtures are deterministic. They validate rendering and recovery, not live exchange availability or economic correctness for every market regime. Production deployment status and startup logs are checked separately. `Whole Site Audit` runs these regression checks on subsequent matching changes.

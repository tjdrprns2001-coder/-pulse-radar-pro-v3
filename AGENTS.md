# PulseRadar coding-agent guidelines

## Codebase
- This repository contains PulseRadar scanners, APIs, web interfaces and extensive existing verification scripts.
- Use the existing implementation and tests as the source of truth; no model-generated claims of deployment success.
- Keep Binance/OI/taker/funding observations separate from guessed or missing data. Closed candles only for confirmed analysis. Missing data is N/A, not zero.

## REA
- Project MCP configuration uses pinned `rea-agents@6.5.0 mcp` for trusted Codex projects, Cursor, and Claude Code.
- REA is for examining *authorized* JS application bundles, Electron apps, or native artifacts. Do not interpret its availability as market intelligence or runtime observability.
- For this project's source, first use direct code reading, `scripts/verify-*.js`, and existing test suites.
- REA evidence must identify target artifact, exact version/path, operations, limitations, and corroborating local test results.

## Review roles (logical responsibilities, not 24/7 running agents)
1. Analyst: frame issue, inspect evidence, distinguish observed from inferred.
2. Security: check permissions, config changes, credential leaks, and external execution.
3. Implementer: smallest isolated change, document before/after behavior.
4. Verifier: reproduce with independent checks, negative cases, and regression tests.
5. Reviewer: challenge at least three potential weaknesses and decide whether to block or approve.

Never silently install tools on a user's device, trade, merge, deploy, or assert 24-hour monitoring. Changes to production go through a reviewed PR and the project's release gates. See `docs/REA_INTEGRATION.md`.

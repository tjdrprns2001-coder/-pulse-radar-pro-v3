# REA development-agent integration

REA is an **opt-in** MCP reverse-engineering assistant for authorized application artifacts, not a deployed PulseRadar scanner or trading engine.

## Repository-backed MCP registrations

These files pin the **same executable** (`npx -y rea-agents@6.5.0 mcp`):

| Development agent | Project file | Requirements |
| --- | --- | --- |
| Codex CLI / IDE | `.codex/config.toml` | Trust this repository so Codex loads its project config |
| Cursor | `.cursor/mcp.json` | Open this folder as a project and approve MCP tool usage |
| Claude Code | `.mcp.json` | Open this folder and approve project MCP server when asked |

They **do not** install software on a phone, GitHub, Render, Vercel, Netlify, or any personal workstation. The agent host needs Node.js 22.19+, 24.11+, or 26+, npm, network access for first-time package download, and REA permission approval. Restart the client after its configuration changes.

For a different supported coding agent, install on its own device with reviewed interactive setup:

```bash
npx rea-agents@6.5.0 setup
npx -y rea-agents@6.5.0 doctor --json
```

Never run `setup` unattended or in CI. Do not add any API keys to the repo.

## What CI proves

`.github/workflows/rea-host-diagnostic.yml` runs on manual dispatch and on PRs changing the REA configuration/test files. It checks:

1. Config files' pinned version and command.
2. Actual MCP stdio `initialize` and `tools/list` handshake via `scripts/verify-rea-mcp.mjs`.
3. Real, offline static REA reconstruction of two **repository-owned** JavaScript files from `ui/realtime-patterns/`, with a JSON Evidence sanity check using `scripts/verify-rea-static-analysis.mjs`. This parses copied source, never executes the application or connects to an exchange.
4. CLI version/help and capabilities, plus a **non-blocking** `doctor --json` report.

CI proves MCP connectivity **and** successful, bounded static reconstruction of this selected JavaScript fixture on an ephemeral Linux GitHub runner. It does not validate every REA tool, every PulseRadar feature, or scan correctness. It **does not** prove the tool has been approved or is working in a local Codex/Cursor/Claude instance. `doctor` may report unavailable optional native providers on CI.

## PulseRadar workflow

Use REA for authorized app or JS-bundle reverse engineering, followed by a source-level PulseRadar implementation review. For ordinary PulseRadar source debugging, begin with `npm ci --ignore-scripts`, targeted `npm run test:*` and `node --check` before relying on reverse engineering evidence. Preserve missing-data semantics, market-data timestamps, closed-candle contracts, and non-trading scope. Record exact versions and test results. Never merge or deploy purely on agent recommendation.

Upstream reference: https://github.com/morluto/rea/blob/main/docs/installation.md

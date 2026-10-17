# REA developer setup

REA is an optional, developer-host MCP tool. It does not run in PulseRadar production.

Requirements: supported Node.js (22.19+, 24.11+, or 26+) and npm. On the machine hosting Codex or another supported coding agent:

```bash
npx rea-agents@6.5.0 setup
npx -y rea-agents@6.5.0 doctor --json
```

Review and explicitly approve proposed changes to agent configuration, and restart the agent afterwards. The repository alone cannot install an MCP server in a separate workstation.

For PulseRadar source files, prefer existing regression tests and code inspection. REA may supplement investigation of authorized JavaScript application bundles. Keep production secrets outside analysis artifacts and logs. Use a separate pull request for code fixes; do not auto-merge or deploy from diagnostic results.

A manual GitHub Actions diagnostic is proposed separately. It only checks CLI readiness in an ephemeral runner, not agent registration on your workstation.

Relevant checks include `npm run test:coin-scan-core` and `npm run test:pulse-ai-core`.

#!/usr/bin/env node
// Standalone, read-only MCP stdio handshake test. Requires Node.js >=22.19.
// Uses the same pinned command as the repository's Codex/Cursor/Claude Code configs.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const VERSION = '6.5.0';
const MCP_ARGS = ['-y', 'rea-agents@' + VERSION, 'mcp'];

function verifyConfigs() {
  for (const path of ['.mcp.json', '.cursor/mcp.json']) {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(config.mcpServers?.rea?.args, MCP_ARGS, path + ' REA args');
    assert.equal(config.mcpServers.rea.command, 'npx', path + ' command');
  }
  const codex = readFileSync('.codex/config.toml', 'utf8');
  assert.match(codex, /\[mcp_servers\.rea\]/);
  assert.match(codex, /command\s*=\s*"npx"/);
  assert.match(codex, /args\s*=\s*\["-y",\s*"rea-agents@6\.5\.0",\s*"mcp"\]/);
  assert.match(codex, /startup_timeout_sec\s*=\s*30/);
  console.log('Project MCP configurations match pinned REA ' + VERSION);
}

async function checkMcpHandshake() {
  const child = spawn('npx', ['--yes', 'rea-agents@' + VERSION, 'mcp'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'true' }
  });
  let pending = new Map();
  let stdoutBuffer = '';
  let stderrTail = '';
  let ended = false;

  const failAll = error => {
    ended = true;
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  };

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    stderrTail = (stderrTail + chunk).slice(-1000);
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk;
    let newline;
    while ((newline = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        failAll(new Error('MCP server emitted invalid JSON on stdout'));
        return;
      }
      const item = pending.get(response.id);
      if (!item) continue; // Valid notifications may arrive without an id.
      pending.delete(response.id);
      clearTimeout(item.timer);
      if (response.error) item.reject(new Error(JSON.stringify(response.error)));
      else item.resolve(response.result);
    }
  });
  child.on('error', err => failAll(err));
  child.on('exit', (code, signal) => {
    if (!ended && pending.size) {
      failAll(new Error('MCP exited early: ' + code + '/' + signal + ' ' + stderrTail));
    }
  });

  const request = (id, method, params = {}) => {
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Timed out awaiting MCP ' + method + ': ' + stderrTail));
      }, 90000);
      pending.set(id, { resolve, reject, timer });
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return promise;
  };

  try {
    const init = await request(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'pulse-radar-rea-smoke', version: '1.0.0' }
    });
    assert.equal(typeof init?.serverInfo?.name, 'string', 'MCP serverInfo.name');
    assert.ok(init?.capabilities, 'MCP initialize capabilities');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = await request(2, 'tools/list');
    assert.ok(Array.isArray(tools?.tools) && tools.tools.length > 0, 'MCP tools/list returned no tools');
    console.log('REA MCP handshake succeeded: ' + init.serverInfo.name + '; exposed ' + tools.tools.length + ' tools.');
  } finally {
    ended = true;
    for (const item of pending.values()) clearTimeout(item.timer);
    pending.clear();
    child.stdin.end();
    child.kill('SIGTERM');
    child.unref();
  }
}

verifyConfigs();
await checkMcpHandshake();

#!/usr/bin/env node
// Exercise actual static REA JS reconstruction on public, repo-owned files only.
// The copied source is parsed but NOT executed by this test.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const temporary = mkdtempSync(join(tmpdir(), 'pulseradar-rea-js-'));
const application = join(temporary, 'app');
const output = join(temporary, 'analysis.json');
mkdirSync(application);

try {
  const sources = ['core.js', 'app.js'];
  for (const file of sources) {
    copyFileSync(join('ui', 'realtime-patterns', file), join(application, file));
  }
  writeFileSync(join(application, 'package.json'), JSON.stringify({
    name: 'pulseradar-realtime-pattern-fixture', version: '1.0.0', private: true, main: 'core.js'
  }), 'utf8');

  const cliArgs = ['--yes', 'rea-agents@6.5.0',
    'analyze-javascript-application', application, '--json'];
  const child = spawn('npx', cliArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'true' }
  });

  const stdout = [];
  let stdoutBytes = 0, stderrTail = '';
  child.stdout.on('data', data => {
    stdoutBytes += data.length;
    if (stdoutBytes > 32 * 1024 * 1024) {
      child.kill('SIGTERM');
      return;
    }
    stdout.push(data);
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => {
    stderrTail = (stderrTail + data).slice(-3000);
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), 150000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (exitCode, signal) => {
        if (signal) reject(new Error('REA static analysis terminated: ' + signal + ' / ' + stderrTail));
        else resolve(exitCode);
      });
    });
    assert.equal(code, 0, 'REA static JS analysis CLI failed: ' + stderrTail);
  } finally {
    clearTimeout(timer);
  }
  const raw = Buffer.concat(stdout).toString('utf8');
  writeFileSync(output, raw, { mode: 0o600 });
  const result = JSON.parse(raw);
  assert.ok(result && typeof result === 'object', 'REA output is not a JSON Evidence document');
  const serialized = JSON.stringify(result);
  for (const file of sources) {
    assert.ok(serialized.includes(file), 'REA did not reference owned source ' + file);
  }
  assert.ok(/graph|modules|evidence/i.test(serialized), 'REA did not supply graph or Evidence fields');
  console.log('REA static JS analysis succeeded on both PulseRadar realtime-patterns sources.');
  console.log('REA Evidence JSON top-level keys: ' + Object.keys(result).slice(0,12).join(', '));
  console.log('REA Evidence bytes: ' + Buffer.byteLength(raw));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

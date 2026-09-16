const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const unified = fs.readFileSync('pulse-unified.html', 'utf8');
const scannerShell = fs.readFileSync('scanner-shell-v13.html', 'utf8');

test('canonical shell exposes exactly one mobile navigation container', () => {
  const matches = unified.match(/class="mobileNav"/g) || [];
  assert.equal(matches.length, 1);
});

test('scanner shell bypasses itself when embedded with shell=1', () => {
  assert.match(scannerShell, /q\.get\('shell'\)===['"]1['"]/);
  assert.match(scannerShell, /location\.replace\('\/index\.html'/);
});

test('canonical shell does not route scanner view through another product shell', () => {
  assert.doesNotMatch(unified, /scanner:\{[^}]*path:['"]\/scanner-shell-v13\.html['"]/s);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const unified = fs.readFileSync('pulse-unified.html','utf8');
const scannerShell = fs.readFileSync('scanner-shell-v13.html','utf8');
const shellJs = fs.readFileSync('ui/pulse-shell.js','utf8');

test('canonical shell exposes exactly one mobile navigation container',()=>{
  const matches=unified.match(/class="mobileNav"/g)||[]; assert.equal(matches.length,1);
});
test('scanner shell bypasses itself when embedded with shell=1',()=>{
  assert.match(scannerShell,/q\.get\('shell'\)===['"]1['"]/); assert.match(scannerShell,/location\.replace\('\/index\.html'/);
});
test('canonical shell does not route scanner view through another product shell',()=>{
  assert.doesNotMatch(unified,/scanner:\{[^}]*path:['"]\/scanner-shell-v13\.html['"]/s);
  assert.match(shellJs,/scanner:\{[^}]*path:['"]\/index\.html['"]/s);
});
test('canonical shell loads shared foundation assets',()=>{
  assert.match(unified,/ui\/pulse-shell\.css/); assert.match(unified,/ui\/pulse-shell\.js/); assert.match(unified,/ui\/pulse-presets\.js/); assert.match(unified,/ui\/pulse-data-state\.js/);
});
test('mobile core labels appear once each',()=>{
  const mobile = unified.match(/<nav class="mobileNav"[\s\S]*?<\/nav>/)?.[0] || '';
  for(const label of ['홈','스캔','분석','단테','AI']) assert.equal((mobile.match(new RegExp('>'+label+'<','g'))||[]).length,1,label);
});
test('shell propagates preset and symbol to child routes',()=>{
  assert.match(shellJs,/searchParams\.set\('symbol',s\)/);
  assert.match(shellJs,/searchParams\.set\('preset',p\)/);
  assert.match(shellJs,/pulse:preset-applied/);
});
test('shell surfaces explicit data-state metadata',()=>{
  assert.match(unified,/data-pulse-data-state="live"/);
  assert.match(shellJs,/dataset\.pulseDataState/);
  assert.match(shellJs,/api-degraded/);
});

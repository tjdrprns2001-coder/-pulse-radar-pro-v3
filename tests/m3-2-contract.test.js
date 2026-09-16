const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('unified-chart.html','utf8');
const core=fs.readFileSync('ui/chart/chart-core.js','utf8');
const shell=fs.readFileSync('ui/pulse-shell.js','utf8');

test('indicator series hide last-value badges to prevent y-axis collisions',()=>{
  const matches=core.match(/lastValueVisible:false/g)||[];
  assert.ok(matches.length>=6,'expected all indicator series to disable lastValueVisible');
});

test('mobile Full starts with indicator panes collapsed',()=>{
  assert.match(html,/function paneDefaults\(preset\).*innerWidth.*full.*\[\]/s);
});

test('SMC zone chip distinguishes rendered and detected counts',()=>{
  assert.match(html,/표시/);
  assert.match(html,/감지/);
});

test('child chart emits symbol sync and shell consumes it',()=>{
  assert.match(html,/pulse-symbol-sync/);
  assert.match(shell,/pulse-symbol-sync/);
});

test('mobile analysis title is shortened',()=>{
  assert.match(shell,/analysis:\{title:'분석'/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('snapshot-analysis.html','utf8');
const js=fs.existsSync('ui/snapshot/snapshot-analysis.js')?fs.readFileSync('ui/snapshot/snapshot-analysis.js','utf8'):'';

test('snapshot page exposes all four supported timeframe controls',()=>{
  for(const tf of ['15m','1h','4h','1d']) assert.match(html,new RegExp(`data-tf=["']${tf}["']`));
});

test('orchestrator uses selected tf for primary analysis',()=>{
  assert.match(js,/runSnapshotAnalysis/);
  assert.match(js,/state\.tf|selectedTf/);
  assert.doesNotMatch(js,/primaryTf\s*=\s*['"]4h['"]/);
});

test('page contains dedicated narrative flow and failure-state containers',()=>{
  for(const id of ['snapshotNarrative','snapshotFlow','snapshotScenario','snapshotContext','snapshotStatus']) assert.match(html,new RegExp(`id=["']${id}["']`));
});

test('mobile CSS prevents horizontal overflow',()=>{
  assert.match(html,/@media\s*\(max-width:\s*650px\)/);
  assert.match(html,/overflow-wrap|word-break|min-width:\s*0/);
});

test('pattern context is composed in the primary request without duplicate fetch helper',()=>{
  assert.match(js,/renderNarrative\(\{[^}]*patternSet/s);
  assert.doesNotMatch(html,/pattern-context\.js/);
});

test('restored chart snapshot is cloned separately and adds weekly timeframe',()=>{
  assert.equal(fs.existsSync('snapshot-analysis-restored.html'),true);
  assert.equal(fs.existsSync('ui/snapshot/snapshot-weekly.js'),true);
  const restored=fs.readFileSync('snapshot-analysis-restored.html','utf8');
  const weekly=fs.readFileSync('ui/snapshot/snapshot-weekly.js','utf8');
  assert.match(restored,/PulseRadar Pro · 차트 스냅샷 분석/);
  for(const tf of ['15m','1h','4h','1d','1w']) assert.match(restored,new RegExp(`data-tf=["']${tf}["']`));
  assert.match(restored,/snapshot-weekly\.js/);
  assert.match(weekly,/state\.tf\s*=\s*['"]1w['"]/);
  assert.match(weekly,/runSnapshotAnalysis/);
});

test('V5 shell exposes pro 8TF snapshot and preserves legacy restored snapshot',()=>{
  const shell=fs.readFileSync('pulse-unified.html','utf8');
  const shellJs=fs.readFileSync('ui/pulse-shell.js','utf8');
  assert.doesNotMatch(shell,/pulse-shell-snapshot-restore\.js/);
  assert.match(shell,/data-view="mtfsnapshot"/);
  assert.match(shell,/8TF 스냅샷/);
  assert.match(shellJs,/mtfsnapshot:\{title:'8TF 스냅샷'/);
  assert.match(shellJs,/mtf-snapshot-pro\.html/);
  assert.match(shell,/data-view="chartsnapshot"/);
  assert.match(shellJs,/snapshot-analysis-restored\.html/);
});

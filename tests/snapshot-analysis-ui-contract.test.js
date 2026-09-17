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

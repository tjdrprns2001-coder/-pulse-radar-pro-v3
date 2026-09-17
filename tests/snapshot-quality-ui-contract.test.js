const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const quality=fs.readFileSync(path.join(__dirname,'../ui/snapshot/snapshot-quality.js'),'utf8');
const snapshot=fs.readFileSync(path.join(__dirname,'../ui/snapshot/snapshot-analysis.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../snapshot-analysis-restored.html'),'utf8');
const researchActions=fs.readFileSync(path.join(__dirname,'../ui/signal-quality/research-actions.js'),'utf8');
const shellCss=fs.readFileSync(path.join(__dirname,'../ui/pulse-shell.css'),'utf8');

test('calibration pending state hides raw numeric score',()=>{
  assert.match(quality,/확률 표시 보류 · raw 숨김/);
  assert.doesNotMatch(quality,/확률 표시 보류 · pattern \$\{/);
});

test('regime experimental notice is not repeated inside every card',()=>{
  assert.match(quality,/Liquidity \$\{reg\.liquidity\}/);
  assert.doesNotMatch(quality,/Liquidity \$\{reg\.liquidity\} · experimental/);
});

test('state card exposes evidence breakdown',()=>{
  assert.match(quality,/<details[^>]*class=\\?"evidenceDetails/);
  assert.match(quality,/구조 방향/);
  assert.match(quality,/Flow 데이터/);
  assert.match(quality,/패턴 점수/);
});

test('snapshot chart deduplicates and caps annotation labels',()=>{
  assert.match(snapshot,/function visibleAnnotations\(/);
  assert.match(snapshot,/innerWidth<=650\?5:8/);
  assert.match(snapshot,/visibleAnnotations\(model\.annotations/);
});

test('quality layer resolves 50 bar outcomes and loads clock/drift modules',()=>{
  assert.match(quality,/O\.HORIZONS\|\|\[5,10,20,50\]/);
  assert.match(html,/clock-integrity\.js/);
  assert.match(html,/drift-monitor\.js/);
});

test('data card exposes provenance and clock ordering diagnostics',()=>{
  assert.match(quality,/qProvenance/);
  assert.match(quality,/qClock/);
  assert.match(quality,/out-of-order/);
  assert.match(quality,/fallback/);
});

test('calibration card exposes interval status and drift diagnostics',()=>{
  assert.match(quality,/CI90/);
  assert.match(quality,/qDrift/);
  assert.match(quality,/adequate|weak|insufficient/);
});

test('snapshot records regime venue flow features and provenance',()=>{
  assert.match(quality,/regime:/);
  assert.match(quality,/venue:'cex'/);
  assert.match(quality,/features,dataSource/);
  assert.match(quality,/provenance:D\.provenance/);
});

test('mobile research actions stay in document flow instead of covering shell bottom nav',()=>{
  assert.match(researchActions,/@media\(max-width:650px\)\{\.pulseResearchActions\{position:static/);
  assert.doesNotMatch(researchActions,/@media\(max-width:650px\)[\s\S]*?\.pulseResearchActions\{position:fixed/);
  assert.match(shellCss,/\.main\{padding-bottom:calc\(64px \+ env\(safe-area-inset-bottom\)\)\}/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const quality=fs.readFileSync(path.join(__dirname,'../ui/snapshot/snapshot-quality.js'),'utf8');
const snapshot=fs.readFileSync(path.join(__dirname,'../ui/snapshot/snapshot-analysis.js'),'utf8');

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

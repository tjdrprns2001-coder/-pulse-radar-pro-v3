const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const modulePath=path.join(__dirname,'../ui/snapshot/signal-interpretation-ko.js');
const html=fs.readFileSync(path.join(__dirname,'../snapshot-analysis-restored.html'),'utf8');

test('korean interpretation module exists and is loaded',()=>{
  assert.ok(fs.existsSync(modulePath),'signal-interpretation-ko.js must exist');
  assert.match(html,/signal-interpretation-ko\.js/);
});

test('stale or non-live data forces signal hold',()=>{
  const src=fs.readFileSync(modulePath,'utf8');
  assert.match(src,/DATA_STALE/);
  assert.match(src,/판정 보류/);
  assert.match(src,/STALE|FAILED|RECONNECTING|BACKFILL|VERIFYING/);
  assert.match(src,/WATCH/);
});

test('beginner summary separates structure momentum flow presurge and data',()=>{
  const src=fs.readFileSync(modulePath,'utf8');
  for(const label of ['구조','모멘텀','체결 흐름','급등 전조','데이터 상태','쉬운 요약']) assert.match(src,new RegExp(label));
  assert.match(src,/매수\/매도 비율/);
  assert.match(src,/매도 우위|매수 우위|균형/);
});

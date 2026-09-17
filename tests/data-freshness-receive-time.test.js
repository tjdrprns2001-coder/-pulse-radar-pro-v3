const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const D=require('../lib/signal-quality/data-integrity.js');
const quality=fs.readFileSync(path.join(__dirname,'../ui/snapshot/snapshot-quality.js'),'utf8');

test('fresh REST receive time wins over old candle event time',()=>{
  const now=1_000_000;
  const state=D.deriveFeedState({
    nowMs:now,
    lastReceiveMs:now-800,
    lastEventMs:now-3_600_000,
    staleAfterMs:60_000
  });
  assert.equal(state,'live');
});

test('snapshot quality shows receive freshness separately from candle age',()=>{
  assert.match(quality,/수신/);
  assert.match(quality,/캔들 기준시각/);
  assert.match(quality,/eventAgeMs/);
});

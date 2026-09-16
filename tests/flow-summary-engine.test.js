const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeFlow}=require('../lib/analysis/flow-summary-engine.js');

test('keeps available flow values when CVD is unavailable',()=>{
  const out=summarizeFlow({oi:15000000,oi24h:9.1,funding:-0.0016,takerRatio:0.82,cvdBias:null});
  assert.equal(out.available,true);
  assert.match(out.text,/OI/);
  assert.match(out.text,/funding/);
  assert.match(out.text,/taker/);
  assert.doesNotMatch(out.text,/CVD/);
});

test('returns unavailable when all supported values are absent',()=>{
  const out=summarizeFlow({});
  assert.equal(out.available,false);
  assert.equal(out.text,'Flow 데이터 없음');
});

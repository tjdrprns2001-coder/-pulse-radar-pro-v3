'use strict';
const assert=require('assert');
const C=require('../ui/dante/dante-contract.js');

assert.equal(C.VERSION,'DANTE_RULESET_v1');
assert.equal(C.MODE,'SHADOW_ONLY');
assert(C.RICE_STATES.includes('PHASE_3_CONFIRMED'));
assert(C.RICE_STATES.includes('FAILED_BREAKOUT'));
assert(C.RICE_STATES.includes('RESET'));

{
  const p=C.normalizeParams({ema:{fast:5,pivot:10,long:20},emaSeed:{method:'SMA_FIXED',seedBars:8}});
  assert.equal(p.ema.fast,5);assert.equal(p.ema.pivot,10);assert.equal(p.ema.long,20);
  assert(Object.isFrozen(p));
  assert.throws(()=>C.normalizeParams({ema:{fast:20,pivot:10,long:5}}),/ascending/i);
}
{
  const h1=C.paramsHash(C.normalizeParams({ema:{fast:5,pivot:10,long:20},emaSeed:{method:'SMA_FIXED',seedBars:8}}));
  const h2=C.paramsHash(C.normalizeParams({ema:{fast:5,pivot:10,long:20},emaSeed:{method:'SMA_FIXED',seedBars:8}}));
  const h3=C.paramsHash(C.normalizeParams({ema:{fast:6,pivot:10,long:20},emaSeed:{method:'SMA_FIXED',seedBars:8}}));
  assert.equal(h1,h2);assert.notEqual(h1,h3);
}
{
  const asOf=10000;
  assert.equal(C.assertClosedCandles([{time:9000,close:1,high:1,low:1,partial:false}],asOf),true);
  assert.throws(()=>C.assertClosedCandles([{time:9000,close:1,high:1,low:1,partial:true}],asOf),/CLOSED_ONLY/i);
  assert.throws(()=>C.assertClosedCandles([{time:10001,close:1,high:1,low:1,partial:false}],asOf),/after analysisAsOf/i);
}
{
  const r=C.createEvidence({analysisAsOf:1000,riceBowlState:'PHASE_2_ACCUMULATION',params:{ema:{fast:5,pivot:10,long:20},emaSeed:{method:'SMA_FIXED',seedBars:8}}});
  assert.equal(r.mode,'SHADOW_ONLY');
  assert.equal(r.rankingContribution,0);
  assert.equal(r.scannerStageContribution,0);
  assert.equal(r.bookEvidenceContribution,0);
  assert.equal(C.assertShadowOnly(r),true);
  assert.throws(()=>C.assertShadowOnly({...r,rankingContribution:1}),/must be 0/i);
}
{
  const g=C.normalizeGongguriParams({minPriorTouches:2});
  assert.equal(g.minPriorTouches,2);
  assert.throws(()=>C.normalizeGongguriParams({minPriorTouches:1}),/>= 2/i);
}
{
  const x=C.seededEma([1,2,3,4,5,6,7,8,9],5,8);
  assert.equal(x.slice(0,7).every(v=>v===null),true);
  assert.equal(x[7],4.5,'EMA seed must be SMA of fixed seed window');
  assert(Number.isFinite(x[8]));
  assert.equal(C.DEFAULT_PARAMS.emaSeed.seedBars,224);
}
console.log('dante contract PASS');
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditOiSeries}=require('./oi-series-integrity.js');
const step=900000,now=Date.UTC(2026,9,16,9,0,0);
function series(n=97,period=step){
  return Array.from({length:n},(_,i)=>({timestamp:now-(n-i)*period,sumOpenInterest:String(i===n-1?103:100)}));
}
test('15-minute OI verifies exact 1H, 4H and 24H time coverage',()=>{
  const x=auditOiSeries(series(),{asOf:now,periodMs:step});
  assert.equal(x.status,'OBSERVED');
  assert.equal(x.contiguousSamples,97);
  assert.equal(x.ageMs,step);
  assert(Math.abs(x.deltas[4]-3)<1e-9);
  assert(Math.abs(x.deltas[16]-3)<1e-9);
  assert(Math.abs(x.deltas[96]-3)<1e-9);
});
test('missing old bar rejects 24H without fabricating horizon; short valid tail can still be observed',()=>{
  const a=series(),gap=a.slice(0,55).concat(a.slice(56));
  const x=auditOiSeries(gap,{asOf:now,periodMs:step});
  assert.equal(x.status,'OBSERVED');
  assert.equal(x.deltas[96],null);
  assert.equal(x.deltas[48],null);
  assert(Number.isFinite(x.deltas[16]));
});
test('missing recent bar blocks recent OI leadership instead of compressing 4H to 3H45m',()=>{
  const a=series(),broken=a.filter((_,i)=>i!==95);
  const x=auditOiSeries(broken,{asOf:now,periodMs:step});
  assert.equal(x.available,false);
  assert.equal(x.status,'GAP');
});
test('stale, future, missing time and duplicate observations are never valid',()=>{
  assert.equal(auditOiSeries(series(),{asOf:now+3*3600000,periodMs:step}).status,'STALE');
  assert.equal(auditOiSeries(series(),{asOf:now-2*3600000,periodMs:step}).status,'FUTURE');
  const untimed=series();delete untimed[5].timestamp;
  assert.equal(auditOiSeries(untimed,{asOf:now,periodMs:step}).status,'INVALID_SOURCE');
  assert.equal(auditOiSeries([...series(),series().at(-1)],{asOf:now,periodMs:step}).status,'DUPLICATE_OR_OVERLAP');
  const noOi=series();noOi[90].sumOpenInterest=null;
  assert.equal(auditOiSeries(noOi,{asOf:now,periodMs:step}).status,'INVALID_SOURCE');
});
test('hourly fallback series uses hourly samples only',()=>{
  const a=series(25,3600000),x=auditOiSeries(a,{asOf:now,periodMs:3600000,maxAgeMs:9000000});
  assert.equal(x.status,'OBSERVED');
  assert.equal(x.contiguousSamples,25);
  assert(Math.abs(x.deltas[4]-3)<1e-9);
  assert(Math.abs(x.deltas[24]-3)<1e-9);
});

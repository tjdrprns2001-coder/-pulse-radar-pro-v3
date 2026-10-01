'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Short=require('./amd-short-entry.js');

const M15=15*60*1000,M5=5*60*1000,H4=4*60*60*1000,D1=24*60*60*1000;
function k(ts,o,h,l,c,ms=M15){return[ts,o,h,l,c,100,ts+ms-1,10000,10,50,5000]}
function ts(s){return Date.parse(s)}
function longLikeFrames(){
  const m15=[],asiaStart=ts('2026-09-30T23:00:00Z');
  for(let i=0;i<20;i++){
    const t=asiaStart+i*M15,early=i<16,h=early?(i===5?105:101.2):100.8;
    m15.push(k(t,100.4,h,100,100.35));
  }
  m15.push(k(ts('2026-10-01T06:00:00Z'),100.2,100.2,99.4,99.7));
  m15.push(k(ts('2026-10-01T06:15:00Z'),99.7,100.5,99.5,100.3));
  m15.push(k(ts('2026-10-01T06:30:00Z'),100.3,101.2,100.4,101.1));
  m15.push(k(ts('2026-10-01T06:45:00Z'),101.1,101.15,100.25,100.5));
  m15.push(k(ts('2026-10-01T07:00:00Z'),100.5,104.5,100.45,101.3));
  const m5=[];
  for(let i=0;i<36;i++){const t=ts('2026-10-01T03:00:00Z')+i*M5;m5.push(k(t,100.35,100.7,100.1,100.35,M5))}
  m5.push(k(ts('2026-10-01T06:00:00Z'),100.2,100.2,99.4,99.7,M5));
  m5.push(k(ts('2026-10-01T06:05:00Z'),99.7,99.9,99.45,99.8,M5));
  m5.push(k(ts('2026-10-01T06:10:00Z'),99.8,100.0,99.6,99.9,M5));
  m5.push(k(ts('2026-10-01T06:15:00Z'),99.9,100.35,99.8,100.3,M5));
  m5.push(k(ts('2026-10-01T06:20:00Z'),100.3,100.35,100.15,100.3,M5));
  m5.push(k(ts('2026-10-01T06:25:00Z'),100.3,100.6,100.25,100.5,M5));
  m5.push(k(ts('2026-10-01T06:30:00Z'),100.5,101.2,100.4,101.1,M5));
  m5.push(k(ts('2026-10-01T06:35:00Z'),101.1,101.12,100.35,100.45,M5));
  m5.push(k(ts('2026-10-01T06:40:00Z'),100.45,100.8,100.4,100.7,M5));
  m5.push(k(ts('2026-10-01T06:45:00Z'),100.7,100.8,100.25,100.5,M5));
  m5.push(k(ts('2026-10-01T06:50:00Z'),100.5,101.4,100.45,101.3,M5));
  const h4=[];
  for(let i=0;i<30;i++){const t=ts('2026-09-26T00:00:00Z')+i*H4,base=98+i*.15;h4.push(k(t,base,base+2,base-1,base+1,H4))}
  h4.push(k(ts('2026-10-01T08:00:00Z'),103,110,102,106,H4));
  const d1=[k(ts('2026-09-29T00:00:00Z'),96,106,94,100,D1),k(ts('2026-09-30T00:00:00Z'),100,108,98,104,D1)];
  m15.find(x=>x[0]===ts('2026-10-01T06:30:00Z'))[5]=250;
  const h1=Array.from({length:30},(_,i)=>k(ts('2026-09-30T00:00:00Z')+i*3600000,98+i*.05,99+i*.05,97+i*.05,98.8+i*.05,3600000));
  return{'15m':m15,'5m':m5,'4h':h4,'1h':h1,'1d':d1};
}
function mirrorRow(x,p=200){
  const y=[...x];y[1]=p-x[1];y[2]=p-x[3];y[3]=p-x[2];y[4]=p-x[4];return y;
}
function readyFrames(){
  const f=longLikeFrames(),out={};
  for(const [tf,rows] of Object.entries(f))out[tf]=rows.map(x=>mirrorRow(x));
  return out;
}
test('mirrored AMD sequence produces SHORT_READY only after buy-side sweep and bearish confirmation',()=>{
  const out=Short.evaluate({context:{economicEventClear:true,orderRiskConfirmed:true,oiFundingClear:true},frames:readyFrames(),asOf:ts('2026-10-01T08:30:00Z'),lastPrice:98.7,minRr:1.5});
  assert.equal(out.status,'SHORT_READY');
  assert.equal(out.sweep.session,'LONDON');
  assert.equal(out.mss.confirmed,true);
  assert.ok(['15m','5m'].includes(out.mss.tf));
  assert.equal(out.zone.kind,'BEARISH_FVG');
  assert.ok(out.retestAt);
  assert.ok(out.rebreakAt);
  assert.ok(out.entry<out.stop);
  assert.ok(out.selectedTarget);
  assert.ok(out.riskReward>=1.5);
});
test('no Asia high sweep never promotes a short',()=>{
  const frames=readyFrames();
  frames['15m']=frames['15m'].map(x=>x[0]>=ts('2026-10-01T06:00:00Z')?[x[0],99.5,99.95,99,99.4,x[5],x[6],x[7],x[8],x[9],x[10]]:x);
  const out=Short.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:99});
  assert.equal(out.status,'WAIT_SWEEP');
});
test('unknown external reviews keep a complete short setup observation-only',()=>{
  const out=Short.evaluate({frames:readyFrames(),asOf:ts('2026-10-01T08:30:00Z'),lastPrice:98.7});
  assert.equal(out.status,'BLOCKED_REVIEW');assert.equal(out.entry,undefined);
});
test('New York kill zone matches the supplied KST timing in summer and winter',()=>{
  assert.equal(Short.sessionOf(ts('2026-07-01T11:30:00Z')),'NEW_YORK');
  assert.equal(Short.sessionOf(ts('2026-12-02T14:30:00Z')),'NEW_YORK');
  assert.equal(Short.sessionOf(ts('2026-12-02T15:30:00Z')),'OTHER');
});

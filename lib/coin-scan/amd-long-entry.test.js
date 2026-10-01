'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Long=require('./amd-long-entry.js');

const M15=15*60*1000,M5=5*60*1000,H4=4*60*60*1000,D1=24*60*60*1000;
function k(ts,o,h,l,c,ms=M15){return[ts,o,h,l,c,100,ts+ms-1,10000,10,50,5000]}
function ts(s){return Date.parse(s)}
function readyFrames(){
  const m15=[];
  const asiaStart=ts('2026-09-30T23:00:00Z');
  for(let i=0;i<20;i++){
    const t=asiaStart+i*M15;
    const early=i<16;
    const h=early?(i===5?105:101.2):100.8;
    m15.push(k(t,100.4,h,100,100.35));
  }
  m15.push(k(ts('2026-10-01T06:00:00Z'),100.2,100.2,99.4,99.7));
  m15.push(k(ts('2026-10-01T06:15:00Z'),99.7,100.5,99.5,100.3));
  m15.push(k(ts('2026-10-01T06:30:00Z'),100.3,101.2,100.4,101.1));
  m15.push(k(ts('2026-10-01T06:45:00Z'),101.1,101.15,100.25,100.5));
  m15.push(k(ts('2026-10-01T07:00:00Z'),100.5,104.5,100.45,101.3));

  const m5=[];
  for(let i=0;i<36;i++){
    const t=ts('2026-10-01T03:00:00Z')+i*M5;
    m5.push(k(t,100.35,100.7,100.1,100.35,M5));
  }
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
  for(let i=0;i<30;i++){
    const t=ts('2026-09-26T00:00:00Z')+i*H4;
    const base=98+i*.15;
    h4.push(k(t,base,base+2,base-1,base+1,H4));
  }
  h4.push(k(ts('2026-10-01T08:00:00Z'),103,110,102,106,H4));

  const d1=[
    k(ts('2026-09-29T00:00:00Z'),96,106,94,100,D1),
    k(ts('2026-09-30T00:00:00Z'),100,108,98,104,D1)
  ];
  m15.find(x=>x[0]===ts('2026-10-01T06:30:00Z'))[5]=250;
  const h1=Array.from({length:30},(_,i)=>k(ts('2026-09-30T00:00:00Z')+i*3600000,98+i*.05,99+i*.05,97+i*.05,98.8+i*.05,3600000));
  return{'15m':m15,'5m':m5,'4h':h4,'1h':h1,'1d':d1};
}

test('AMD sequence produces LONG_READY only after sweep, reclaim, MSS, retest and rebreak',()=>{
  const out=Long.evaluate({context:{economicEventClear:true,orderRiskConfirmed:true,oiFundingClear:true},frames:readyFrames(),asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.3,minRr:1.5});
  assert.equal(out.status,'LONG_READY');
  assert.equal(out.sweep.session,'LONDON');
  assert.equal(out.mss.confirmed,true);
  assert.ok(['15m','5m'].includes(out.mss.tf));
  assert.equal(out.zone.kind,'BULLISH_FVG');
  assert.ok(out.retestAt);
  assert.ok(out.rebreakAt);
  assert.ok(out.entry>out.stop);
  assert.ok(out.selectedTarget);
  assert.ok(out.riskReward>=1.5);
});

test('no Asia low sweep never promotes a long',()=>{
  const frames=readyFrames();
  frames['15m']=frames['15m'].map(x=>x[0]>=ts('2026-10-01T06:00:00Z')?[x[0],100.5,101,100.05,100.6,x[5],x[6],x[7],x[8],x[9],x[10]]:x);
  const out=Long.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101});
  assert.equal(out.status,'WAIT_SWEEP');
});

test('closing back below the sweep low invalidates the long',()=>{
  const frames=readyFrames();
  frames['15m'].splice(22,0,k(ts('2026-10-01T06:25:00Z'),100.1,100.2,99.1,99.2));
  frames['15m'].sort((a,b)=>a[0]-b[0]);
  const out=Long.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:100});
  assert.equal(out.status,'INVALID');
  assert.equal(out.sweep.low,99.4);
  assert.equal(out.invalidation,out.sweep.low);
  assert.equal(out.invalidationClose,99.2);
  assert.equal(out.invalidatedBarAt,ts('2026-10-01T06:25:00Z'));
  assert.equal(out.invalidatedAt,ts('2026-10-01T06:25:00Z')+M15-1);
});


test('RR-blocked plans publish required and nearest real targets without an actionable entry',()=>{
  const frames=readyFrames();
  frames['15m']=frames['15m'].map(x=>{const row=[...x];if(row[0]>=ts('2026-10-01T06:00:00Z'))row[2]=Math.min(row[2],101.6);return row});
  frames['4h']=frames['4h'].map(x=>k(x[0],100.8,101.6,100.2,101.1,H4));
  frames['1d']=frames['1d'].map(x=>k(x[0],100.5,101.5,99.9,101,D1));
  const out=Long.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.3,minRr:1.5});
  assert.equal(out.status,'NO_LONG_RR');
  assert.equal(out.entry,undefined);
  assert.ok(out.retestAt&&out.rebreakAt);
  assert.equal(out.selectedTarget,null);
  assert.ok(out.nearestTarget);
  assert.equal(out.nearestTarget.price,out.targets[0].price);
  assert.ok(out.nearestTarget.rr<1.5);
  assert.equal(out.risk,out.plannedEntry-out.stop);
  assert.equal(out.requiredTarget,out.plannedEntry+1.5*(out.plannedEntry-out.stop));
  assert.ok(out.requiredTarget>out.nearestTarget.price);
});

test('an unclosed invalidation candle does not publish a future invalidation',()=>{
  const frames=readyFrames(),asOf=ts('2026-10-01T08:30:00Z');
  frames['15m'].push(k(asOf,100,100.2,98,98.5));
  const out=Long.evaluate({frames,asOf,lastPrice:101.3,context:{economicEventClear:true,orderRiskConfirmed:true,oiFundingClear:true}});
  assert.equal(out.status,'LONG_READY');
  assert.equal(out.invalidationClose,undefined);
  assert.equal(out.invalidatedAt,undefined);
  assert.equal(out.requiredTarget,out.plannedEntry+1.5*(out.plannedEntry-out.stop));
});

test('KST Asia stays fixed across DST and old cycles never produce current signals',()=>{
  assert.equal(Long.sessionOf(ts('2026-12-01T23:00:00Z')),'ASIA');
  assert.equal(Long.tradeDate(ts('2026-12-01T23:00:00Z')),'2026-12-02');
  assert.equal(Long.evaluate({frames:readyFrames(),asOf:ts('2026-10-02T08:30:00Z')}).status,'NO_ASIA_RANGE');
});
test('structure readiness cannot silently approve unknown external reviews',()=>{
  const out=Long.evaluate({frames:readyFrames(),asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.3});
  assert.equal(out.status,'BLOCKED_REVIEW');assert.equal(out.entry,undefined);
  assert.equal(out.review.economicEvent,'UNKNOWN');
});
test('missing 1H and bearish 4H block otherwise complete structure',()=>{
  const options={asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.3,context:{economicEventClear:true,orderRiskConfirmed:true,oiFundingClear:true}};
  const a=readyFrames();delete a['1h'];
  assert.equal(Long.evaluate({...options,frames:a}).status,'BLOCKED_HTF');
  const b=readyFrames();b['4h']=b['4h'].map((x,i)=>k(x[0],120-i,121-i,119-i,120-i,H4));
  assert.equal(Long.evaluate({...options,frames:b}).status,'BLOCKED_HTF');
});
test('a closed FVG penetration invalidates the setup before any rebreak',()=>{
  const frames=readyFrames();frames['5m'].find(x=>x[0]===ts('2026-10-01T06:45:00Z'))[3]=100;
  const out=Long.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z')});
  assert.equal(out.status,'INVALID');assert.equal(out.invalidationKind,'ZONE_LOW_WICK');
});
test('higher targets cannot rescue insufficient RR to nearest liquidity',()=>{
  const frames=readyFrames();frames['1d'][1][2]=101.5;
  const out=Long.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.3});
  assert.equal(out.status,'NO_LONG_RR');assert.equal(out.selectedTarget,null);
  assert.ok(out.targets.some(x=>x.rr>=1.5));
});
test('breakout is separate and needs a volume-backed breakout plus retest',()=>{
  const out=Long.evaluate({frames:readyFrames(),asOf:ts('2026-10-01T08:30:00Z')});
  assert.equal(out.breakout.model,'BREAKOUT_RETEST');assert.equal(out.breakout.status,'WAIT_BREAKOUT');
});

test('volume and current stop guards remain mandatory despite completed structure',()=>{
  const f=readyFrames();f['15m'].forEach(x=>x[5]=100);
  const c={economicEventClear:true,orderRiskConfirmed:true,oiFundingClear:true};
  assert.equal(Long.evaluate({frames:f,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.3,context:c}).status,'BLOCKED_CONFIRMATION');
  assert.equal(Long.evaluate({frames:readyFrames(),asOf:ts('2026-10-01T08:30:00Z'),lastPrice:98,context:c}).status,'BLOCKED_PRICE');
});

test('separate breakout model confirms retest/rebreak without fabricating a sweep',()=>{
  const f=readyFrames(),start=ts('2026-10-01T06:00:00Z');
  f['15m']=f['15m'].filter(x=>x[0]<start);
  f['15m'].push(k(start,105.5,108,105.3,107));
  f['15m'].at(-1)[5]=300;
  for(let i=1;i<4;i++)f['15m'].push(k(start+i*M15,106,109,105.6,108));
  f['5m']=f['5m'].filter(x=>x[0]<start);
  for(let i=0;i<4;i++)f['5m'].push(k(start+i*M5,106,107,105.6,106,M5));
  f['5m'].push(k(start+4*M5,106,106.5,105.3,106,M5));
  f['5m'].push(k(start+5*M5,106,108.5,105.8,108,M5));
  f['4h'][20][2]=120;
  const out=Long.evaluate({frames:f,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:108,context:{economicEventClear:true,orderRiskConfirmed:true,oiFundingClear:true}});
  assert.equal(out.status,'WAIT_SWEEP');
  assert.equal(out.breakout.status,'LONG_READY');assert.equal(out.breakout.sweep,undefined);
  assert.ok(out.breakout.retestAt<out.breakout.rebreakAt);
  assert.ok(out.breakout.riskReward>=1.5);
});

test('NY window crossing KST midnight stays on the same Asia session day',()=>{
  assert.equal(Long.tradeDate(ts('2026-12-02T15:30:00Z')),'2026-12-02');
  assert.equal(Long.sessionOf(ts('2026-12-02T15:30:00Z')),'NEW_YORK');
});

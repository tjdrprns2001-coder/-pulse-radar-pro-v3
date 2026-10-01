'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Long=require('./amd-long-entry.js');

const M5=5*60*1000,M15=15*60*1000,H1=60*60*1000,H4=4*60*60*1000,D1=24*60*60*1000;
function k(t,o,h,l,c,ms=M15,vol=100){return[t,o,h,l,c,vol,t+ms-1,vol*c,10,vol*.5,vol*c*.5]}
function ts(s){return Date.parse(s)}

function bullishHtf(){
  const h1=[],h4=[];
  for(let i=0;i<40;i++){
    const t=ts('2026-09-29T00:00:00Z')+i*H1,base=90+i*.22;
    h1.push(k(t,base,base+1.2,base-.5,base+.7,H1,100+i));
  }
  for(let i=0;i<40;i++){
    const t=ts('2026-09-24T00:00:00Z')+i*H4,base=80+i*.6;
    h4.push(k(t,base,base+2.5,base-1,base+1.4,H4,500+i*5));
  }
  return{h1,h4};
}

function readyFrames(){
  const m15=[],m5=[],{h1,h4}=bullishHtf();
  // 2026-10-01 08:00~13:00 KST = 2026-09-30 23:00~10-01 04:00 UTC.
  const asiaStart=ts('2026-09-30T23:00:00Z');
  for(let i=0;i<20;i++){
    const t=asiaStart+i*M15;
    m15.push(k(t,104,110-(i%3)*.2,100+(i%4)*.05,104.2,M15,100));
  }
  // London KST 15:00: sell-side sweep, reclaim, then expansion.
  m15.push(k(ts('2026-10-01T06:00:00Z'),100.3,100.5,99.4,99.7,M15,180));
  m15.push(k(ts('2026-10-01T06:15:00Z'),99.7,100.6,99.5,100.3,M15,210));
  m15.push(k(ts('2026-10-01T06:30:00Z'),100.3,101.8,100.4,101.6,M15,420));
  m15.push(k(ts('2026-10-01T06:45:00Z'),101.6,101.7,100.55,100.8,M15,180));
  m15.push(k(ts('2026-10-01T07:00:00Z'),100.8,102.2,100.7,102.0,M15,330));

  for(let i=0;i<36;i++){
    const t=ts('2026-10-01T03:00:00Z')+i*M5;
    m5.push(k(t,100.2,100.6,100.0,100.25,M5,80));
  }
  m5.push(k(ts('2026-10-01T06:00:00Z'),100.2,100.3,99.4,99.7,M5,160));
  m5.push(k(ts('2026-10-01T06:05:00Z'),99.7,99.95,99.5,99.85,M5,120));
  m5.push(k(ts('2026-10-01T06:10:00Z'),99.85,100.35,99.7,100.25,M5,170));
  m5.push(k(ts('2026-10-01T06:15:00Z'),100.25,100.95,100.2,100.85,M5,300));
  m5.push(k(ts('2026-10-01T06:20:00Z'),100.85,101.6,100.75,101.45,M5,420));
  m5.push(k(ts('2026-10-01T06:25:00Z'),101.0,101.2,100.5,100.75,M5,150));
  m5.push(k(ts('2026-10-01T06:30:00Z'),100.75,101.85,100.7,101.7,M5,360));
  m5.push(k(ts('2026-10-01T06:35:00Z'),101.7,102.0,101.35,101.9,M5,220));

  const d1=[
    k(ts('2026-09-28T00:00:00Z'),95,112,92,104,D1,1000),
    k(ts('2026-09-29T00:00:00Z'),104,114,98,108,D1,1100),
    k(ts('2026-09-30T00:00:00Z'),108,116,100,110,D1,1200)
  ];
  return{'15m':m15,'5m':m5,'1h':h1,'4h':h4,'1d':d1};
}

test('KST session mapping follows October DST table',()=>{
  assert.equal(Long.sessionOf(ts('2026-09-30T23:30:00Z')),'ASIA'); // 08:30 KST
  assert.equal(Long.sessionOf(ts('2026-10-01T06:30:00Z')),'LONDON'); // 15:30 KST
  assert.equal(Long.sessionOf(ts('2026-10-01T11:30:00Z')),'NEW_YORK'); // 20:30 KST
  assert.equal(Long.tradeDate(ts('2026-10-01T06:30:00Z')),'2026-10-01');
});

test('scenario A produces LONG_READY after sweep, reclaim, MSS, displacement, retest and rebreak',()=>{
  const out=Long.evaluate({
    frames:readyFrames(),
    asOf:ts('2026-10-01T08:30:00Z'),
    lastPrice:101.9,
    minRr:1.5,
    symbol:'BTCUSDT'
  });
  assert.equal(out.version,'ICT_CHARTBRO_LONG_v2_KST');
  assert.equal(out.policy.timeBasis,'KST');
  assert.equal(out.scenario,'A');
  assert.equal(out.status,'LONG_READY');
  assert.equal(out.sweep.session,'LONDON');
  assert.equal(out.mss.confirmed,true);
  assert.ok(out.displacement.volumeImproved);
  assert.equal(out.zone.kind,'BULLISH_FVG');
  assert.ok(out.retestAt);
  assert.ok(out.rebreakAt);
  assert.ok(out.entry>out.stop);
  assert.ok(out.firstTarget.rr>=1);
  assert.ok(out.selectedTarget.rr>=1.5);
  assert.equal(out.checklist.required,8);
  assert.ok(out.checklist.passed>=8);
  assert.deepEqual(out.entries.map(x=>x.weightPct),[40,40,20]);
  assert.equal(out.manualChecks.includes('중요 경제 이벤트 일정 수동 확인 필요'),true);
});

test('event block prevents a technically complete long',()=>{
  const out=Long.evaluate({
    frames:readyFrames(),
    asOf:ts('2026-10-01T08:30:00Z'),
    lastPrice:101.9,
    symbol:'BTCUSDT',
    eventRisk:'BLOCK'
  });
  assert.equal(out.status,'EVENT_BLOCKED');
});

test('closing below the locked sweep low invalidates the long',()=>{
  const frames=readyFrames();
  frames['15m'].push(k(ts('2026-10-01T07:15:00Z'),100.8,101,99.0,99.2,M15,250));
  frames['15m'].sort((a,b)=>a[0]-b[0]);
  const out=Long.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:99.2,symbol:'BTCUSDT'});
  assert.equal(out.status,'INVALID');
  assert.ok(Number.isFinite(out.invalidClose));
});

test('no sweep and no qualified breakout remains waiting',()=>{
  const frames=readyFrames();
  frames['15m']=frames['15m'].map(x=>x[0]>=ts('2026-10-01T06:00:00Z')?[x[0],101,101.4,100.05,101.1,x[5],x[6],x[7],x[8],x[9],x[10]]:x);
  const out=Long.evaluate({frames,asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.1,symbol:'BTCUSDT'});
  assert.ok(['WAIT_SWEEP','WAIT_HTF_SHIFT'].includes(out.status));
});

test('derivatives are displayed but not auto-blocked without guide thresholds',()=>{
  const out=Long.evaluate({
    frames:readyFrames(),asOf:ts('2026-10-01T08:30:00Z'),lastPrice:101.9,symbol:'BTCUSDT',
    fundingRatePct:.02,oi1hPct:2.1,oi4hPct:4.3
  });
  assert.equal(out.derivatives.oi1hPct,2.1);
  assert.equal(out.derivatives.riskStatus,'UNRATED');
});

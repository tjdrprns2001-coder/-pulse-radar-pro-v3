const test=require('node:test');
const assert=require('node:assert/strict');

const Clock=require('../lib/signal-quality/clock-integrity');
const Data=require('../lib/signal-quality/data-integrity');
const Outcome=require('../lib/signal-quality/outcome-recorder');
const Calibration=require('../lib/signal-quality/calibration');
const Alert=require('../lib/signal-quality/alert-state');
const Drift=require('../lib/signal-quality/drift-monitor');

function memoryStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}

test('clock integrity separates exchange event time from receive time and detects ordering/gaps',()=>{
  let s=Clock.createClockState();
  s=Clock.observeEvent(s,{eventTimeMs:1000,receiveTimeMs:1100,sequence:10});
  s=Clock.observeEvent(s,{eventTimeMs:900,receiveTimeMs:1200,sequence:12});
  const x=Clock.summarizeClock(s);
  assert.equal(x.count,2);
  assert.equal(x.lastDelayMs,300);
  assert.equal(x.outOfOrderCount,1);
  assert.equal(x.gapCount,1);
  assert.equal(x.lastSequence,12);
  assert.ok(x.p95DelayMs>=100);
});

test('feed health tracker counts reconnects, backfills and gaps',()=>{
  let x=Data.createFeedHealth();
  x=Data.noteFeedEvent(x,{state:'reconnecting'});
  x=Data.noteFeedEvent(x,{state:'backfill',backfilledBars:7,gapCount:2});
  x=Data.noteFeedEvent(x,{state:'live'});
  assert.equal(x.reconnectCount,1);
  assert.equal(x.backfillCount,1);
  assert.equal(x.backfilledBars,7);
  assert.equal(x.gapCount,2);
  assert.equal(x.state,'live');
});

test('provenance keeps exchange/local timing and fallback details',()=>{
  const p=Data.provenance({source:'Binance Futures',market:'cex',fetchedAtMs:2000,eventTimeMs:1500,receiveTimeMs:1800,latencyMs:25,state:'live',fallback:'REST',sequence:7});
  assert.equal(p.eventTimeMs,1500);
  assert.equal(p.receiveTimeMs,1800);
  assert.equal(p.fallback,'REST');
  assert.equal(p.sequence,7);
});

test('outcome recorder supports metadata segmentation and 50-bar horizon samples',()=>{
  const storage=memoryStorage();
  const snap=Outcome.recordSnapshot({id:'s1',symbol:'FILUSDT',tf:'4h',modelScore:80,pattern:'Triangle',regime:'range',venue:'cex'},storage);
  Outcome.attachOutcome(snap.id,50,{success:true,returnPct:3.1},storage);
  assert.equal(Outcome.resolvedSamples({horizon:50,symbol:'FILUSDT',tf:'4h',pattern:'Triangle',regime:'range',venue:'cex'},storage).length,1);
  assert.equal(Outcome.resolvedSamples({horizon:50,pattern:'Double Top'},storage).length,0);
});

test('calibration report includes Wilson interval and adequacy status',()=>{
  const rows=Array.from({length:40},(_,i)=>({probability:.6,outcome:i<24?1:0}));
  const r=Calibration.report(rows,{minSamples:30,adequateSamples:100,confidence:.9});
  assert.equal(r.available,true);
  assert.equal(r.status,'weak');
  assert.ok(r.ci&&r.ci.low<r.probability&&r.ci.high>r.probability);
  const insufficient=Calibration.report(rows.slice(0,10),{minSamples:30});
  assert.equal(insufficient.status,'insufficient');
});

test('alert transition persists lifecycle timestamps and reason/cooldown metadata',()=>{
  let a=Alert.transition({state:'OBSERVE'},{conditionsMet:2,conditionsTotal:3,calibrationReady:true,reason:'alignment'},1000);
  assert.equal(a.state,'WATCH');
  assert.equal(a.reasonChangedAt,1000);
  a=Alert.transition(a,{conditionsMet:3,conditionsTotal:3,calibrationReady:true,reason:'alignment'},2000);
  assert.equal(a.state,'ARMED');
  assert.equal(a.armedAt,2000);
  a=Alert.transition(a,{conditionsMet:3,conditionsTotal:3,calibrationReady:true,triggered:true,reason:'breakout',cooldownMs:5000},3000);
  assert.equal(a.state,'TRIGGERED');
  assert.equal(a.triggeredAt,3000);
  assert.equal(a.reasonChangedAt,3000);
  assert.equal(a.cooldownUntil,8000);
});

test('calibration pending hard-blocks armed states',()=>{
  const a=Alert.transition({state:'ARMED'},{conditionsMet:3,conditionsTotal:3,calibrationReady:false},5000);
  assert.equal(a.state,'WATCH');
});

test('feature drift detects deterioration between historical and recent windows',()=>{
  const day=86400000,now=200*day,rows=[];
  for(let i=20;i<160;i++)rows.push({atMs:i*day,featureValue:i%2,outcome:i%2});
  for(let i=171;i<=200;i++)rows.push({atMs:i*day,featureValue:i%2,outcome:(i+1)%2});
  const r=Drift.compareContribution(rows,{nowMs:now,recentDays:30,historyDays:180,minRecent:20,minHistorical:50,warningDrop:.5});
  assert.equal(r.status,'warning');
  assert.ok(r.recentContribution<r.historicalContribution);
});

test('feature drift abstains when samples are insufficient',()=>{
  const r=Drift.compareContribution([{atMs:1,featureValue:1,outcome:1}],{nowMs:10,minRecent:20,minHistorical:50});
  assert.equal(r.status,'insufficient');
});

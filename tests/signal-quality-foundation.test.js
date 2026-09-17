const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../lib/signal-quality/data-integrity.js');
const O=require('../lib/signal-quality/outcome-recorder.js');
const C=require('../lib/signal-quality/calibration.js');
const R=require('../lib/signal-quality/regime.js');
const A=require('../lib/signal-quality/alert-state.js');
const M=require('../lib/signal-quality/microstructure.js');

function storage(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}

test('data integrity distinguishes live, delayed, stale, reconnect and backfill',()=>{
  const now=100000;
  assert.equal(D.deriveFeedState({nowMs:now,lastEventMs:99500,staleAfterMs:1000}),'live');
  assert.equal(D.deriveFeedState({nowMs:now,lastEventMs:98000,staleAfterMs:1000}),'delayed');
  assert.equal(D.deriveFeedState({nowMs:now,lastEventMs:95000,staleAfterMs:1000}),'stale');
  assert.equal(D.deriveFeedState({connectionState:'reconnecting'}),'reconnecting');
  assert.equal(D.deriveFeedState({backfillPending:true,lastEventMs:Date.now()}),'backfill');
});

test('outcome recorder preserves immutable snapshot and stores outcomes separately',()=>{
  const s=storage(),snap=O.recordSnapshot({symbol:'BTCUSDT',tf:'4h',asOfTime:1,modelScore:80,bias:'bullish'},s);
  O.recordSnapshot({...snap,modelScore:10},s);
  O.attachOutcome(snap.id,20,{success:true,returnPct:2.5},s);
  const rows=O.list({},s);
  assert.equal(rows.length,1);
  assert.equal(rows[0].snapshot.modelScore,80);
  assert.equal(rows[0].outcomes['20'].success,true);
});

test('calibration metrics compute brier ece saturation and sample gate',()=>{
  const samples=[{probability:.9,outcome:1},{probability:.8,outcome:1},{probability:.2,outcome:0},{probability:.1,outcome:0}];
  assert.ok(C.brierScore(samples)<.05);
  assert.ok(C.expectedCalibrationError(samples)>=0);
  assert.equal(C.saturationRate(samples,.95),0);
  assert.equal(C.empiricalProbability(samples,10).available,false);
  assert.equal(C.empiricalProbability(samples,4).probability,.5);
});

test('regime classifier returns explicit experimental regime labels',()=>{
  const candles=[];for(let i=0;i<80;i++)candles.push({open:100+i,high:102+i,low:99+i,close:101+i,volume:1000+i*2});
  const x=R.classifyRegime(candles);
  assert.equal(x.available,true);
  assert.equal(x.experimental,true);
  assert.ok(['up','down','range'].includes(x.trend));
  assert.ok(['low','normal','high'].includes(x.volatility));
});

test('alert state abstains on bad integrity and applies evidence states',()=>{
  assert.equal(A.nextAlertState('WATCH',{integrityState:'stale',conditionsMet:3,conditionsTotal:3}),'NO_SIGNAL');
  assert.equal(A.nextAlertState('OBSERVE',{integrityState:'live',conditionsMet:1,conditionsTotal:3}),'WATCH');
  assert.equal(A.nextAlertState('WATCH',{integrityState:'live',conditionsMet:3,conditionsTotal:3}),'ARMED');
});

test('microstructure keeps cex order book and dex amm features separate',()=>{
  const c=M.buildFeatures('cex',{bidDepth:60,askDepth:40,takerBuy:70,takerSell:30});
  const d=M.buildFeatures('dex',{buySwapVolume:70,sellSwapVolume:30,poolLiquidityChangePct:5});
  assert.equal(c.venue,'cex'); assert.ok(c.depthImbalance>0); assert.equal(c.poolLiquidityChangePct,undefined);
  assert.equal(d.venue,'dex'); assert.ok(d.swapImbalance>0); assert.equal(d.depthImbalance,undefined);
});

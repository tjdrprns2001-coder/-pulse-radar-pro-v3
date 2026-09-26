'use strict';
const assert=require('assert');
const A=require('../lib/coin-scan/sampling-v3-alt-bars.js');

const start=Date.parse('2026-09-27T00:00:00Z');
const trades=[];
for(let i=0;i<600;i++){
  const block=Math.floor(i/12),buy=block%3!==2;
  trades.push({a:i,p:String(100+i*.002),q:String(2+(i%5)*.1),T:start+i*1000,m:!buy});
}
trades.push({...trades[100]}); // duplicate id must be removed

const n=A.normalizeAggTrades(trades);
assert.equal(n.length,600,'duplicate aggregate trade id must be removed');
assert(n.every((x,i)=>i===0||x.time>=n[i-1].time),'trades must be chronological');

// Explicit bar families.
const tick=A.buildTickBars(trades,{tickTargetTrades:20});
const volume=A.buildVolumeBars(trades,{volumeThresholdQty:40});
const dollar=A.buildDollarBars(trades,{thresholdUsd:4000});
const imbalance=A.buildImbalanceBars(trades,{imbalanceThresholdUsd:1500});
const run=A.buildRunBars(trades,{runThresholdUsd:1000,minRunTrades:6});
assert(tick.length>0&&tick.every(x=>x.tradeCount===20&&x.barType==='TICK_AGGTRADE'),'aggTrade tick bars must close on fixed event count');
assert(volume.length>0&&volume.every(x=>x.volume>=x.thresholdQty),'volume bars required');
assert(dollar.length>0&&dollar.every(x=>x.dollarVolume>=x.thresholdUsd),'dollar bars required');
assert(imbalance.length>0&&imbalance.every(x=>Math.abs(x.signedImbalanceUsd)>=x.thresholdUsd),'imbalance bars required');
assert(run.length>0&&run.every(x=>x.runTrades>=6&&['BUY','SELL'].includes(x.direction)),'run bars required');

// Tail policy: an incomplete tick bar is not force-closed.
const short=trades.slice(0,45);
assert.equal(A.buildTickBars(short,{tickTargetTrades:20}).length,2,'partial tick tail must be dropped');

// Overshoot policy is explicit and deterministic: the closing trade is included in the current bar.
const overshootTrades=[
  {a:9001,p:'100',q:'3',T:start+700000,m:false},
  {a:9002,p:'100',q:'3',T:start+701000,m:false},
  {a:9003,p:'100',q:'3',T:start+702000,m:false},
  {a:9004,p:'100',q:'3',T:start+703000,m:false}
];
const vb=A.buildVolumeBars(overshootTrades,{volumeThresholdQty:5,overshootPolicy:'INCLUDE_FULL_TRADE'});
assert.equal(vb.length,2);
assert.equal(vb[0].tradeCount,2);
assert.equal(vb[0].volume,6);
assert.equal(vb[0].overshootVolume,1);
assert.equal(vb[0].overshootPolicy,'INCLUDE_FULL_TRADE');
const db=A.buildDollarBars(overshootTrades,{thresholdUsd:500,overshootPolicy:'INCLUDE_FULL_TRADE'});
assert.equal(db[0].dollarVolume,600);
assert.equal(db[0].overshootUsd,100);

// Calibration must use only the leading train segment and stay frozen in evaluation.
const cfg={calibrationFraction:.35,minCalibrationTrades:50,tickTargetTrades:20,volumeTargetTrades:20,dollarTargetTrades:20,imbalanceTargetTrades:8,minRunTrades:6,minThresholdUsd:500};
const cal1=A.calibrateThresholds(trades,cfg);
assert.equal(cal1.status,'READY');
assert(cal1.calibrationEndTime<cal1.evaluationStartTime,'calibration must end before evaluation begins');
const mutated=trades.map((x,i)=>i<210?{...x}:{...x,p:String(Number(x.p)*10),q:String(Number(x.q)*20)});
const cal2=A.calibrateThresholds(mutated,cfg);
assert.deepEqual(cal2.thresholds,cal1.thresholds,'future/evaluation trades must not change frozen thresholds');
assert.equal(cal2.calibrationEndTime,cal1.calibrationEndTime);

// Full v3.2 summary defaults to frozen calibration and exposes all five bar families.
const s=A.summarize(trades,cfg);
assert.equal(s.version,'SAMPLING_V3_ALT_BARS_v2');
assert.equal(s.revision,'3.2');
assert.equal(s.status,'READY');
assert.equal(s.tradeCount,600);
assert.equal(s.policy.thresholdMode,'FROZEN_CALIBRATION');
assert.equal(s.policy.overshootPolicy,'INCLUDE_FULL_TRADE');
assert.equal(s.policy.partialBarPolicy,'DROP_INCOMPLETE_TAIL');
assert.equal(s.calibration.status,'READY');
assert.equal(s.diagnostics.duplicateSafe,true);
assert.equal(s.diagnostics.causalThresholds,true);
assert.equal(s.diagnostics.frozenEvaluation,true);
assert.equal(s.diagnostics.futureDataUsedForThresholds,false);
for(const k of ['tickCount','volumeCount','dollarCount','imbalanceCount','runCount'])assert(s.bars[k]>0,k+' required');
assert(s.latest.tick&&s.latest.volume&&s.latest.dollar,'latest tick/volume/dollar bars required');
assert(s.rollingShadow&&typeof s.rollingShadow==='object','rolling thresholds may remain shadow comparison only');
assert.equal(s.policy.tickDefinition,'BINANCE_AGGTRADE_EVENT_COUNT');
assert.equal(s.policy.thresholdScope,'PER_SNAPSHOT_CAUSAL_SPLIT');
assert.equal(s.sourceSchema.eventType,'AGG_TRADE');
assert.equal(s.sourceSchema.receiveTimeAvailable,false);

const tooShort=A.summarize(trades.slice(0,40),cfg);
assert.notEqual(tooShort.status,'READY','insufficient calibration must not silently roll into a READY primary result');
assert.equal(tooShort.bars.tickCount,0,'primary frozen bars must stay empty without calibration');
assert(tooShort.rollingShadow&&typeof tooShort.rollingShadow.tickCount==='number','rolling alternative may remain diagnostics only');

console.log('sampling v3.2 alternative bars PASS',JSON.stringify({bars:s.bars,calibration:s.calibration.thresholds}));

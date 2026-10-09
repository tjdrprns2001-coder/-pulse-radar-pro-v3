'use strict';
const assert=require('node:assert/strict');
const {runBowlParameterGrid,wilson,makeCutoffs}=require('../lib/research-backtest-v2/bowl-parameter-grid.js');
const {evaluateBowlWalkForward,splitByCalendar}=require('../lib/research-backtest-v2/bowl-walk-forward.js');
const DAY=86400000,t0=1700000000000,asOf=t0+1100*DAY,rows=[];
const add=p=>{const t=t0+rows.length*DAY;rows.push([t,p,p*1.005,p*.995,p,100,t+DAY-1])};
for(let i=0;i<1100;i++)add(100+Math.sin(i/12));
const cutoffs={trainEnd:t0+700*DAY,validationEnd:t0+900*DAY};
const actual=evaluateBowlWalkForward({symbol:'BTCUSDT',rows,asOf,
 options:{calendarSplits:cutoffs,evaluationSplits:['train','validation']}});
assert.equal(actual.status,'READY');
assert.equal(actual.bySplit.test.eligibleBars,0,'test must never be visited in selection phase');
assert.equal(actual.events.test.length,0);
assert(actual.bySplit.validation.eligibleBars>0);
assert.equal(splitByCalendar(cutoffs.trainEnd-8*DAY, {...cutoffs,asOf}),'train');
assert.equal(splitByCalendar(cutoffs.trainEnd-DAY, {...cutoffs,asOf}),null);
assert.equal(splitByCalendar(cutoffs.validationEnd+DAY, {...cutoffs,asOf}),null);
assert.equal(splitByCalendar(cutoffs.validationEnd+8*DAY, {...cutoffs,asOf}),'test');
assert.equal(wilson(3,0).lower,null);
assert(wilson(8,10).lower>wilson(2,10).lower);
const grid=[{id:'looser',minVolumeRatio:1.2,maxBaseWidth:.22},{id:'tighter',minVolumeRatio:1.5,maxBaseWidth:.12}],calls=[];
function sample(n,wins,t=0){
 const events=Array.from({length:n},(_,i)=>({at:t0+(i+1)*DAY,hit72h10:i<wins,return7dPct:i<wins?5:-2}));
 return {events,metrics:{count:n,hit72h10Count:wins,hit72h10Rate:n?wins/n:null}};
}
const fakeEvaluate=({symbol,options})=>{
 calls.push({symbol,volume:options.minVolumeRatio,splits:options.evaluationSplits});
 const favorable=options.minVolumeRatio===1.5;
 const train=sample(12,favorable?9:6),validation=sample(12,favorable?10:3),test=sample(6,3);
 const controls={count:48,hit72h10Count:3};
 return {version:'BOWL_WALK_FORWARD_v1',symbol,status:'READY',
 bySplit:{train:{signals:train.metrics,controls},validation:{signals:validation.metrics,controls},
   test:{signals:options.evaluationSplits.includes('test')?test.metrics:{count:0,hit72h10Count:0},controls}},
 events:{train:train.events,validation:validation.events,test:options.evaluationSplits.includes('test')?test.events:[]}};
};
const inputs=[{symbol:'BTCUSDT',rows,source:'BINANCE_FUTURES'},{symbol:'ETHUSDT',rows,source:'BINANCE_FUTURES'}];
const result=runBowlParameterGrid({datasets:inputs,asOf,grid,calendarSplits:cutoffs,evaluate:fakeEvaluate});
assert.equal(result.status,'SELECTED',JSON.stringify(result));
assert.equal(result.selectedProfile.id,'tighter','ranking must use validation only');
assert.equal(result.holdout.status,'REPORTED');
assert.equal(result.holdout.test.signals,12);
assert.equal(result.holdout.test.wins,6);
assert.equal(result.validationLeaderboard.length,2);
assert.equal(calls.length,6,'two profiles x two assets, plus winner test x two assets');
assert(calls.slice(0,4).every(c=>!c.splits.includes('test')),'profile search must not evaluate held-out test');
assert(calls.slice(4).every(c=>c.volume===1.5&&c.splits.includes('test')),'only selected profile can evaluate test');
assert(result.holdout.cohort.correlationWarning,'cross-symbol same-day correlation must be visible');
const locked=runBowlParameterGrid({datasets:inputs,asOf,grid,calendarSplits:cutoffs,
 thresholds:{validationSignals:1000},evaluate:fakeEvaluate});
assert.equal(locked.status,'INSUFFICIENT_VALIDATION');
assert.equal(locked.holdout.status,'LOCKED');
assert(calls.slice(6).every(c=>!c.splits.includes('test')));
assert.equal(runBowlParameterGrid({datasets:[{...inputs[0],source:'BYBIT_LINEAR'}],asOf}).status,'INVALID_INPUT');
assert.equal(runBowlParameterGrid({datasets:inputs,asOf,grid:[{id:'bad',requireLongMa:false}]}).status,'INVALID_INPUT');
assert.equal(runBowlParameterGrid({datasets:inputs,asOf,grid,calendarSplits:{trainEnd:asOf,validationEnd:asOf+1}}).status,'INSUFFICIENT_CALENDAR_HISTORY');
const derived=makeCutoffs(inputs,asOf);
assert(derived.trainEnd<derived.validationEnd&&derived.validationEnd<asOf);
console.log('parameter grid, synchronized calendar, validation-only selection, locked test PASS');

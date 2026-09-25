'use strict';
const assert=require('assert');
const V=require('../lib/research-backtest-v2/setup-validation-harness.js');

const STEP=15*60*1000,START=Date.UTC(2026,0,1);
function bar(i,{o=100,h=102,l=98,c=100}={}){
  const ot=START+i*STEP,ct=ot+STEP-1;
  return[ot,String(o),String(h),String(l),String(c),'1000',ct,String(c*1000)];
}
const rows=[];
for(let i=0;i<70;i++)rows.push(bar(i));
// Define post-entry bars to alternate target/stop outcomes.
for(const [i,win] of [[6,true],[16,false],[26,true],[36,false],[46,true],[56,false]]){
  rows[i]=bar(i,win?{o:100,h:106,l:99,c:104}:{o:100,h:102,l:94,c:96});
}
function tr(i,type,state,features={}){
  const t=rows[i][6];
  return{symbol:'TESTUSDT',setupType:type,fromState:'X',toState:state,candleCloseTime:t,decisionTime:t,features};
}
const transitions=[
  tr(4,'BOTTOM_REVERSAL','WATCH_BOTTOM'),tr(5,'BOTTOM_REVERSAL','BOTTOM_CONFIRMED',{evidence:{risk:{stop:95,target:105}}}),
  tr(14,'PREBREAKOUT','WATCH_BREAKOUT'),tr(15,'PREBREAKOUT','BREAKOUT_CONFIRMED',{evidence:{risk:{stop:95,target:105}}}),
  tr(24,'BOTTOM_REVERSAL','WATCH_BOTTOM'),tr(25,'BOTTOM_REVERSAL','BOTTOM_CONFIRMED',{evidence:{risk:{stop:95,target:105}}}),
  tr(34,'PREBREAKOUT','WATCH_BREAKOUT'),tr(35,'PREBREAKOUT','BREAKOUT_CONFIRMED',{evidence:{risk:{stop:95,target:105}}}),
  tr(44,'BOTTOM_REVERSAL','WATCH_BOTTOM'),tr(45,'BOTTOM_REVERSAL','BOTTOM_CONFIRMED',{evidence:{risk:{stop:95,target:105}}}),
  tr(54,'PREBREAKOUT','WATCH_BREAKOUT'),tr(55,'PREBREAKOUT','BREAKOUT_CONFIRMED',{evidence:{risk:{stop:95,target:105}}})
];

const splits={
  development:{startTs:rows[0][6],endTs:rows[19][6]},
  walkForward:{startTs:rows[20][6],endTs:rows[39][6],foldMs:10*STEP},
  lockedOos:{startTs:rows[40][6],endTs:rows[69][6]}
};
const config={initialCash:100000,commissionRate:.0005,slippageRate:.0005,riskPerTradeFraction:.01,maxPositionValueFraction:.25,stopTargetPriority:'stop_first'};
const out=V.validateSetupResearch({rows,transitions,splits,config,costMultipliers:[1,1.5,2]});

assert.equal(out.splits.development.confirmedCount,2);
assert.equal(out.splits.walkForward.confirmedCount,2);
assert.equal(out.splits.lockedOos.confirmedCount,2);
assert.equal(out.lockedOosPolicy.mutable,false);
assert.equal(out.configFingerprint,V.fingerprintConfig({config,costMultipliers:[1,1.5,2]}));

const dev=out.splits.development.stress['1x'].setupMetrics;
assert.equal(dev.tradeCount,2);
assert.equal(dev.precision,.5);
assert.equal(dev.falseTriggerRate,.5);
assert(dev.realizedR.count===2);
assert(dev.byType.BOTTOM_REVERSAL.latencyMinutes.count===1);
assert(dev.byType.PREBREAKOUT.latencyMinutes.count===1);

assert(out.walkForwardFolds.folds.length>=2);
assert(out.walkForwardFolds.summary.foldCount>=2);
assert(out.splits.development.stress['2x'].performance.endingEquity<=out.splits.development.stress['1x'].performance.endingEquity);

assert.throws(()=>V.assertLockedSplit({
  development:{startTs:0,endTs:100},
  walkForward:{startTs:50,endTs:200},
  lockedOos:{startTs:201,endTs:300}
}),/ordered and non-overlapping/);

console.log('setup validation harness verification passed');

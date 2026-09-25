'use strict';
const assert=require('assert');
const Coverage=require('../lib/research-backtest-v2/setup-execution-coverage.js');

const STEP=15*60*1000,START=Date.UTC(2026,0,1);
function bar(i,{o=100,h=102,l=98,c=100}={}){
  const ot=START+i*STEP,ct=ot+STEP-1;
  return[ot,String(o),String(h),String(l),String(c),'1000',ct,String(c*1000)];
}
const rows=[];for(let i=0;i<40;i++)rows.push(bar(i));
rows[6]=bar(6,{o:100,h:105,l:99,c:104});
rows[16]=bar(16,{o:100,h:101,l:94,c:95});

const transitions=[
  {symbol:'TESTUSDT',setupType:'BOTTOM_REVERSAL',toState:'WATCH_BOTTOM',decisionTime:rows[4][6],candleCloseTime:rows[4][6],features:{}},
  {symbol:'TESTUSDT',setupType:'BOTTOM_REVERSAL',toState:'BOTTOM_TRIGGER',decisionTime:rows[5][6],candleCloseTime:rows[5][6],features:{evidence:{pointInTimeContextMissing:'execution'}}},
  {symbol:'TESTUSDT',setupType:'PREBREAKOUT',toState:'WATCH_BREAKOUT',decisionTime:rows[14][6],candleCloseTime:rows[14][6],features:{}},
  {symbol:'TESTUSDT',setupType:'PREBREAKOUT',toState:'PREBREAKOUT_TRIGGER',decisionTime:rows[15][6],candleCloseTime:rows[15][6],features:{evidence:{execution:{available:true}}}},
  {symbol:'TESTUSDT',setupType:'PREBREAKOUT',toState:'BREAKOUT_CONFIRMED',decisionTime:rows[17][6],candleCloseTime:rows[17][6],features:{evidence:{execution:{available:true}}}}
];

const out=Coverage.buildCoverageReport({rows,transitions,horizonBars:8});
assert.equal(out.summary.triggerCount,2);
assert.equal(out.summary.executionCoveredCount,1);
assert.equal(out.summary.executionCoverageRate,.5);
assert.equal(out.summary.byType.BOTTOM_REVERSAL.triggerCount,1);
assert.equal(out.summary.byType.BOTTOM_REVERSAL.executionCoverageRate,0);
assert.equal(out.summary.byType.PREBREAKOUT.executionCoverageRate,1);
assert.equal(out.summary.byType.PREBREAKOUT.confirmConversionRate,1);
assert(out.summary.mfePct.count===2);
assert(out.events[0].forward.mfePct!=null);
assert(out.events[0].executionCoverageReason==='historical_execution_unavailable');

console.log('setup execution coverage split verification passed');

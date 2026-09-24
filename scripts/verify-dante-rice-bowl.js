'use strict';
const assert=require('assert');
const R=require('../ui/dante/rice-bowl-engine.js');

function candle(i,close,volume=100,spread=2){return{time:1000+i*1000,closeTime:1000+i*1000,open:close-.2,high:close+spread/2,low:close-spread/2,close,volume,partial:false}}
function params(){return{
  ema:{fast:3,pivot:5,long:8},
  emaSeed:{method:'SMA_FIXED',seedBars:8},
  atrPeriod:3,
  pivot:{left:1,right:1},
  dump:{lookbackBars:8,minDrawdownPct:10,minAtrExpansion:0,requireBearishLongMaHistory:true},
  base:{minBars:4,preferredDurationRatioMin:1.2,preferredDurationRatioMax:2,maxRangeAtr:20,maxEma224SlopeAbsAtrPerBar:10,requireLongerThanDecline:false,minConfirmedPivotCount:0},
  breakout:{level:'EMA224_OR_GONGGURI',breakoutBufferAtr:.05,minRvol:1.1,ignitionRvol:2,requireConfirmedClose:true,minPriorClosesBelowPivot:3},
  retest:{variant:'RETEST_5D_RECLAIM',toleranceAtr:.5,reclaimBufferAtr:.02,minHoldBars:1,maxRetestBars:8},
  expansion:{minDistanceAtrAboveTrigger:.5,requireHigherLow:false},
  reset:{newStructuralLow:true,emaSeparationReexpansion:true}
}}
function series(){
  const c=[];
  for(let i=0;i<12;i++)c.push(candle(i,120-i*3,100,3));
  for(let i=12;i<18;i++)c.push(candle(i,87+(i%2)*.4,80,1.5));
  c.push(candle(18,120,500,2));
  c.push(candle(19,91,120,2));
  c.push(candle(20,94,140,2));
  c.push(candle(21,99,180,2));
  return c;
}

assert.equal(R.validTransition('NO_PATTERN','PHASE_1_DUMP'),true);
assert.equal(R.validTransition('PHASE_2_ACCUMULATION','PHASE_3_CONFIRMED'),false);
assert.equal(R.validTransition('PHASE_1_DUMP','PHASE_4_EXPANSION'),false);
assert.equal(R.validTransition('FAILED_BREAKOUT','PHASE_3_BREAKOUT'),true);

{
  const c=series(),r=R.analyze({symbol:'TESTUSDT',candles:c,analysisAsOf:c.at(-1).closeTime+1,params:params()});
  const states=r.transitionPath.map(x=>x.to);
  assert(states.includes('PHASE_1_DUMP'));
  assert(states.includes('PHASE_2_ACCUMULATION'));
  assert(states.includes('PHASE_3_BREAKOUT'));
  assert(states.indexOf('PHASE_3_BREAKOUT')>states.indexOf('PHASE_2_ACCUMULATION'));
  assert(r.rankingContribution===0&&r.scannerStageContribution===0&&r.bookEvidenceContribution===0);
  assert(r.sequenceId?.startsWith('DANTE-TESTUSDT-'));
}
{
  const c=series();
  c[c.length-1]={...c.at(-1),partial:true};
  assert.throws(()=>R.analyze({symbol:'TESTUSDT',candles:c,analysisAsOf:c.at(-1).closeTime+1,params:params()}),/CLOSED_ONLY/i);
}
{
  const c=series();
  assert.throws(()=>R.analyze({symbol:'TESTUSDT',candles:c,analysisAsOf:c.at(-1).closeTime-1,params:params()}),/after analysisAsOf/i);
}
{
  const c=series(),p=params();
  const a=R.analyze({symbol:'TESTUSDT',candles:c,analysisAsOf:c.at(-1).closeTime+1,params:p});
  const b=R.analyze({symbol:'TESTUSDT',candles:JSON.parse(JSON.stringify(c)),analysisAsOf:c.at(-1).closeTime+1,params:p});
  assert.deepEqual(a,b,'same closed input must reproduce same lifecycle');
}
{
  const closes=[10,9,8,7,6,5,4,3,2,1],ema=[null,null,null,null,null,null,null,4,4,4];
  assert.equal(R.priorConsecutiveBelow(closes,ema,10),2);
}
{
  const piv=[
    candle(0,10,100,1),candle(1,8,100,1),candle(2,11,100,1),candle(3,9,100,1),candle(4,12,100,1)
  ];
  assert(R.confirmedPivotCount(piv,0,4,1,1)>=3,'confirmed pivots should be counted only with right-side confirmation available');
}
console.log('dante rice bowl PASS');
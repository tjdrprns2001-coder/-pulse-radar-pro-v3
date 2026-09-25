'use strict';
const assert=require('assert');
const E=require('../lib/coin-scan/entry-confirmation-engine.js');

function candles(n=120,step=.15){
  const out=[];let p=100;
  for(let i=0;i<n;i++){
    const open=p,close=p+step,high=close+.35,low=open-.28,vol=1000+(i%9)*20;
    out.push([i*3600000,open,high,low,close,vol,(i+1)*3600000-1,vol*close,100,vol*.55,vol*close*.55,0]);p=close;
  }
  out[out.length-1][5]=1800;
  return out;
}
const frames={'1d':candles(),'4h':candles(),'1h':candles()};
const baseEntry=frames['4h'].at(-1)[4];

let x=E.analyze({
  frames,
  structure:'bullish',
  strategyCycle:{
    entryTiming:{stage:'RETEST_SUPPORT_HOLD',tf:'4h',level:baseEntry-.7},
    reentryEligible:true,
    activeTracks:[{key:'MA_RETEST',active:true}]
  },
  bookManual:{riskPlan:{invalidation:baseEntry-1,targets:[baseEntry+2.2,baseEntry+3.5]}}
});
assert.equal(x.grade,'A','confirmed retest + bullish HTF + >=1.5R should be A grade');
assert.equal(x.setup,'돌파 후 리테스트');
assert(x.spaceR>=1.5);
assert(/리테스트/.test(x.trigger));
assert(x.invalidation<baseEntry);

x=E.analyze({
  frames,
  structure:'bullish',
  strategyCycle:{
    entryTiming:{stage:'FAILED_RETEST_RESISTANCE',tf:'4h',level:baseEntry+.2},
    reentryEligible:false,
    activeTracks:[]
  },
  bookManual:{riskPlan:{invalidation:baseEntry-1,targets:[baseEntry+2]}}
});
assert.equal(x.grade,'D','failed retest must force D grade');
assert.equal(x.failedRetest,true);
assert(/재회복|취소|저항/.test(x.trigger+x.cancelCondition));

x=E.analyze({
  frames,
  structure:'bullish',
  strategyCycle:{
    entryTiming:{stage:'LATE_ENTRY_WARNING',tf:'4h',level:baseEntry-3},
    reentryEligible:true,
    activeTracks:[{key:'MA_RETEST',active:true}]
  },
  bookManual:{riskPlan:{invalidation:baseEntry-1,targets:[baseEntry+.6]}}
});
assert.notEqual(x.grade,'A','late/poor-space entry must not remain A');
assert(['C','D'].includes(x.grade),'late entry with <1R target space should be C/D');
assert.equal(x.lateEntry,true);
assert(x.warnings.some(v=>/늦은 추격/.test(v)));
console.log('entry confirmation engine PASS');

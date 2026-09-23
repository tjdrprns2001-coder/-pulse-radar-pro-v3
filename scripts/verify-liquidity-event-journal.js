'use strict';
const assert=require('assert');
const J=require('../ui/chart/liquidity-event-journal.js');
const T0=1700000000000,H=3600000;
const model={
  ok:true,version:'LIQ_v1',current:100,atr:2,referenceOnly:false,
  candles:[{time:T0,open:99,high:101,low:98,close:100,partial:false},{time:T0+H,open:100,high:101,low:99,close:100,partial:false}],
  range:{low:90,high:110,mid:100},summary:{position:'equilibrium',rangePositionPct:50},
  scenario:{direction:'up',bias:'up',phase:'POST_SWEEP_DRAW',target:{label:'BSL',price:105,side:'buy',external:true,score:70},invalidation:96,sweep:{index:1,dir:'down',confirmed:true,last:{index:1}}},
  smc:{mss:[{index:1,dir:'up'}],displacements:[{index:1,dir:'up'}]}
};
const tl={version:'TLR1',paramsHash:'ph1',primary:{state:'CONFIRMED',stateLabel:'리테스트 확인',paramsHash:'ph1',line:{lineId:'L1'},quality:{score:72},breakout:{barIndex:1,time:T0+H,direction:'UP'},retest:{firstTouchBarIndex:1,firstTouchTime:T0+H,confirmedBarIndex:1,confirmedTime:T0+H}}};
const a=J.buildSnapshot({symbol:'BTCUSDT',timeframe:'1h',model,trendRetest:tl,now:T0+2*H});
const b=J.buildSnapshot({symbol:'BTCUSDT',timeframe:'1h',model,trendRetest:tl,now:T0+3*H});
assert.equal(a.id,b.id,'snapshot id must be deterministic per confirmed bar + params');
assert(a.events.some(x=>x.type==='LIQ_SWEEP')&&a.events.some(x=>x.type==='RECLAIM')&&a.events.some(x=>x.type==='TL_BREAK')&&a.events.some(x=>x.type==='TL_RETEST_CONFIRMED'),'event chain incomplete');
const future=[
  ...model.candles,
  {time:T0+2*H,open:100,high:103,low:99,close:102,partial:false},
  {time:T0+3*H,open:102,high:106,low:101,close:105,partial:false}
];
const hit=J.resolveOutcome(a,future,T0+4*H);
assert.equal(hit.status,'DOL_REACHED');assert(hit.mfePct>0&&hit.maePct>0);
const invalid=J.resolveOutcome({...a,target:{price:110},invalidation:{price:98}},[...model.candles,{time:T0+2*H,open:100,high:101,low:97,close:98}],T0+3*H);
assert.equal(invalid.status,'INVALIDATED');
const both=J.resolveOutcome(a,[...model.candles,{time:T0+2*H,open:100,high:106,low:95,close:101}],T0+3*H);
assert.equal(both.status,'BOTH_SAME_BAR','intrabar order must remain ambiguous');
const down=J.resolveOutcome({...a,direction:'down',target:{price:95},invalidation:{price:104}},[...model.candles,{time:T0+2*H,open:100,high:102,low:94,close:95}],T0+3*H);
assert.equal(down.status,'DOL_REACHED','down-direction outcome must mirror long logic');
const store=J.createMemoryStore();
let r=J.recordAndResolve({store,snapshot:a,candles:model.candles,now:T0+2*H});
assert.equal(r.stats.total,1);
r=J.recordAndResolve({store,snapshot:b,candles:future,now:T0+4*H});
assert.equal(r.stats.total,1,'same snapshot must dedupe');assert.equal(r.current.outcome.status,'DOL_REACHED');
assert(/^LQJ-BTCUSDT-1h-/.test(a.id));assert(/^LQS-/.test(a.scenarioKey));assert.equal(a.params.trendlineParamsHash,'ph1');
console.log('liquidity event journal + outcome tracker PASS');
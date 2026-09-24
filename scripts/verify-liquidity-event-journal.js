'use strict';
const assert=require('assert');
const J=require('../ui/chart/liquidity-event-journal.js');
const T0=1700000000000,H=3600000;
function c(t,o,h,l,cl){return{time:t,open:o,high:h,low:l,close:cl,partial:false}}
const model={
  ok:true,version:'LIQ_v1',current:100,atr:2,referenceOnly:false,
  candles:[c(T0,99,101,98,100),c(T0+H,100,101,99,100)],
  range:{low:90,high:110,mid:100},summary:{position:'equilibrium',rangePositionPct:50},
  scenario:{direction:'up',bias:'up',phase:'POST_SWEEP_DRAW',target:{label:'BSL',price:105,side:'buy',external:true,score:70},invalidation:96,sweep:{index:1,dir:'down',confirmed:true,last:{index:1,level:99}}},
  smc:{mss:[{index:1,dir:'up',level:101}],displacements:[{index:1,dir:'up'}]}
};
const tl={version:'TLR1',paramsHash:'ph1',primary:{state:'CONFIRMED',stateLabel:'리테스트 확인',paramsHash:'ph1',line:{lineId:'L1'},quality:{score:72},current:{linePrice:100},breakout:{barIndex:1,time:T0+H,direction:'UP',close:100.5,linePrice:100,frozenAtr:2},retest:{firstTouchBarIndex:1,firstTouchTime:T0+H,confirmedBarIndex:1,confirmedTime:T0+H}}};
const bundle=J.createBundle({symbol:'BTCUSDT',timeframe:'1h',model,trendRetest:tl,now:T0+2*H});
const a=bundle.snapshot,b=J.buildSnapshot({symbol:'BTCUSDT',timeframe:'1h',model,trendRetest:tl,now:T0+3*H});
assert.equal(a.id,b.id,'snapshot id must be deterministic');
assert.equal(a.sequenceId,b.sequenceId,'sequence id must be deterministic');
assert(bundle.events.every(e=>e.eventId&&e.eventFingerprint&&e.eventVersion===1&&e.snapshotId===a.id&&e.sequenceId===a.sequenceId),'event schema incomplete');
const reclaim=bundle.events.find(e=>e.eventType==='RECLAIM'),sweep=bundle.events.find(e=>e.eventType==='LIQ_SWEEP');
assert(reclaim&&sweep&&reclaim.parentEventId===sweep.eventId,'reclaim should link to sweep when connectable');
const rt=bundle.events.find(e=>e.eventType==='TL_RETEST_CONFIRMED'),touch=bundle.events.find(e=>e.eventType==='TL_RETEST_TOUCH');
assert(rt&&touch&&rt.parentEventId===touch.eventId,'retest confirm should link to touch');
assert(bundle.events.some(e=>e.eventType==='MSS')&&bundle.events.some(e=>e.eventType==='DISPLACEMENT'),'independent MSS/Displacement events required');

const ref=[...model.candles,c(T0+2*H,101,103,100,102)];
let o=J.resolveOutcome(a,null,{referenceCandles:model.candles,outcomeCandles:model.candles},T0+2*H);
assert.equal(o.status,'PENDING_REFERENCE','no next confirmed candle => pending reference');
o=J.resolveOutcome(a,o,{referenceCandles:ref,outcomeCandles:ref},T0+3*H);
assert.equal(o.referencePrice,101,'reference must use next confirmed candle open');
assert.equal(o.referenceBasis,'NEXT_CONFIRMED_CANDLE_OPEN');
assert.equal(o.status,'PENDING');

const hitRows=[...ref,c(T0+3*H,102,106,101,105)];
o=J.resolveOutcome(a,o,{referenceCandles:hitRows,outcomeCandles:hitRows},T0+4*H);
assert.equal(o.status,'REACHED');assert(o.path.mfePct>0&&o.path.maePct>=0);
const terminal=J.resolveOutcome(a,o,{referenceCandles:hitRows,outcomeCandles:[...hitRows,c(T0+4*H,105,106,90,91)]},T0+5*H);
assert.equal(terminal.status,'REACHED','terminal outcome must not reverse after finalization');

const invalidSnap={...a,target:{price:110},invalidation:{price:98}};
const invRows=[...ref,c(T0+3*H,101,102,97,98)];
const inv=J.resolveOutcome(invalidSnap,null,{referenceCandles:invRows,outcomeCandles:invRows},T0+4*H);
assert.equal(inv.status,'INVALIDATED_BEFORE_REACH');
const both=J.resolveOutcome(a,null,{referenceCandles:[...model.candles,c(T0+2*H,100,106,95,101)],outcomeCandles:[...model.candles,c(T0+2*H,100,106,95,101)]},T0+3*H);
assert.equal(both.status,'AMBIGUOUS','same candle target+invalidation must remain ambiguous');

const directModel=JSON.parse(JSON.stringify(model));directModel.scenario.sweep={};directModel.smc={mss:[],displacements:[]};
const directTl={version:'TLR1',paramsHash:'ph2',primary:{state:'BROKEN',stateLabel:'돌파',paramsHash:'ph2',line:{lineId:'L2'},quality:{score:60},breakout:{barIndex:1,time:T0+H,direction:'UP',close:101,linePrice:100,frozenAtr:2},retest:{firstTouchBarIndex:null}}};
const direct=J.createBundle({symbol:'ETHUSDT',timeframe:'1h',model:directModel,trendRetest:directTl,now:T0+2*H});
assert(direct.events.some(e=>e.eventType==='TL_BREAK')&&!direct.events.some(e=>e.eventType==='LIQ_SWEEP'),'TL break must be storable without sweep');
const directHit=J.resolveOutcome(direct.snapshot,null,{referenceCandles:[...directModel.candles,c(T0+2*H,101,106,100,105)],outcomeCandles:[...directModel.candles,c(T0+2*H,101,106,100,105)]},T0+3*H);
assert.equal(directHit.status,'REACHED','retest is not required for DOL reach');

const noEventModel=JSON.parse(JSON.stringify(directModel));noEventModel.scenario.direction='none';
const noEvent=J.createBundle({symbol:'XUSDT',timeframe:'1h',model:noEventModel,trendRetest:null,now:T0+2*H});
assert.equal(noEvent.snapshot.signalState,'NO_SIGNAL');assert.equal(noEvent.outcome.status,'NO_SIGNAL');

const horizonRows=[...model.candles,c(T0+2*H,100,102,99,101)];
for(let i=3;i<=52;i++)horizonRows.push(c(T0+i*H,101,103,99,101));
const hz=J.resolveOutcome({...a,target:{price:200},invalidation:{price:50}},null,{referenceCandles:horizonRows,outcomeCandles:horizonRows},T0+53*H);
for(const k of ['h4','h12','h24','h48'])assert.equal(hz.horizons[k].status,'FINALIZED',k+' horizon should finalize');
assert.equal(hz.status,'EXPIRED','unresolved scenario should expire after h48');

const store=J.createMemoryStore();
let r=J.recordAndResolve({store,snapshot:a,events:bundle.events,referenceCandles:model.candles,outcomeCandles:model.candles,now:T0+2*H});
assert.equal(r.stats.total,1);assert.equal(r.current.outcome.status,'PENDING_REFERENCE');
r=J.recordAndResolve({store,snapshot:b,events:bundle.events,referenceCandles:hitRows,outcomeCandles:hitRows,now:T0+4*H});
assert.equal(r.stats.total,1,'same snapshot must dedupe');assert.equal(r.current.outcome.status,'REACHED');
assert.equal(store.listEvents().length,new Set(bundle.events.map(e=>e.eventFingerprint)).size,'eventFingerprint must dedupe events');

const changedHash=J.createBundle({symbol:'BTCUSDT',timeframe:'1h',model,trendRetest:{...tl,paramsHash:'ph-new',primary:{...tl.primary,paramsHash:'ph-new'}},now:T0+2*H});
assert.notEqual(changedHash.snapshot.id,a.id,'paramsHash change must preserve a separate historical snapshot');
console.log('liquidity event journal v1.1 PASS');
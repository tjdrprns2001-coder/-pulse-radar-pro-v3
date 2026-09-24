'use strict';
const assert=require('assert');
const W=require('../lib/dante/walk-forward.js');
const day=86400000,start=Date.parse('2024-12-20T00:00:00Z');
const candles=Array.from({length:240},(_,i)=>({openTime:start+i*day,closeTime:start+(i+1)*day-1,open:100+i*.1,high:102+i*.1,low:99+i*.1,close:101+i*.1,volume:100,partial:false}));
let riceCalls=0,d256Calls=0;
function rice({candles:c}){riceCalls++;const i=c.length-1,hit=i===225;return{riceBowlState:hit?'PHASE_3_CONFIRMED':'PHASE_2_ACCUMULATION',sequenceId:'q1',paramsHash:'p1'}}
function d256({candles:c}){d256Calls++;const i=c.length-1,hit=i===227||i===228;return{status:hit?'CANDIDATE':'NOT_CONFIRMED',state:hit?'LEAD_CANDIDATE':'NO_SETUP',paramsHash:'p2'}}
const r=W.runWalkForward({symbol:'TEST',candles,riceParams:{emaSeed:{seedBars:224}},d256Params:{emaSeedBars:224},frictionPct:.25,horizons:[5],replayMode:'PREFIX_REFERENCE',riceAnalyze:rice,d256Analyze:d256});
assert.equal(r.replayMode,'PREFIX_REFERENCE');
assert.equal(r.events.length,2,'one Rice transition and one 256 candidate edge');
const riceEvent=r.events.find(x=>x.strategy==='RICE_BOWL'),d256Event=r.events.find(x=>x.strategy==='DANTE_256');
assert.equal(riceEvent.signalIndex,225);
assert.equal(riceEvent.outcome.entryIndex,226,'entry must be next eligible bar');
assert.equal(riceEvent.outcome.entryPrice,candles[226].open,'entry must use next bar open');
assert.equal(d256Event.signalIndex,227,'repeated candidate at 228 must not duplicate');
assert.equal(riceEvent.datasetSplit,'validation');
const gross=W.pct(candles[230].close,candles[226].open);
assert(Math.abs(riceEvent.outcome.horizons['5'].netReturnPct-(gross-.25))<1e-9,'round-trip friction must be deducted');
const s=W.summarize(r.events,[5]);assert.equal(s.total,2);assert.equal(s.byStrategy.RICE_BOWL.n,1);assert.equal(s.bySplit.validation.n,2);
assert(riceCalls>0&&d256Calls>0);
console.log('dante walk-forward PASS');
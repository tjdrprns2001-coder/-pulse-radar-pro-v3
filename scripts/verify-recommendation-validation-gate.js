'use strict';
const assert=require('assert');
const G=require('../lib/coin-scan/recommendation-validation-gate.js');

const row={symbol:'GPSUSDT',state:'CONFIRMED',label:'확정',score:21,reasons:['책 근거 확정'],missing:[],invalidations:[],item:{marketScope:'spot',v3AlignmentPct:40,oi4hChangePct:null,fundingRate:null,trueTakerRatio:null,marketIntelligence:{maxPriceDispersionPct:.2}}};
let r=G.apply(row,{checked:false,stats:{}});
assert.equal(r.state,'WATCH','unchecked promotable row must be capped at WATCH');
assert.equal(r.validationGate.status,'INSUFFICIENT_DATA');

const good={spot:{marketType:'spot',available:true,spreadBps:2,depthUsd:{bid10bps:120000,ask10bps:130000},slippage:{buy:[{notional:10000,slippageBps:2},{notional:50000,slippageBps:8}],sell:[{notional:10000,slippageBps:2},{notional:50000,slippageBps:8}]}}};
r=G.apply({...row,state:'READY'},{checked:true,execution:good,stats:{}});
assert.equal(r.state,'READY');
assert.equal(r.validationGate.status,'VALIDATED');

const bad={spot:{marketType:'spot',available:true,spreadBps:80,depthUsd:{bid10bps:2000,ask10bps:1500},slippage:{buy:[{notional:10000,slippageBps:90}],sell:[{notional:10000,slippageBps:85}]}}};
r=G.apply({...row,state:'RECOMMEND'},{checked:true,execution:bad,stats:{}});
assert.equal(r.state,'EXCLUDE');
assert.equal(r.validationGate.status,'INVALIDATED');
assert(r.validationGate.reasonCodes.includes('ILLIQUID'));

r=G.apply({...row,state:'RECOMMEND',item:{...row.item,marketIntelligence:{maxPriceDispersionPct:4.2}}},{checked:true,execution:good,stats:{}});
assert.equal(r.state,'WAIT','price source conflict must cap to WAIT');
assert(r.validationGate.reasonCodes.includes('PRICE_SOURCE_CONFLICT'));

r=G.apply({...row,state:'RECOMMEND',item:{...row.item,oi4hChangePct:7,fundingRate:.05,trueTakerRatio:1.6}},{checked:true,execution:good,stats:{}});
assert.equal(r.state,'WAIT','crowding must cap recommendation to WAIT');
assert(r.validationGate.reasonCodes.includes('DERIVATIVES_CROWDING'));

const matureNegative={byStatus:{VALIDATED:{horizons:{h24:{evaluatedCount:60}}}},validationLift:{h24:{meanReturnLiftPct:-1.2,positiveRatioLift:-.08}}};
r=G.apply({...row,state:'RECOMMEND'},{checked:true,execution:good,stats:matureNegative});
assert.equal(r.state,'WATCH','mature negative validation lift must stop auto recommendation');
assert(r.validationGate.reasonCodes.includes('VALIDATION_LIFT_NEGATIVE'));

console.log('recommendation validation gate PASS');

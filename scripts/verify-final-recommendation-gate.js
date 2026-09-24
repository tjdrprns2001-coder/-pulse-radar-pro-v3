'use strict';
const assert=require('assert');
const G=require('../lib/coin-scan/recommendation-validation-gate.js');
function row(state='RECOMMEND'){return{symbol:'BTCUSDT',state,label:'추천',score:80,reasons:[],missing:[],invalidations:[],item:{spotListed:true,futuresListed:true,marketIntelligence:{maxPriceDispersionPct:.2},oi4hChangePct:2,fundingRate:.005}}}
const good={spot:{available:true,marketType:'spot',spreadBps:2,depthUsd:{bid10bps:100000,ask10bps:100000},slippage:{buy:[{notional:50000,slippageBps:8}],sell:[{notional:50000,slippageBps:8}]}},futures:{available:true,marketType:'futures',spreadBps:3,depthUsd:{bid10bps:120000,ask10bps:120000},slippage:{buy:[{notional:50000,slippageBps:9}],sell:[{notional:50000,slippageBps:9}]}}};
let x=G.apply(row(),{execution:good,checked:true,stats:{}});assert.equal(x.state,'RECOMMEND');assert.equal(x.validationGate.status,'VALIDATED');
x=G.apply(row(),{execution:null,checked:false,stats:{}});assert.equal(x.state,'WATCH');assert.equal(x.validationGate.status,'INSUFFICIENT_DATA');
const bad={spot:{available:true,marketType:'spot',spreadBps:40,depthUsd:{bid10bps:5000,ask10bps:5000},slippage:{buy:[{notional:10000,slippageBps:60}],sell:[{notional:10000,slippageBps:60}]}}};
x=G.apply(row(),{execution:bad,checked:true,stats:{}});assert.equal(x.state,'EXCLUDE');assert.equal(x.validationGate.status,'INVALIDATED');assert(x.validationGate.reasonCodes.includes('ILLIQUID'));
const conflict=row();conflict.item.marketIntelligence.maxPriceDispersionPct=4.2;x=G.apply(conflict,{execution:good,checked:true,stats:{}});assert.equal(x.state,'WAIT');assert.equal(x.validationGate.status,'CONFLICTED');
const crowd=row();crowd.item.oi4hChangePct=8;crowd.item.fundingRate=.05;x=G.apply(crowd,{execution:good,checked:true,stats:{}});assert.equal(x.state,'WAIT');assert(x.validationGate.reasonCodes.includes('DERIVATIVES_CROWDING'));
const mature={byStatus:{VALIDATED:{horizons:{h24:{evaluatedCount:60}}}},validationLift:{h24:{meanReturnLiftPct:-1,positiveRatioLift:-.05}}};x=G.apply(row(),{execution:good,checked:true,stats:mature});assert.equal(x.state,'WATCH');assert(x.validationGate.reasonCodes.includes('VALIDATION_LIFT_NEGATIVE'));
const b=G.bundle([G.apply(row(),{execution:good,checked:true,stats:{}}),G.apply({...row(),symbol:'ETHUSDT'},{execution:bad,checked:true,stats:{}})],30);assert.equal(b.recommended.length,1);assert.equal(b.excluded.length,1);
console.log('final recommendation validation gate PASS');

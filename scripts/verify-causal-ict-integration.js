'use strict';
const assert=require('assert');
const C=require('../ui/chart/causal-ict-engine.js');
const L=require('../ui/chart/causal-ict-ledger.js');
const A=require('../ui/book-ai/adapter.js');
const R=require('../ui/book-ai/rule-engine.js');
const B=require('../lib/research-backtest-v2/causal-ict-backtest.js');
const P=require('../ui/book-ai/promotion-engine.js');

const rows=Array.from({length:180},(_,i)=>{
  const p=100+Math.sin(i/6)*5+Math.sin(i/17)*3+i*.015;
  return{time:Date.UTC(2026,0,1,0,i),open:p-.2,high:p+1.2,low:p-1.1,close:p,volume:1000+(i%9)*50};
});
const r=C.run(rows),contract=C.validateCausalContracts(r);
assert(contract.pass);

const store=L.createMemoryStore();
const a=L.record({store,symbol:'TESTUSDT',timeframe:'4h',result:{...r,contract},now:1000});
assert.equal(a.prefixInvariant,true);
const b=L.record({store,symbol:'TESTUSDT',timeframe:'4h',result:{...C.run(rows.concat([{time:Date.UTC(2026,0,1,3,1),open:103,high:104,low:102,close:103,volume:1000}])),contract},now:2000});
assert.equal(b.prefixInvariant,true,'appending future bars must keep previous event prefix invariant');
const changed=rows.map(x=>({...x}));changed[30].high+=20;
const c=L.record({store,symbol:'TESTUSDT',timeframe:'4h',result:{...C.run(changed),contract},now:3000});
assert.equal(c.prefixInvariant,false,'changing prior bars must be detected as prefix divergence');

const asOf=Date.now(),adapter=A.adaptBookAiInput({analysisAsOf:asOf,symbol:'TESTUSDT',sources:{causalIct:{data:{...r,contract,observedAt:asOf-1000},observedAt:asOf-1000,version:C.VERSION}}});
assert.equal(adapter.engineSources.causalIct.status,'AVAILABLE');
const rules=R.evaluate(adapter);
assert(rules.evidenceFacts.some(x=>x.factType==='CAUSAL_CONTRACT_PASS'));
assert(rules.evidenceFacts.some(x=>x.factType==='CAUSAL_LONG_STAGE'));

const bt=B.runCausalIctBacktest({rows,costMultipliers:[1,1.5,2]});
assert(bt.stress['1x']&&bt.stress['1.5x']&&bt.stress['2x']);
assert.equal(bt.executionPolicy,'CONFIRMED_CLOSE_SIGNAL_NEXT_OPEN_FILL_STOP_FIRST');
assert.equal(bt.lookaheadSafe,true);

const base={dataState:'live',priceChange24h:2,scanClass:{key:'PRE-SURGE'},v3LongTier:'PASS',v3AlignmentPct:75,structure:'bullish',oi4hChangePct:2,trueTakerRatio:1.4,volumeAcceleration15m:2,xoiProfile:{available:true},tfState:{'1h':{bias:'up'},'15m':{bias:'up'}},v3:{causalIct:{available:true,primaryTf:'4h',contractPass:true,timeframes:{'4h':{contractPass:true,sequence:{long:{stage:'WAIT_FVG'}}}}}}};
const book={bookSetups:[{ruleId:'LIQUIDITY_SWEEP_RECLAIM',status:'CONFIRMED',trustedEvidenceEventIds:['E1'],evidenceEventIds:['E1']}],bookEvidence:{normalizedScore:40}};
let pr=P.evaluate({item:base,book});assert.equal(pr.state,'CONFIRMED','causal sequence before revisit must block final recommendation');
base.v3.causalIct.timeframes['4h'].sequence.long.stage='REVISIT';pr=P.evaluate({item:base,book});assert.equal(pr.state,'RECOMMEND','causal revisit can satisfy final recommendation gate');
base.v3.causalIct.contractPass=false;pr=P.evaluate({item:base,book});assert.equal(pr.state,'EXCLUDE','causal timing violation must hard-block');
console.log('causal ICT integration PASS');
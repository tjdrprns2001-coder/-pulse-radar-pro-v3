'use strict';
const assert=require('assert');
const P=require('../ui/book-ai/promotion-engine.js');

const base={
  dataState:'live',priceChange24h:2.1,scanClass:{key:'PRE-SURGE'},v3LongTier:'PASS',v3AlignmentPct:76,
  structure:'bullish',oi4hChangePct:3.2,trueTakerRatio:1.46,volumeAcceleration15m:2.2,
  xoiProfile:{available:true,positiveBreadth:2},tfState:{'1h':{bias:'up'},'15m':{bias:'up'}},tradeSignal:{level:'매수 후보',invalidations:[]}
};
let r=P.evaluate({item:base});
assert.equal(r.state,'READY','Scanner alone must stop at READY');
assert.equal(r.confirmed,false);

const book={bookSetups:[{ruleId:'LIQUIDITY_SWEEP_RECLAIM',status:'CONFIRMED',trustedEvidenceEventIds:['E1','E2']}],bookEvidence:{normalizedScore:55}};
r=P.evaluate({item:base,book,priorState:'READY'});
assert.equal(r.state,'RECOMMEND','CONFIRMED + all final gates should promote to RECOMMEND');
assert.equal(r.transition,'READY→RECOMMEND');
assert.equal(r.confirmed,true);

r=P.evaluate({item:{...base,trueTakerRatio:null},book});
assert.equal(r.state,'CONFIRMED','missing taker must block final recommendation');
assert(r.missing.some(x=>x.includes('최종 OI/taker/RVOL')));

r=P.evaluate({item:{...base,tfState:{'1h':{bias:'down'},'15m':{bias:'up'}}},book});
assert.equal(r.state,'CONFIRMED','lower-TF weakness must block final recommendation');
assert(r.invalidations.some(x=>x.includes('1H/15m 약세')));


r=P.evaluate({item:{...base,v3AlignmentPct:40},book});
assert.equal(r.state,'WATCH','Book confirmation must not bypass weak HTF alignment / Scanner READY core');
assert.equal(r.confirmed,true,'Book evidence confirmation should still be preserved separately');
assert(r.reasons.some(x=>x.includes('책 근거 확정')));
assert(r.missing.some(x=>x.includes('시장 승격용 Scanner READY 조건')));

r=P.evaluate({item:{...base,priceChange24h:15},book});
assert.equal(r.state,'EXCLUDE','overextended price must hard-block');
console.log('recommendation promotion engine PASS');

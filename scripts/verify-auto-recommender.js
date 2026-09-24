'use strict';
const assert=require('assert');
const Auto=require('../lib/coin-scan/auto-recommender.js');

const base={
  dataState:'live',quoteVolume24h:50_000_000,candidateScore:76,priceChange24h:2.1,
  scanClass:{key:'PRE-SURGE'},v2Type:'A-pre',v3LongTier:'PASS',v3AlignmentPct:76,
  oi4hChangePct:3.2,trueTakerRatio:1.46,volumeAcceleration15m:2.2,
  structure:'bullish',tradeSignal:{level:'매수 후보',invalidations:[]},
  preSurge:{label:'가능성 높음'},xoiProfile:{available:true,positiveBreadth:2,leaderChangePct:2.8}
};
const rows=[
  {...base,symbol:'BESTUSDT',spotListed:true,futuresListed:true,marketScope:'spot+futures'},
  {...base,symbol:'WATCHUSDT',spotListed:true,futuresListed:true,marketScope:'spot+futures',v3LongTier:'SOFT_FAIL',v3AlignmentPct:58,oi4hChangePct:null,trueTakerRatio:null,tradeSignal:{level:'관찰',invalidations:[]},preSurge:{label:'관찰'}},
  {...base,symbol:'RUNUSDT',spotListed:true,futuresListed:true,marketScope:'spot+futures',priceChange24h:15},
  {...base,symbol:'RISKUSDT',spotListed:true,futuresListed:true,marketScope:'spot+futures',scanClass:{key:'DISTRIBUTION-RISK'},tradeSignal:{level:'제외',invalidations:['분배 위험']}}
];

const best=Auto.evaluate(rows[0]);
assert.equal(best.state,'READY','scanner-only recommender must stop at READY');
assert(best.score>=72);
assert(best.reasons.some(x=>x.includes('PRE-SURGE')));
const watch=Auto.evaluate(rows[1]);
assert(['WATCH','WAIT'].includes(watch.state),'incomplete scanner gates must remain WATCH/WAIT');
assert(watch.missing.length>0);
assert.equal(Auto.evaluate(rows[2]).state,'EXCLUDE');
assert.equal(Auto.evaluate(rows[3]).state,'EXCLUDE');

const sameState=[{...base,symbol:'SPOTONLYUSDT',spotListed:true,futuresListed:false,marketScope:'spot'},{...base,symbol:'PERPUSDT',spotListed:false,futuresListed:true,marketScope:'futures'}];
const ordered=Auto.recommend(sameState,2);assert.equal(ordered[0].symbol,'PERPUSDT','futures-listed coin must rank ahead of spot-only peer in same state');assert(Auto.marketPriority(ordered[0].item)>Auto.marketPriority(ordered[1].item));
const out=Auto.summary(rows,5);
assert.equal(out.ready[0].symbol,'BESTUSDT');
assert.equal(out.recommended.length,0,'server scanner must not emit RECOMMEND without Book AI confirmation');
assert(out.excluded.some(x=>x.symbol==='RUNUSDT'));
console.log('auto recommender PASS');

'use strict';
const assert=require('assert');
const W=require('../ui/book-ai/watchlist-selector.js');
const base={dataState:'live',quoteVolume24h:20_000_000,candidateScore:70,v3AlignmentPct:70,v3Rvol:{ignition15m:{value:2}},oi4hChangePct:2,trueTakerRatio:1.3};
const rows=[
 {...base,symbol:'QUIETUSDT',priceChange24h:2,scanClass:{key:'PRE-SURGE'},v2Type:'A-pre',v3LongTier:'PASS',marketScope:'spot+futures',spotListed:true,futuresListed:true,marketIntelligence:{exchangeCount:7,spotCount:5,derivativesCount:4,maxPriceDispersionPct:.23,spotFuturesBasisPct:.04}},
 {...base,symbol:'RUNUSDT',priceChange24h:14,scanClass:{key:'PRE-SURGE'},v2Type:'A',v3LongTier:'PASS'},
 {...base,symbol:'RISKUSDT',priceChange24h:1,scanClass:{key:'PUMP-RISK'},v2Type:'A-pre',v3LongTier:'PASS'},
 {...base,symbol:'ACCUSDT',priceChange24h:-1,scanClass:{key:'ACCUMULATION-PRE'},v2Type:'A',v3LongTier:'SOFT_FAIL'}
];
const out=W.select(rows,8);
assert.deepEqual(out.map(x=>x.symbol),['QUIETUSDT','ACCUSDT']);
assert(out[0].watchScore>out[1].watchScore);
assert(out[0].reasons.some(x=>x.includes('덜 진행')));
assert.equal(out[0].marketScope,'spot+futures');
assert.equal(out[0].crossMarket.exchangeCount,7);
assert.equal(out[0].crossMarket.derivativesCount,4);
assert.equal(W.score(rows[1]),null);
assert.equal(W.score(rows[2]),null);
console.log('book ai watchlist selector PASS');
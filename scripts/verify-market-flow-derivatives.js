const assert=require('assert');
const d=require('../lib/market-flow/derivatives');
assert.strictEqual(d.finite(null),null);assert.strictEqual(d.finite(''),null);assert.strictEqual(d.finite('12.5'),12.5);
const n=d.normalizeDerivativesEvidence({symbol:'SOLUSDT',openInterest:'1000',markPrice:'150',fundingRate:'0.0002',longShortRatio:'1.4',takerBuySellRatio:'1.25',updatedAt:100000},'Binance',{now:100500});
assert.strictEqual(n.baseAsset,'SOL');assert.strictEqual(n.openInterest,1000);assert.strictEqual(n.openInterestUsd,150000);assert.strictEqual(n.fundingRate,0.0002);assert.strictEqual(n.longShortRatio,1.4);assert.strictEqual(n.takerBuySellRatio,1.25);
const missing=d.normalizeDerivativesEvidence({symbol:'ABCUSDT',openInterest:null,fundingRate:null},'Binance',{now:1000});assert.strictEqual(missing.openInterest,null);assert.strictEqual(missing.openInterestUsd,null);assert.strictEqual(missing.fundingRate,null);
const h=[{ts:0,value:100},{ts:300000,value:120},{ts:900000,value:150}];const delta=d.deriveOiChanges(h,180,900000);assert(Math.abs(delta.openInterestChange5m-.5)<1e-9);assert(Math.abs(delta.openInterestChange15m-.8)<1e-9);
const crowd=d.fundingCrowding(.001,[0,.0001,-.0001,.00005,-.00005]);assert(crowd.crowdingScore>0);assert(Number.isFinite(crowd.fundingZScore));assert.strictEqual(d.isFresh({updatedAt:1000},1100,500),true);assert.strictEqual(d.isFresh({updatedAt:1000},2000,500),false);
console.log('market flow derivatives PASS');
'use strict';
const assert=require('assert');
const V=require('../lib/coin-scan/market-validation-engine.js');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const handler=require('../api/coin-scan.js');

const D=1_800_000_000_000;
function input(over={}){
 const item={symbol:'BTCUSDT',updatedAt:D-1000,marketScope:'spot+futures',spotListed:true,futuresListed:true,direction:'long',tradeSignal:{level:'관찰'},v3LongTier:'PASS',v3Invalidation:false,priceChange24h:1.2,oi4hChangePct:2,oi8hChangePct:3,trueTakerRatio:1.1,fundingRate:.005,spotFuturesBasisPct:.05,...(over.item||{})};
 const intelligence={updatedAt:D-500,execution:{updatedAt:D-400,spot:{available:true,observedAt:D-400,bid:99.99,ask:100.01,mid:100,spreadBps:2,depthUsd:{bid10bps:120000,ask10bps:130000,bid25bps:250000,ask25bps:260000},slippage:{buy:[{notional:10000,avgPrice:100.03,slippageBps:3},{notional:50000,avgPrice:100.08,slippageBps:8}],sell:[{notional:10000,avgPrice:99.97,slippageBps:3},{notional:50000,avgPrice:99.92,slippageBps:8}]}},futures:{available:true,observedAt:D-400,bid:100.04,ask:100.06,mid:100.05,spreadBps:2,depthUsd:{bid10bps:150000,ask10bps:140000,bid25bps:300000,ask25bps:280000},slippage:{buy:[{notional:10000,avgPrice:100.08,slippageBps:3},{notional:50000,avgPrice:100.13,slippageBps:8}],sell:[{notional:10000,avgPrice:100.02,slippageBps:3},{notional:50000,avgPrice:99.97,slippageBps:8}]}}},cex:{exchangeCount:3,spotCount:2,derivativesCount:2,maxPriceDispersionPct:.2,spotFuturesBasisPct:.05,sources:[
  {name:'binance',marketType:'spot',price:100,quoteVolume24h:1e7},
  {name:'bybit',marketType:'spot',price:100.1,quoteVolume24h:2e6},
  {name:'binance',marketType:'swap',price:100.05,quoteVolume24h:2e7},
  {name:'okx',marketType:'swap',price:100.08,quoteVolume24h:3e6}
 ]},indicators:{available:true,summary:{sourceCount:3,h1Bull:7,h4Bull:8},timeframes:{'1h':{rsiMedian:55},'4h':{rsiMedian:58}}},dex:{available:true,pairCount:2,liquidityUsd:1e6,contractVerification:{verified:true,status:'CROSS_PAIR_MATCH'}},news:{items:[{id:'n1',title:'BTC upgrade',source:'official',publishedAt:D-60000,url:'https://example.com'}]},events:{items:[],newsDerived:[]},wallets:{provider:'whale-alert',items:[]},walletVerification:{verifiedAttributions:0,status:'N/A',tokenContractVerified:true},...(over.intelligence||{})};
 return{symbol:'BTCUSDT',item,intelligence,decisionTimestamp:over.decisionTimestamp??D,capturedAt:D};
}
let r=V.validate(input());
assert.equal(r.validationStatus,'VALIDATED');
assert(r.evidence.some(x=>x.id==='cross.price'&&x.stance==='supportive'));
assert(r.evidence.some(x=>x.id==='derivatives.crowding'&&x.meta?.rule==='risk_filter_only'));
assert.equal(r.gates.find(x=>x.id==='execution').pass,true,'execution gate must pass with tight spread and sufficient depth');
assert(r.evidence.some(x=>x.id==='execution.liquidity'&&x.stance==='supportive'));
assert(V.replay(r.snapshot).reproducible,'stored canonical snapshot must replay identically');

r=V.validate(input({intelligence:{cex:{exchangeCount:2,spotCount:1,derivativesCount:1,maxPriceDispersionPct:5,spotFuturesBasisPct:.1,sources:[
 {name:'binance',marketType:'spot',price:100},{name:'binance',marketType:'swap',price:105},{name:'okx',marketType:'swap',price:105.2}
]}}}));
assert.equal(r.validationStatus,'CONFLICTED');
assert(r.reasonCodes.includes('CONFLICTED'));

r=V.validate(input({intelligence:{execution:{updatedAt:D-400,spot:{available:true,observedAt:D-400,bid:99,ask:101,mid:100,spreadBps:200,depthUsd:{bid10bps:1000,ask10bps:1000},slippage:{buy:[{notional:10000,avgPrice:101,slippageBps:100}],sell:[{notional:10000,avgPrice:99,slippageBps:100}]}},futures:{available:false}}}}));
assert.equal(r.validationStatus,'CONFLICTED');
assert(r.reasonCodes.includes('ILLIQUID'));
assert.equal(r.gates.find(x=>x.id==='execution').pass,false);

r=V.validate(input({item:{updatedAt:D-700000},intelligence:{updatedAt:D-700000}}));
assert.equal(r.validationStatus,'STALE');

r=V.validate(input({intelligence:{cex:{exchangeCount:1,spotCount:1,derivativesCount:0,maxPriceDispersionPct:.1,sources:[{name:'binance',marketType:'spot',price:100}]}}}));
assert.equal(r.validationStatus,'INSUFFICIENT_DATA');
assert(r.reasonCodes.includes('SINGLE_SOURCE'));

r=V.validate(input({item:{v3Invalidation:true}}));
assert.equal(r.validationStatus,'INVALIDATED');

r=V.validate(input({intelligence:{news:{items:[{id:'future',title:'future edit',source:'news',publishedAt:D+1000,url:'https://example.com/f'}]}}}));
assert.equal(r.validationStatus,'INVALIDATED');
assert(r.reasonCodes.includes('LOOKAHEAD_RISK'));
assert(r.dataQuality.lookaheadEvidence.includes('catalyst.news'));

const crowd=V.validate(input({item:{oi4hChangePct:8,fundingRate:.05,trueTakerRatio:1.8}}));
const crowdEv=crowd.evidence.find(x=>x.id==='derivatives.crowding');
assert.equal(crowdEv.stance,'contradictory');
assert(crowdEv.reason.includes('crowding'),'OI+funding must be labeled as crowding risk, not bullish confirmation');

(async()=>{
 const store=createMemoryStore();assert(await store.putMarketValidationRaw(r.snapshotId,{id:'raw'}));assert(await store.putMarketValidationNormalized(r.snapshotId,{id:'norm'}));assert(await store.putMarketValidationSnapshot(r.snapshotId,r.snapshot));assert.equal(await store.putMarketValidationSnapshot(r.snapshotId,r.snapshot),false);const saved=await store.getMarketValidationSnapshot(r.snapshotId);assert.equal(saved.snapshotId,r.snapshotId);assert.equal((await store.listMarketValidationSnapshots()).length,1);assert((await store.getMarketValidationRaw(r.snapshotId)).id==='raw');assert((await store.getMarketValidationNormalized(r.snapshotId)).id==='norm');

 const service={
  async getMarketValidation(symbol){return{status:'ok',mode:'validation',symbol,validation:{validationStatus:'VALIDATED'}}},
  async replayMarketValidation(id){return{id,reproducible:true}},
  async getMarketValidationSnapshot(id){return{id}},
  async listMarketValidationSnapshots(){return[]},
  async evaluateMarketValidationPerformance(){return{attempted:1,evaluated:1}},
  async getMarketValidationStats(){return{version:'MARKET_VALIDATION_STATS_v1',overall:{sampleCount:1,horizons:{}},byStatus:{},validationLift:{},falseRejection:{}}}
 };
 function res(){return{code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return v}}}
 let out=res();await handler({query:{mode:'validation',symbol:'BTCUSDT'}},out,{service});assert.equal(out.code,200);assert.equal(out.body.mode,'validation');
 out=res();await handler({query:{mode:'validation-snapshots',action:'replay',id:'x'}},out,{service});assert.equal(out.code,200);assert.equal(out.body.replay.reproducible,true);
 out=res();await handler({query:{mode:'validation-performance',action:'evaluate'}},out,{service});assert.equal(out.code,200);assert.equal(out.body.evaluation.evaluated,1);
 out=res();await handler({query:{mode:'validation-performance',action:'stats'}},out,{service});assert.equal(out.code,200);assert.equal(out.body.stats.overall.sampleCount,1);
 console.log('market validation PASS');
})().catch(e=>{console.error(e);process.exit(1)});

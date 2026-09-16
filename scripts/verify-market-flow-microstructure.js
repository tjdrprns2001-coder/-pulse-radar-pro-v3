const assert=require('assert');
const m=require('../lib/market-flow/microstructure');
const book=m.bookMetrics({bids:[[100,2],[99,1]],asks:[[101,1],[102,2]],depthLevels:2});
assert.strictEqual(book.bidDepthUsd,299);assert.strictEqual(book.askDepthUsd,305);assert(Math.abs(book.bookImbalance-((299-305)/(299+305)))<1e-12);assert(book.topSpreadBps>0);
const empty=m.bookMetrics({bids:[],asks:[]});assert.strictEqual(empty.bookImbalance,null);assert.strictEqual(empty.topSpreadBps,null);
const trades=m.tradeMetrics([{side:'buy',price:100,size:2},{side:'sell',price:100,size:1}]);assert.strictEqual(trades.tradeBuyUsd,200);assert.strictEqual(trades.tradeSellUsd,100);assert(Math.abs(trades.tradeImbalance-(1/3))<1e-12);
const n=m.normalizeMicrostructureEvidence({symbol:'SOLUSDT',bids:[[100,2]],asks:[[101,2]],trades:[],updatedAt:1000},'Binance',{now:1100,sampleWindowMs:15000});assert.strictEqual(n.baseAsset,'SOL');assert.strictEqual(n.sampleWindowMs,15000);assert.strictEqual(m.isFresh(n,1200,1000),true);assert.strictEqual(m.isFresh(n,5000,1000),false);
console.log('market flow microstructure PASS');
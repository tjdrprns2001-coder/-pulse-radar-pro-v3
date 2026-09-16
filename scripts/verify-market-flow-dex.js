const assert=require('assert');
const dex=require('../lib/market-flow/dex');

let x=dex.estimateSideUsd(1000,30,10);
assert.equal(Math.round(x.buyUsdEstimate),750);
assert.equal(Math.round(x.sellUsdEstimate),250);
assert.equal(Math.round(x.netBuyUsdEstimate),500);
assert.equal(x.estimated,true);
assert.equal(dex.estimateSideUsd(1000,null,10).buyUsdEstimate,null);

const r=dex.normalizeDexMarket({chain:'solana',venue:'raydium',pairAddress:'pair',tokenAddress:'mint',symbol:'BONK / SOL',baseAsset:'BONK',quoteAsset:'SOL',liquidityUsd:100000,volume5mUsd:5000,volume1hUsd:20000,volume24hUsd:200000,buys5m:30,sells5m:10,tx5m:40,sourceConfidence:80},'dexscreener');
assert.equal(r.chain,'solana');
assert.equal(r.buyUsdEstimate,3750);
assert.equal(r.netBuyUsdEstimate,2500);
assert(r.activityScore>=0&&r.activityScore<=100);
assert.equal(r.estimated,true);
console.log('market flow dex PASS');
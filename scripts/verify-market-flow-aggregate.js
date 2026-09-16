const assert=require('assert');
const agg=require('../lib/market-flow/aggregate');
const dexFlows=[
 {chain:'solana',baseAsset:'BONK',symbol:'BONK / SOL',netBuyUsdEstimate:5000,volume1hUsd:10000,activityScore:70,sourceConfidence:80},
 {chain:'ethereum',baseAsset:'UNI',symbol:'UNI / USDC',netBuyUsdEstimate:-2000,volume1hUsd:5000,activityScore:50,sourceConfidence:80}
];
const cexFlows=[
 {venue:'Binance',baseAsset:'BONK',quoteAsset:'USDT',quoteVolumeUsd:30000,priceUsd:.01,sourceConfidence:95},
 {venue:'OKX',baseAsset:'BONK',quoteAsset:'USDT',quoteVolumeUsd:10000,priceUsd:.0101,sourceConfidence:90},
 {venue:'Binance',baseAsset:'UNI',quoteAsset:'USDT',quoteVolumeUsd:20000,priceUsd:7,sourceConfidence:95}
];
const out=agg.aggregateMarketFlow({dexFlows,cexFlows,themeForMarket:m=>m.baseAsset==='BONK'?'MEME':'DeFi'});
assert.equal(out.tokenFlows.length,2);
const meme=out.themeFlows.find(x=>x.theme==='MEME');assert(meme);assert(meme.dexActivityShare>=0&&meme.dexActivityShare<=1);assert(meme.cexActivityShare>=0&&meme.cexActivityShare<=1);assert(meme.rotationScore>=0&&meme.rotationScore<=100);assert(meme.concentrationShare>=0&&meme.concentrationShare<=1);
assert(meme.activeMarketCount>=1);assert.equal(typeof meme.breadth,'number');
console.log('market flow aggregate PASS');
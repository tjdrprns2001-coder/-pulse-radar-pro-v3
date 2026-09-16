const assert=require('assert');
const api=require('../api/market-flow');
const p=api._buildFrom({
  providerHealth:{dexscreener:'live',binance:'live'},
  dexFlows:[{baseAsset:'SOL',chain:'solana',venue:'raydium',volume5mUsd:120000,volume1hUsd:300000,buys5m:80,sells5m:20,liquidityUsd:900000,liquidityImpulse:.12,sourceConfidence:80}],
  cexFlows:[{baseAsset:'SOL',venue:'Binance',marketType:'spot',quoteVolumeUsd:1000000},{baseAsset:'SOL',venue:'OKX',marketType:'spot',quoteVolumeUsd:500000}],
  liveRows:[{baseAsset:'SOL',venue:'Binance',marketType:'spot',change1m:.4,volumeDelta1m:300000,volumeDelta5m:700000}],
  historyByAsset:{SOL:{volume1m:[100000,110000,90000],volume5m:[250000,260000,240000]}},
  onchainByAsset:{SOL:{netFlow1hUsd:250000,confidence:75}},
  onchainThemeFlows:[]
});
assert(Array.isArray(p.coinFlows));
assert(p.coinFlows.some(x=>x.baseAsset==='SOL'));
const sol=p.coinFlows.find(x=>x.baseAsset==='SOL');
assert(sol.anomalyScore>=0&&sol.anomalyScore<=100);
assert(sol.volumeAnomaly1m>1);
assert(sol.volumeAnomaly5m>1);
assert(sol.onchainNetFlowUsd>0);
assert(sol.evidenceSourceCount>=2);
assert(['WATCH','PRE-SURGE','SURGE','RISK'].includes(sol.signal));
assert(p.coinFlowCoverage&&p.coinFlowCoverage.coins>=1);
assert(p.coinFlowCoverage.altcoins>=1);
assert(p.coinFlowCoverage.highConfidence>=0);
assert(Array.isArray(api._searchTerms)&&api._searchTerms.length>=12);
assert.strictEqual(typeof api._chunk,'function');
console.log('altcoin flow api PASS');

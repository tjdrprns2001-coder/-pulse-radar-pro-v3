const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCoinFlows}=require('../lib/market-flow/coin-anomaly');

function flow(extra={}){
  return buildCoinFlows({
    dexFlows:[{baseAsset:'ABC',venue:'dex',volume5mUsd:300000,volume1hUsd:600000,buys5m:80,sells5m:20,liquidityUsd:200000,sourceConfidence:90,...extra.dex}],
    cexFlows:[
      {baseAsset:'ABC',venue:'Binance',marketType:'spot',quoteVolumeUsd:2000000},
      {baseAsset:'ABC',venue:'OKX',marketType:'spot',quoteVolumeUsd:1500000}
    ],
    liveRows:[{baseAsset:'ABC',venue:'Binance',marketType:'spot',change5m:.4,volumeDelta5m:300000}],
    derivativesFlows:extra.derivativesFlows||[],
    microstructureFlows:extra.microstructureFlows||[],
    historyByAsset:{ABC:{volume5m:[80000,90000,100000]}},
    themeForAsset:()=> 'Other / Unclassified'
  })[0];
}

test('PRE-SURGE requires abnormal volume plus a flow confirmation',()=>{
  const r=flow({dex:{buys5m:50,sells5m:50,liquidityImpulse:0}});
  assert.notEqual(r.signal,'PRE-SURGE');
  assert.equal(r.preSurgeGate?.volume,true);
  assert.equal(r.preSurgeGate?.flowConfirmation,false);
});

test('fresh buy pressure can satisfy flow confirmation',()=>{
  const r=flow({dex:{buys5m:80,sells5m:20,liquidityImpulse:0}});
  assert.equal(r.preSurgeGate?.volume,true);
  assert.equal(r.preSurgeGate?.flowConfirmation,true);
});

test('stale derivatives and microstructure never satisfy fresh cross-family evidence',()=>{
  const r=flow({
    derivativesFlows:[{baseAsset:'ABC',venue:'Binance',openInterestChange5m:.8,confidence:95,freshnessMs:300000}],
    microstructureFlows:[{baseAsset:'ABC',venue:'Binance',bookImbalance:.8,confidence:95,freshnessMs:120000}]
  });
  assert.equal(r.preSurgeGate?.freshCrossFamily,false);
});

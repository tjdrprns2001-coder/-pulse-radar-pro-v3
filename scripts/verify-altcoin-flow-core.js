const assert=require('assert');
const {buildCoinFlows,isAltcoinAsset}=require('../lib/market-flow/coin-anomaly');

assert.strictEqual(isAltcoinAsset('BTC'),false);
assert.strictEqual(isAltcoinAsset('ETH'),false);
assert.strictEqual(isAltcoinAsset('USDT'),false);
assert.strictEqual(isAltcoinAsset('SOL'),true);

const rows=buildCoinFlows({
  dexFlows:[{baseAsset:'SOL',volume5mUsd:500000,volume1hUsd:1000000,buyShare:.72,netBuyUsdEstimate:180000,liquidityImpulse:.25,activityScore:80}],
  cexFlows:[
    {baseAsset:'SOL',venue:'Binance',marketType:'spot',quoteVolumeUsd:1500000},
    {baseAsset:'SOL',venue:'Binance',marketType:'futures',quoteVolumeUsd:2200000},
    {baseAsset:'SOL',venue:'OKX',marketType:'spot',quoteVolumeUsd:800000}
  ],
  liveRows:[
    {baseAsset:'SOL',marketType:'spot',change1m:.4,change5m:1.2,quoteVolumeUsd:1500000,volumeDelta1m:400000,volumeDelta5m:900000,liquidityUsd:5000000},
    {baseAsset:'SOL',marketType:'futures',change1m:.5,change5m:1.4,quoteVolumeUsd:2200000,volumeDelta1m:600000,volumeDelta5m:1200000}
  ],
  historyByAsset:{SOL:{volume1m:[100000,110000,90000,120000,100000],volume5m:[300000,320000,280000,310000,300000],volume15m:[700000,680000,710000,690000]}},
  onchainByAsset:{SOL:{netFlow1hUsd:250000,confidence:70}},
  themeForAsset:()=> 'L1'
});
assert.strictEqual(rows.length,1);
const sol=rows[0];
assert(sol.anomalyScore>=0&&sol.anomalyScore<=100);
assert(sol.volumeAnomaly1m>1);
assert(sol.volumeAnomaly5m>1);
assert(sol.dexBuyShare>.5);
assert(sol.cexVenueBreadth>=2);
assert.strictEqual(sol.spotFuturesAligned,true);
assert(['WATCH','PRE-SURGE','SURGE','RISK'].includes(sol.signal));
assert(sol.confidence>0);

const single=buildCoinFlows({dexFlows:[{baseAsset:'ABC',volume5mUsd:100000,buyShare:.9,netBuyUsdEstimate:90000}],cexFlows:[],liveRows:[],historyByAsset:{},onchainByAsset:{},themeForAsset:()=> 'MEME'}).find(x=>x.baseAsset==='ABC');
assert(single);
assert.strictEqual(['PRE-SURGE','SURGE'].includes(single.signal),false);

const nullRow=buildCoinFlows({dexFlows:[{baseAsset:'XYZ',volume5mUsd:null,buyShare:null}],cexFlows:[],liveRows:[],historyByAsset:{},onchainByAsset:{},themeForAsset:()=> 'Other / Unclassified'}).find(x=>x.baseAsset==='XYZ');
assert.strictEqual(nullRow.volumeAnomaly1m,null);
assert.strictEqual(nullRow.volumeAnomaly5m,null);

console.log('altcoin flow core PASS');

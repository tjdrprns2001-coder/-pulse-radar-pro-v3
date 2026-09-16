const assert=require('assert');
const fs=require('fs');
const anomaly=require('../lib/market-flow/coin-anomaly');
const themes=require('../ui/radar-themes.js');

// Common wrapped majors and stablecoins must not leak into ALTCOIN mode.
for(const asset of ['BTC','ETH','WBTC','WETH','USDT','USDC','USDP','GUSD','TUSD','DAI']){
  assert.strictEqual(anomaly.isAltcoinAsset(asset),false,`${asset} must be excluded from altcoin rankings`);
}
assert.strictEqual(anomaly.isAltcoinAsset('SOL'),true);
assert.strictEqual(anomaly.isAltcoinAsset('LINK'),true);

// A tiny side pool must not turn a liquid, multi-venue coin into RISK.
const liquid=anomaly.buildCoinFlows({
  dexFlows:[
    {baseAsset:'SOL',venue:'raydium',liquidityUsd:5_000_000,volume5mUsd:500_000,volume1hUsd:2_000_000,buyShare:.68,sourceConfidence:85},
    {baseAsset:'SOL',venue:'tiny',liquidityUsd:900,volume5mUsd:200,volume1hUsd:1000,buyShare:.90,sourceConfidence:70}
  ],
  cexFlows:[
    {baseAsset:'SOL',venue:'Binance',marketType:'spot',quoteVolumeUsd:9_000_000},
    {baseAsset:'SOL',venue:'OKX',marketType:'spot',quoteVolumeUsd:1_000_000}
  ],
  liveRows:[{baseAsset:'SOL',marketType:'spot',change1m:.5,volumeDelta1m:300_000,volumeDelta5m:900_000}],
  historyByAsset:{SOL:{volume1m:[100_000,110_000,95_000],volume5m:[300_000,310_000,290_000]}},
  themeForAsset:()=> 'L1'
})[0];
assert.notStrictEqual(liquid.signal,'RISK','dust pools should not dominate asset-level risk');

// Concentration must reflect actual venue volume, not just inverse venue count.
assert(liquid.flowConcentration>0.85&&liquid.flowConcentration<0.95,`expected ~90% venue concentration, got ${liquid.flowConcentration}`);

// One venue alone cannot promote PRE-SURGE/SURGE even with spot+futures activity.
const oneVenue=anomaly.buildCoinFlows({
  cexFlows:[
    {baseAsset:'ABC',venue:'Binance',marketType:'spot',quoteVolumeUsd:8_000_000},
    {baseAsset:'ABC',venue:'Binance',marketType:'futures',quoteVolumeUsd:12_000_000}
  ],
  liveRows:[
    {baseAsset:'ABC',marketType:'spot',change1m:1.8,volumeDelta1m:2_000_000,volumeDelta5m:5_000_000},
    {baseAsset:'ABC',marketType:'futures',change1m:2.0,volumeDelta1m:3_000_000,volumeDelta5m:7_000_000}
  ],
  historyByAsset:{ABC:{volume1m:[200_000,220_000,210_000],volume5m:[800_000,850_000,780_000]}},
  themeForAsset:()=> 'Other / Unclassified'
})[0];
assert.strictEqual(['PRE-SURGE','SURGE'].includes(oneVenue.signal),false,'single venue must not promote anomaly state');

// Normal 1x activity should stay low; anomaly score should not start from a high neutral baseline.
const normal=anomaly.buildCoinFlows({
  liveRows:[{baseAsset:'XYZ',marketType:'spot',change1m:.1,volumeDelta1m:100_000,volumeDelta5m:500_000}],
  historyByAsset:{XYZ:{volume1m:[100_000,100_000,100_000],volume5m:[500_000,500_000,500_000]}},
  themeForAsset:()=> 'Other / Unclassified'
})[0];
assert(normal.anomalyScore<=25,`1x baseline activity should score low, got ${normal.anomalyScore}`);

// Missing theme metrics must remain null, never fake zero.
const ai=themes.aggregateThemes([{primaryTheme:'AI',label:'WATCH',radarScore:null,change1m:null,change5m:null,volumeImpulse1m:null,buySellImbalance:null}]).themes.find(x=>x.theme==='AI');
assert.strictEqual(ai.avgRadarScore,null);
assert.strictEqual(ai.avgChange1m,null);
assert.strictEqual(ai.avgChange5m,null);

// Browser UI must preserve missing percentages and share live radar rows with the altcoin detector.
const app=fs.readFileSync('ui/radar-app.js','utf8');
assert(app.includes('window.PulseRadarLiveRows'),'live market bridge missing');
assert(/const pct=n=>\{n=.*?n==null/s.test(app),'pct formatter must explicitly preserve null');
assert(/const rawPct=n=>\{n=.*?n==null/s.test(app),'rawPct formatter must explicitly preserve null');

const altUi=fs.readFileSync('ui/radar-altcoin-flow.js','utf8');
assert(altUi.includes('PulseRadarLiveRows'),'altcoin radar must consume live rows');
assert(altUi.includes('visibilitychange'),'altcoin polling should pause/resume with page visibility');

console.log('altcoin flow polish PASS');

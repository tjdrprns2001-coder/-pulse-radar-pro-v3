const assert=require('assert');
const themes=require('../ui/radar-themes.js');

const known=[
  ['FETUSDT','AI'],['DOGEUSDT','MEME'],['UNIUSDT','DeFi'],['ONDOUSDT','RWA'],
  ['SOLUSDT','L1'],['ARBUSDT','L2'],['IMXUSDT','Gaming'],['RENDERUSDT','DePIN'],['XMRUSDT','Privacy']
];
for(const [symbol,theme] of known){
  const c=themes.classifyMarket({symbol,baseAsset:symbol.replace('USDT','')});
  assert.equal(c.theme,theme,`${symbol} should classify ${theme}`);
  assert(c.confidence>=80,'known registry classification should be high confidence');
}
const unknown=themes.classifyMarket({symbol:'ZZZUSDT',baseAsset:'ZZZ'});
assert.equal(unknown.theme,'Other / Unclassified');

const markets=[
  {symbol:'FETUSDT',baseAsset:'FET',label:'PRE-SURGE',radarScore:70,volumeImpulse1m:2.5,buySellImbalance:.5,change1m:2,change5m:5,liquidityUsd:0},
  {symbol:'TAOUSDT',baseAsset:'TAO',label:'SURGE',radarScore:82,volumeImpulse1m:3,buySellImbalance:.35,change1m:4,change5m:9,liquidityUsd:0},
  {symbol:'DOGEUSDT',baseAsset:'DOGE',label:'RISK',radarScore:42,volumeImpulse1m:1.2,buySellImbalance:.1,change1m:1,change5m:3,liquidityUsd:0}
];
const agg=themes.aggregateThemes(markets);
const ai=agg.themes.find(x=>x.theme==='AI');
const meme=agg.themes.find(x=>x.theme==='MEME');
assert(ai&&meme,'expected theme summaries');
assert.equal(ai.marketCount,2);
assert.equal(ai.activeSignalCount,2);
assert.equal(ai.surgeCount,1);
assert.equal(ai.preSurgeCount,1);
assert(ai.avgRadarScore>70);
assert(ai.themeHeat>=0&&ai.themeHeat<=100,'heat bounded');
assert(meme.annotation.includes('위험'),'risk-heavy theme should be visibly annotated');
assert(agg.dominantThemeShare>=0&&agg.dominantThemeShare<=1,'dominant share bounded');
assert(agg.themeBreadth>=1,'breadth should count active themes');

console.log('radar themes behavior PASS');

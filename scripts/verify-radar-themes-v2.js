const assert=require('assert');
const themes=require('../ui/radar-themes.js');

const required=['AI','MEME','DeFi','RWA','L1','L2','Gaming','DePIN','Privacy','NFT','SocialFi','DEX','Lending','Liquid Staking','Restaking','Oracle','Storage','Stablecoin','Payments','Exchange Token','Perp DEX','Launchpad','BTC Ecosystem','Solana Ecosystem','Base Ecosystem','Ethereum Ecosystem','Other / Unclassified'];
for(const t of required)assert(themes.themes.includes(t),'missing expanded theme '+t);

const jup=themes.classifyMarket({symbol:'JUPUSDT',baseAsset:'JUP',chain:'solana'});
assert.equal(jup.primaryTheme,'DEX');
assert.equal(jup.theme,'DEX');
assert(jup.secondaryThemes.includes('Solana Ecosystem'));
assert(jup.confidence>=80);

const steth=themes.classifyMarket({symbol:'STETHUSDT',baseAsset:'STETH',chain:'ethereum'});
assert.equal(steth.primaryTheme,'Liquid Staking');
assert(steth.secondaryThemes.includes('Ethereum Ecosystem'));

const unknown=themes.classifyMarket({symbol:'TOTALLYUNKNOWNUSDT',baseAsset:'TOTALLYUNKNOWN',chain:'base'});
assert.equal(unknown.primaryTheme,'Other / Unclassified');
assert(unknown.secondaryThemes.includes('Base Ecosystem'),'chain ecosystem should be secondary without guessing primary theme');
assert.equal(unknown.confidence,0,'unknown ticker must not force confidence');

const agg=themes.aggregateThemes([
  {...jup,label:'PRE-SURGE',radarScore:55,change1m:1,change5m:3,volumeRatio:2,buySellImbalance:.2},
  {...steth,label:'WATCH',radarScore:30,change1m:.1,change5m:.5,volumeRatio:1,buySellImbalance:0}
]);
assert(agg.themes.some(x=>x.theme==='DEX'&&x.marketCount===1),'primary theme counting must not double count secondary themes');
assert(agg.themes.some(x=>x.theme==='Liquid Staking'&&x.marketCount===1));
console.log('radar themes v2 behavior PASS');

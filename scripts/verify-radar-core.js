const assert=require('assert');
const core=require('../ui/radar-core.js');
const now=Date.now();

const surge=core.scoreMarket({
  id:'surge',marketType:'dex',sourceConfidence:90,change1m:8,change5m:18,
  quoteVolumeUsd:180000,liquidityUsd:240000,txCount:520,buys:390,sells:130,
  volumeDelta1m:70000,volumeDelta5m:140000,txDelta1m:160,txDelta5m:380,
  fdvUsd:4000000,pairCreatedAt:new Date(now-90*60000).toISOString()
},{quoteVolumeUsd:30000,liquidityUsd:210000,txCount:80,change1m:1,change5m:3});
assert.equal(surge.label,'SURGE','multi-factor expansion should classify SURGE');
assert(surge.reasons.length>=3,'SURGE should expose reasons');

const pre=core.scoreMarket({
  id:'pre',marketType:'dex',sourceConfidence:88,change1m:1.3,change5m:3.1,
  quoteVolumeUsd:90000,liquidityUsd:180000,txCount:260,buys:175,sells:85,
  volumeDelta1m:32000,volumeDelta5m:62000,txDelta1m:85,txDelta5m:150,
  fdvUsd:2500000,pairCreatedAt:new Date(now-4*3600000).toISOString()
},{quoteVolumeUsd:70000,liquidityUsd:170000,txCount:210,change1m:.8,change5m:2});
assert.equal(pre.label,'PRE-SURGE','short-window activity acceleration before extreme price move should classify PRE-SURGE');
assert(pre.reasons.some(x=>/1분 거래량|1분 거래활동/.test(x)),'history-aware PRE-SURGE should explain short-window acceleration');

const fakePump=core.scoreMarket({
  id:'thin',marketType:'dex',sourceConfidence:65,change1m:45,change5m:120,
  quoteVolumeUsd:1200,liquidityUsd:1800,txCount:15,buys:12,sells:3,fdvUsd:1200000,
  volumeDelta1m:900,volumeDelta5m:1100,txDelta1m:8,txDelta5m:12,
  pairCreatedAt:new Date(now-20*60000).toISOString()
},{quoteVolumeUsd:900,liquidityUsd:2500,txCount:9});
assert.notEqual(fakePump.label,'SURGE','thin-liquidity percentage pump must not classify SURGE');
assert.equal(fakePump.label,'RISK','extremely thin liquidity pump should classify RISK');

const ranked=core.rankMarkets([fakePump,surge,pre]);
assert(ranked.some(x=>x.id==='surge'),'liquid SURGE must remain ranked');
assert(!ranked.some(x=>x.id==='thin'&&x.label!=='RISK'),'thin pool cannot appear as non-risk opportunity');

['scoreMarket','rankMarkets','PRE_SURGE','SURGE','LIQUIDITY_RISK'].forEach(k=>{
  assert(JSON.stringify(core).includes(k)||typeof core[k]==='function'||core.labels?.includes(k),'missing '+k);
});
console.log('radar core behavior PASS');

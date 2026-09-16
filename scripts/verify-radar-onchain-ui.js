const fs=require('fs');const assert=require('assert');
for(const p of ['radar.html','ui/radar-app.js','ui/radar.css','ui/radar-onchain.js'])assert(fs.existsSync(p),'missing '+p);
const h=fs.readFileSync('radar.html','utf8');for(const k of ['radar-onchain.js','자금 흐름','활동 집중','1h','4h','24h','flowHealth','capitalFlowBars'])assert(h.includes(k),'missing onchain UI '+k);
const a=fs.readFileSync('ui/radar-app.js','utf8');for(const k of ['PulseRadarOnchain','/api/onchain-flow','selectedFlowWindow','tokenFlowIndex','walletVolatility','largeWalletNetFlowUsd','exchangeNetFlowUsd','dataConfidence'])assert(a.includes(k),'missing app onchain wiring '+k);
const c=fs.readFileSync('ui/radar.css','utf8');for(const k of ['capitalFlow','flowBar','flowBarPositive','flowBarNegative','flowModeBtn','flowWindowBtn'])assert(c.includes(k),'missing flow style '+k);
const m=require('../ui/radar-onchain.js');const idx=m.indexTokenFlows([{chain:'solana',tokenAddress:'MintX',netFlow1hUsd:10}]);assert(idx.get('solana:mintx'));
const bars=m.themeFlowBars([{theme:'AI',netFlow1hUsd:200},{theme:'MEME',netFlow1hUsd:-100}],'1h');assert.equal(bars[0].theme,'AI');assert(bars.some(x=>x.direction==='negative'));
console.log('radar onchain ui behavior PASS');

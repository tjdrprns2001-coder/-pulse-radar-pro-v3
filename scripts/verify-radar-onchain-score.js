const assert=require('assert');
const core=require('../ui/radar-core.js');

const base={id:'x',marketType:'dex',sourceConfidence:90,change1m:1.2,change5m:3,quoteVolumeUsd:60000,liquidityUsd:150000,txCount:100,buys:60,sells:40,fdvUsd:1500000};
const baseline={quoteVolumeUsd:30000,liquidityUsd:145000,txCount:70,change1m:.5,change5m:1};
const plain=core.scoreMarket(base,baseline);
const strong=core.scoreMarket({...base,onchain:{confidence:90,largeWalletNetFlowUsd:500000,activeWalletDelta:25,walletVolatility:65,dexNetFlowUsd:120000}},baseline);
assert(Number.isFinite(strong.onchainScore),'onchainScore must exist');
assert(strong.onchainScore>=0&&strong.onchainScore<=100,'onchainScore bounded');
assert(strong.radarScore-plain.radarScore<=8.1,'onchain contribution must remain small');
assert(strong.reasons.some(x=>String(x).includes('대형 지갑 순유입 증가')),'explainable large-wallet reason missing');
const low=core.scoreMarket({...base,onchain:{confidence:20,largeWalletNetFlowUsd:9000000,activeWalletDelta:100,walletVolatility:100}},baseline);
assert(low.radarScore-plain.radarScore<2,'low-confidence onchain data must not materially raise score');
const transferOnly=core.scoreMarket({...base,change1m:0,change5m:0,quoteVolumeUsd:1000,txCount:2,onchain:{confidence:95,largeWalletNetFlowUsd:5000000,activeWalletDelta:50,walletVolatility:90}},baseline);
assert.notEqual(transferOnly.label,'SURGE');assert.notEqual(transferOnly.label,'PRE-SURGE');
console.log('radar onchain scoring PASS');

'use strict';
const assert=require('assert');
const {buildStats,compareFeatureDistributions}=require('../lib/research-backtest-v2/stats.js');
const {createFrozenManifest}=require('../lib/research-backtest-v2/contracts.js');

const manifest=createFrozenManifest({manifestVersion:'m1',createdAt:1,derivedFromSplit:'train',screenerConfigVersion:'s1',signalTimeframe:'15m',evaluationGridMs:900000,thresholds:{v:3}});
const before=JSON.stringify(manifest);
const events=[
 {eventId:'t1',datasetSplit:'train',survivorshipSafe:true,numericFeatures:{vol:2,rsi:40,missing:null},explanatoryTags:{sector:'AI'}},
 {eventId:'t2',datasetSplit:'train',survivorshipSafe:true,numericFeatures:{vol:5,rsi:60,missing:null},explanatoryTags:{sector:'AI'}},
 {eventId:'v1',datasetSplit:'validation',survivorshipSafe:true,numericFeatures:{vol:4,rsi:55,missing:null},explanatoryTags:{sector:'L1'}},
 {eventId:'v2',datasetSplit:'validation',survivorshipSafe:false,numericFeatures:{vol:1,rsi:35,missing:null},explanatoryTags:{sector:'L1'}},
 {eventId:'h1',datasetSplit:'train',survivorshipSafe:true,hypothesisOnly:true,numericFeatures:{vol:999,rsi:99}}
];
const out=(id,hit,ret,mfe,mae)=>({eventId:id,labels:{Hit_6H_8pct:hit,Hit_24H_12pct:hit},horizons:{
 h3:{status:'evaluated',returnPct:ret/4,mfePct:mfe/4,maePct:mae/4,rr:2},
 h6:{status:'evaluated',returnPct:ret/2,mfePct:mfe/2,maePct:mae/2,rr:2},
 h12:{status:'evaluated',returnPct:ret*.75,mfePct:mfe*.75,maePct:mae*.75,rr:2},
 h24:{status:'evaluated',returnPct:ret,mfePct:mfe,maePct:mae,rr:2},
 d3:{status:'evaluated',returnPct:ret*1.2,mfePct:mfe*1.2,maePct:mae*1.2,rr:2}
}});
const outcomes=[out('t1',false,-2,3,-2),out('t2',true,10,14,-4),out('v1',true,8,13,-3),out('v2',false,-5,2,-5),out('h1',true,100,100,-1)];

const train=buildStats({events,outcomes,manifest,split:'train'});
assert.equal(train.sampleCount,2,'hypothesis-only must be excluded');
assert.equal(train.labels.Hit_6H_8pct.hitCount,1);
assert.equal(train.labels.Hit_6H_8pct.hitRate,.5);
assert.equal(train.features.missing.missingRate,1);
assert.equal(train.horizons.h24.returnPct.p50,4);
assert.equal(train.sectorAnalysis.status,'표본 부족');
assert.equal(JSON.stringify(manifest),before,'stats must not mutate manifest');

const val=buildStats({events,outcomes,manifest,split:'validation'});
assert.equal(val.sampleCount,2);
assert.equal(val.unbiasedSampleCount,1);
assert.equal(val.survivorshipWarning,true);
assert.equal(val.validationIntegrity,'biased-universe-present');
assert.equal(val.labels.Hit_24H_12pct.hitCount,1);

const cmp=compareFeatureDistributions(
 [{numericFeatures:{vol:5}},{numericFeatures:{vol:4}}],
 [{numericFeatures:{vol:2}},{numericFeatures:{vol:1}}]
);
assert(cmp.vol.success.p50>cmp.vol.failure.p50);
assert.throws(()=>buildStats({events,outcomes,manifest:{...manifest,frozen:false},split:'validation'}),/frozen/i);
console.log('research stats PASS');

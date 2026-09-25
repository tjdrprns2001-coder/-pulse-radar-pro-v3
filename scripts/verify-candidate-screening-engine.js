const assert=require('assert');
const Screening=require('../lib/coin-scan/candidate-screening-engine.js');

const now=Date.now();
const goodRow={
  symbol:'TESTUSDT',state:'READY',
  validationGate:{status:'VALIDATED',crowding:{crowded:false}},
  invalidations:[],
  item:{
    symbol:'TESTUSDT',dataState:'live',updatedAt:now,v3AlignmentPct:82,v3LongTier:'PASS',
    v3:{causalIct:{primaryTf:'4h',longStage:'INTENT'}},
    scanClass:{key:'PRE-SURGE'},tradeSignal:{level:'관찰'},priceChange24h:2,quoteVolume24h:120000000,
    oi4hChangePct:3.2,trueTakerRatio:1.35,fundingRate:0.01
  }
};
const execution={futures:{available:true,spreadBps:3,depthUsd:{bid10bps:150000,ask10bps:160000},slippage:{buy:[{notional:10000,slippageBps:5}],sell:[{notional:10000,slippageBps:4}]}}};
const intelligence={
  cex:{exchangeCount:4,maxPriceDispersionPct:.2},
  coverage:{cex:true,indicators:true,dex:true,news:true,scheduledEvents:true,wallets:true,execution:true},
  dex:{available:true},walletVerification:{verifiedAttributions:2,tokenContractVerified:true},
  news:{available:true,items:[]},events:{available:true,items:[],newsDerived:[]}
};
const good=Screening.screen(goodRow,{execution,intelligence,decisionTime:now,dataCutoff:now});
assert.equal(good.classification,'CANDIDATE');
assert(good.scores.final_score>=75);
assert.equal(good.spec_version,'selector-r0.2');
assert.equal(good.evidence_context.version,'EVIDENCE_CONTEXT_r0.2');
assert(Object.prototype.hasOwnProperty.call(good.scores,'catalyst_context'));
assert(good.snapshot_id&&good.input_hash);
assert.equal(good.decision_time,new Date(now).toISOString());
assert(Array.isArray(good.evidence)&&good.evidence.length>0);

const futureNews={...intelligence,news:{available:true,items:[{title:'TEST exploit confirmed',publishedAt:now+60000,observedAt:now+60000}]}};
const pit=Screening.screen(goodRow,{execution,intelligence:futureNews,decisionTime:now,dataCutoff:now});
assert.notEqual(pit.classification,'EVENT_RISK','future news must not leak into earlier snapshot');

const unverifiedIntel={...intelligence,news:{available:true,items:[{title:'TEST exploit rumored',source:'anonymous social',publishedAt:now-60000,observedAt:now-30000,verification_status:'UNVERIFIED'}]}};
const unverified=Screening.screen(goodRow,{execution,intelligence:unverifiedIntel,decisionTime:now,dataCutoff:now});
assert.notEqual(unverified.classification,'EVENT_RISK','unverified news must not change classification');
const eventIntel={...intelligence,news:{available:true,items:[{title:'TEST exploit confirmed',source:'Project Foundation',source_tier:2,publishedAt:now-60000,observedAt:now-30000,verification_status:'OFFICIAL_CONFIRMED'}]}};
const risky=Screening.screen(goodRow,{execution,intelligence:eventIntel,decisionTime:now,dataCutoff:now});
assert.equal(risky.classification,'EVENT_RISK');

const thin=Screening.screen(goodRow,{execution:{},intelligence:{cex:{exchangeCount:1},coverage:{}},decisionTime:now,dataCutoff:now});
assert.equal(thin.classification,'INSUFFICIENT_DATA');
assert(thin.data_gaps.length>0);

const crowdedRow={...goodRow,validationGate:{status:'VALIDATED',crowding:{crowded:true}}};
const crowded=Screening.screen(crowdedRow,{execution,intelligence,decisionTime:now,dataCutoff:now});
assert.equal(crowded.classification,'RISK_FILTERED');

const bundle=Screening.bundle([good,crowded,thin,risky]);
assert.equal(bundle.candidates.length,1);
assert.equal(bundle.riskFiltered.length,1);
assert.equal(bundle.insufficientData.length,1);
assert.equal(bundle.eventRisk.length,1);
assert.equal(bundle.rejected.length,0);
assert.equal(bundle.all.length,4);

console.log('candidate-screening-engine selector-r0.2 verification passed');

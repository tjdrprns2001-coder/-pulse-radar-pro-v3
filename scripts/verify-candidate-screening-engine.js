const assert=require('assert');
const Screening=require('../lib/coin-scan/candidate-screening-engine.js');

const goodRow={
  symbol:'TESTUSDT',state:'READY',
  validationGate:{status:'VALIDATED',crowding:{crowded:false}},
  invalidations:[],
  item:{
    symbol:'TESTUSDT',dataState:'live',v3AlignmentPct:82,v3LongTier:'PASS',
    scanClass:{key:'PRE-SURGE'},tradeSignal:{level:'매수 후보'},priceChange24h:2,
    oi4hChangePct:3.2,trueTakerRatio:1.35,fundingRate:0.01
  }
};
const execution={futures:{available:true,spreadBps:3,depthUsd:{bid10bps:150000,ask10bps:160000},slippage:{buy:[{notional:10000,slippageBps:5}],sell:[{notional:10000,slippageBps:4}]}}};
const intelligence={
  cex:{exchangeCount:4,maxPriceDispersionPct:.4},
  coverage:{cex:true,indicators:true,dex:true,news:true,scheduledEvents:true,wallets:true,execution:true},
  dex:{available:true},walletVerification:{verifiedAttributions:2,tokenContractVerified:true},
  news:{available:true,items:[]},events:{available:true,items:[],newsDerived:[]}
};
const good=Screening.screen(goodRow,{execution,intelligence,now:Date.now()});
assert.equal(good.classification,'A_CANDIDATE');
assert(good.totalScore>=75);
assert(good.evidence.length>0);

const eventIntel={...intelligence,news:{available:true,items:[{title:'TEST exploit confirmed by project'}]}};
const risky=Screening.screen(goodRow,{execution,intelligence:eventIntel,now:Date.now()});
assert.equal(risky.classification,'EVENT_RISK');
assert(risky.eventRiskScore===100);

const thin=Screening.screen(goodRow,{execution:{},intelligence:{cex:{exchangeCount:1},coverage:{}},now:Date.now()});
assert.equal(thin.classification,'DATA_INSUFFICIENT');
assert(thin.missing.length>0);

const excluded=Screening.screen({...goodRow,state:'EXCLUDE',invalidations:['security filter']},{execution,intelligence,now:Date.now()});
assert.equal(excluded.classification,'EXCLUDED');

const bundle=Screening.bundle([good,risky,thin,excluded]);
assert.equal(bundle.aCandidates.length,1);
assert.equal(bundle.eventRisk.length,1);
assert.equal(bundle.dataInsufficient.length,1);
assert.equal(bundle.excluded.length,1);

console.log('candidate-screening-engine verification passed');

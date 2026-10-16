'use strict';
const assert=require('assert');
const {resolveBarrierPath,createSamplingV3OutcomeResolver}=require('../lib/coin-scan/sampling-v3-outcome-resolver.js');

(async()=>{
  const start=Date.parse('2026-09-27T00:00:00Z');
  const base={symbol:'TESTUSDT',capturedAt:start,entryPrice:100,upperPct:2,lowerPct:1,futuresListed:true,spotListed:false};

  const up=[
    {openTime:start+60000,high:101,low:99.5,close:100.5},
    {openTime:start+120000,high:102.2,low:100,close:102}
  ];
  assert.equal(resolveBarrierPath(up,base,start+6*3600000).label,'SURGE');

  const down=[
    {openTime:start+60000,high:100.4,low:99.5,close:100},
    {openTime:start+120000,high:100.2,low:98.8,close:99}
  ];
  assert.equal(resolveBarrierPath(down,base,start+6*3600000).label,'FAILED_BOS');

  // A time-expired/no-trigger outcome needs every expected closed minute.
  const flat=Array.from({length:359},(_,i)=>({
    openTime:start+(i+1)*60000,high:100.6,low:99.3,close:100.2,
    closeTime:start+(i+2)*60000-1
  }));
  const no=resolveBarrierPath(flat,base,start+6*3600000);
  assert.equal(no.label,'NO_TRIGGER');assert.equal(no.reason,'TIME_EXPIRED');

  const both=[{openTime:start+60000,high:102.5,low:98.5,close:100}];
  const amb=resolveBarrierPath(both,base,start+6*3600000);
  assert.equal(amb.label,'UNRESOLVED');assert.equal(amb.reason,'AMBIGUOUS_SAME_BAR');

  const interrupted=[
    {openTime:start+60000,high:100.5,low:99.5,close:100},
    {openTime:start+180000,high:103,low:100,close:102.4}
  ];
  const interruptedResult=resolveBarrierPath(interrupted,base,start+6*3600000);
  assert.equal(interruptedResult.status,'unavailable','do not call an unobserved early interval a success');
  assert.equal(interruptedResult.reason,'MISSING_EARLY_PATH');
  const missingFirst=resolveBarrierPath([{openTime:start+180000,high:103,low:100,close:102.4}],base,start+6*3600000);
  assert.equal(missingFirst.status,'unavailable');
  const incomplete=resolveBarrierPath(flat.slice(0,200),base,start+6*3600000);
  assert.equal(incomplete.status,'unavailable','missing late minutes cannot confirm a NO_TRIGGER timeout');
  assert.equal(incomplete.reason,'INCOMPLETE_HORIZON');
  const unclosedFuture={openTime:start+6*3600000,closeTime:start+6*3600000+59999,high:115,low:98,close:110};
  const closedOnly=resolveBarrierPath([...flat,unclosedFuture],base,start+6*3600000);
  assert.equal(closedOnly.label,'NO_TRIGGER','do not peek into the candle opening at the evaluation target');

  let requested=[];
  const resolver=createSamplingV3OutcomeResolver({
    fetchKlines:async(symbol,s,e,market)=>{requested.push({symbol,s,e,market});return up}
  });
  const pending=await resolver.resolve(base,start+6*3600000,start+3600000);
  assert.equal(pending.status,'pending');assert.equal(requested.length,0);
  const evaluated=await resolver.resolve(base,start+6*3600000,start+7*3600000);
  assert.equal(evaluated.label,'SURGE');assert.equal(evaluated.market,'futures');assert.equal(requested.length,1);

  console.log('sampling v3 outcome resolver PASS');
})().catch(e=>{console.error(e);process.exit(1)});

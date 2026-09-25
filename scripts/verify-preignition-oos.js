'use strict';
const assert=require('assert');
const fs=require('fs');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createPreIgnitionOosService,scoreBucket}=require('../lib/coin-scan/preignition-oos.js');
const {createPreIgnitionResolver}=require('../lib/coin-scan/preignition-resolver.js');

(async()=>{
  const t0=Date.UTC(2026,8,25,0,0,0);let now=t0;
  const store=createMemoryStore();
  const entry={AUSDT:100,BUSDT:100,CUSDT:100,DUSDT:100,EUSDT:100,FUSDT:100};
  const service=createPreIgnitionOosService({
    store,now:()=>now,maxEventsPerEvaluation:20,evaluationConcurrency:3,
    resolver:{async resolve(symbol,targetTs){const hours=Math.round((targetTs-t0)/3600000);const mul=hours>=24?1.15:1.09;return{status:'evaluated',marketTs:targetTs,price:entry[symbol]*mul,market:'futures'}}}
  });
  const mk=(symbol,score,extra={})=>({symbol,lastPrice:entry[symbol],dataState:'live',marketScope:'futures',futuresListed:true,spotListed:true,autoDeepEligible:true,preIgnitionScore:score,scanClass:{key:'PRE-SURGE'},v3LongTier:'PASS',v2Type:'A-pre',tradeSignal:{level:'관찰',confidence:60},...extra});
  const items=[
    mk('AUSDT',55),mk('BUSDT',65),mk('CUSDT',75),mk('DUSDT',85),
    mk('EUSDT',90,{autoDeepEligible:false,autoDeepReason:'PRICE_EXTENDED'}),
    mk('FUSDT',90,{scanClass:{key:'POST-SURGE'}})
  ];
  assert.equal(scoreBucket(items[0]),'LT60');
  assert.equal(scoreBucket(items[1]),'S60_69');
  assert.equal(scoreBucket(items[2]),'S70_79');
  assert.equal(scoreBucket(items[3]),'S80_PLUS');
  assert.equal(scoreBucket(items[4]),'REJECTED');
  assert.equal(scoreBucket(items[5]),'REJECTED');

  const first=await service.observe(items,{capturedAt:t0,scannerVersion:'v3',paramSet:'test'});
  assert.equal(first.recorded,6);
  assert.equal(first.buckets.REJECTED,2);
  const dup=await service.observe(items,{capturedAt:t0+1000});
  assert.equal(dup.recorded,0);
  assert.equal(dup.duplicates,6,'same symbol/hour snapshot must be immutable');

  now=t0+6*3600000+1000;
  const e6=await service.evaluateDue();
  assert.equal(e6.evaluated,6,'all 6H horizons should evaluate once due');
  let stats=await service.stats();
  assert.equal(stats.sampleCount,6);
  assert.equal(stats.byBucket.REJECTED.sampleCount,2);
  assert.equal(stats.thresholds['60'].sampleCount,3,'60+ threshold excludes rejected controls');
  assert.equal(stats.thresholds['70'].sampleCount,2);
  assert.equal(stats.thresholds['80'].sampleCount,1);
  assert.equal(stats.thresholds['60'].horizons.h6.evaluatedCount,3);
  assert.equal(stats.thresholds['60'].horizons.h6.hitRatio,1,'+9% at 6H clears the +8% research hit');
  assert.equal(stats.thresholds['60'].horizons.h24.evaluatedCount,0);

  now=t0+24*3600000+1000;
  const e24=await service.evaluateDue();
  assert.equal(e24.evaluated,6,'all 24H horizons should evaluate once due');
  stats=await service.stats();
  assert.equal(stats.thresholds['70'].horizons.h24.evaluatedCount,2);
  assert.equal(stats.thresholds['70'].horizons.h24.hitRatio,1,'+15% at 24H clears the +12% research hit');
  const listed=await service.list({bucket:'S70_79',limit:10});
  assert.equal(listed.length,1);assert.equal(listed[0].symbol,'CUSDT');assert.equal(listed[0].outcome.horizons.h24.status,'evaluated');

  const calls=[];
  const resolver=createPreIgnitionResolver({fetchKlines:async(symbol,target,market)=>{calls.push(market);if(market==='futures')return[[target,'12.5']];return[[target,'11.5']]}});
  const hit=await resolver.resolve('ONLYFUTUSDT',1000,2000,{marketScope:'futures',futuresListed:true,spotListed:false});
  assert.equal(hit.status,'evaluated');assert.equal(hit.market,'futures');assert.deepEqual(calls,['futures']);

  const scheduled=fs.readFileSync('netlify/functions/preignition-oos-scan.mjs','utf8');
  assert(scheduled.includes("schedule:'17 * * * *'"),'hourly OOS collector schedule missing');
  assert(scheduled.includes('TARGET_PER_BUCKET=4')&&scheduled.includes('MAX_DEEP=20'),'stratified OOS sample cap missing');
  for(const k of ['REJECTED_FAST','LT60_FAST','S60_69_FAST','S70_79_FAST','S80_PLUS_FAST'])assert(scheduled.includes(k),'scheduled stratification missing '+k);
  assert(scheduled.includes("mode:'preignition-history',action:'evaluate'"),'scheduled horizon evaluation missing');
  console.log('preignition OOS ledger PASS');
})().catch(e=>{console.error(e);process.exit(1)});

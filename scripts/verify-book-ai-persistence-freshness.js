'use strict';
const assert=require('assert');
const Journal=require('../ui/chart/liquidity-event-journal.js');
const Gate=require('../ui/chart/sample-readiness-gate.js');
const Adapter=require('../ui/book-ai/adapter.js');
const Rules=require('../ui/book-ai/rule-engine.js');
const ChartData=require('../ui/chart/chart-data.js');

(async()=>{
  const t=1_800_000_000_000;
  const model={
    ok:true,version:'test-liq',candles:[
      {time:t-8*3600000,open:100,high:102,low:98,close:99,volume:1000},
      {time:t-4*3600000,open:99,high:103,low:97,close:101,volume:1200}
    ],
    scenario:{direction:'up',sweep:{index:1,dir:'up',confirmed:true,last:{index:1,level:99}}},
    smc:{mss:[],displacements:[]},range:{low:97,high:103,mid:100},summary:{}
  };
  const bundle=Journal.createBundle({symbol:'TESTUSDT',timeframe:'4h',model,trendRetest:null,now:t});
  assert(bundle.events.some(x=>x.eventType==='LIQ_SWEEP'&&x.status==='CONFIRMED'));
  assert(bundle.events.some(x=>x.eventType==='RECLAIM'&&x.status==='CONFIRMED'));

  const journalStore=Journal.createMemoryStore();
  Journal.recordAndResolve({store:journalStore,snapshot:bundle.snapshot,events:bundle.events,referenceCandles:model.candles,outcomeCandles:model.candles,now:t});
  const db=journalStore.export();
  assert(db.snapshots.length===1&&db.events.length>=2,'confirmed bundle must persist');

  const gateStore=Gate.createMemoryStore();
  const gate=Gate.evaluateGate({journalDb:db,store:gateStore,now:t});
  assert(['INSUFFICIENT','OBSERVING','REVIEWABLE_INITIAL','VALIDATING','INSUFFICIENT_VALIDATION','REVIEWABLE_VALIDATED','REVIEWABLE_UNSTABLE'].includes(gate.state));

  const adapter=Adapter.adaptBookAiInput({
    analysisAsOf:t+1000,symbol:'TESTUSDT',
    sources:{journal:{data:db,observedAt:t,version:Journal.VERSION}}
  });
  const rr=Rules.evaluate(adapter);
  const liq=rr.rules.find(x=>x.ruleId==='LIQUIDITY_SWEEP_RECLAIM');
  assert(liq,'liquidity rule missing');
  assert.equal(liq.status,'CONFIRMED','persisted confirmed sweep+reclaim must become CONFIRMED');
  assert(liq.trustedEvidenceEventIds.length>=2,'CONFIRMED must cite trusted persisted events');

  let seen='';
  await ChartData.fetchStructure({symbol:'BTCUSDT',interval:'4h',limit:100,cacheBust:12345,fetchImpl:async url=>{seen=url;return{ok:true,status:200,json:async()=>({ok:true,candles:[]})}}});
  assert(seen.includes('refresh=12345'),'cache-busted structure refresh missing');

  console.log('Book AI persistence and freshness PASS');
})().catch(e=>{console.error(e);process.exit(1)});

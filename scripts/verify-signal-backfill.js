'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createBackfillService}=require('../lib/signal-performance/backfill.js');
(async()=>{
  const store=createMemoryStore();
  await store.putSnapshot({id:'AAAUSDT:PRE-SURGE:0',source:'live',symbol:'AAAUSDT',scanClassKey:'PRE-SURGE',capturedAt:100,entryPrice:1,targets:{}});
  const seen=[];
  const provider={async getHistoricalFrames(symbol){return {m15:[
    {openTime:0,closeTime:899999,close:1},
    {openTime:900000,closeTime:1799999,close:1.1},
    {openTime:1800000,closeTime:2699999,close:9}
  ]}}};
  const classifyAt=async({symbol,frames,simulatedTs})=>{
    const rows=frames.m15||[];
    assert(rows.every(x=>Number(x.closeTime)<=simulatedTs),'partially open candle leaked into classification');
    seen.push({simulatedTs,maxClose:rows.length?Math.max(...rows.map(x=>x.closeTime)):-1});
    return {symbol,scanClass:{key:'PRE-SURGE',label:'🔥 급등 직전'},dataState:'live',lastPrice:1+simulatedTs/1e7,updatedAt:simulatedTs,candidateScore:70,tradeSignal:{level:'관찰',confidence:60}};
  };
  const svc=createBackfillService({provider,store,classifyAt,maxStepsPerRun:2});
  const first=await svc.run({jobId:'j1',symbols:['AAAUSDT'],startTs:900000,endTs:2700000,stepMs:900000});
  assert.equal(first.status,'partial');
  assert(seen.every(x=>x.maxClose<=x.simulatedTs),'future candle leaked into classification');
  const cp=await store.getCheckpoint('j1');assert.equal(cp.nextTs,2700000);
  const second=await svc.run({jobId:'j1',symbols:['AAAUSDT'],startTs:900000,endTs:2700000,stepMs:900000});
  assert.equal(second.status,'complete');
  const snaps=await store.listSnapshots();
  assert.equal(snaps.filter(x=>x.source==='live').length,1);
  assert(snaps.filter(x=>x.source==='backfill').length>=2);
  const before=snaps.length;await svc.run({jobId:'j1',symbols:['AAAUSDT'],startTs:900000,endTs:2700000,stepMs:900000});assert.equal((await store.listSnapshots()).length,before,'resume must dedupe completed work');
  console.log('signal backfill contract PASS');
})().catch(e=>{console.error(e);process.exit(1)});

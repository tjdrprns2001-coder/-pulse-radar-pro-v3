const assert=require('assert');
const Core=require('../lib/signal-performance/core.js');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createSignalPerformanceService}=require('../lib/signal-performance/service.js');

(async()=>{
  let now=0;
  const store=createMemoryStore();
  const resolver={async resolve(symbol,targetTs,nowTs){if(nowTs<targetTs)return{status:'pending',targetTs};return{status:'evaluated',targetTs,marketTs:targetTs,price:110}}};
  const service=createSignalPerformanceService({store,resolver,now:()=>now,maxEvaluationsPerRun:12});
  const base={symbol:'ONEUSDT',dataState:'live',scanClass:{key:'PRE-SURGE',label:'🔥 급등 직전'},lastPrice:100,updatedAt:1000,tradeSignal:{level:'매수 후보',confidence:80},candidateScore:77,sector:'AI'};
  const first=await service.recordItems([base]);assert.equal(first.recorded,1);assert.equal(first.duplicate,0);
  const dup=await service.recordItems([base]);assert.equal(dup.recorded,0);assert.equal(dup.duplicate,1,'same class and bucket must dedupe');
  const transition=await service.recordItems([{...base,scanClass:{key:'ANOMALY',label:'🟠 이상징후'}}]);assert.equal(transition.recorded,1,'class transition must create a new snapshot');
  const excluded=await service.recordItems([
    {...base,symbol:'POSTUSDT',scanClass:{key:'POST-SURGE',label:'🔵 급등 완료'}},
    {...base,symbol:'RISKUSDT',scanClass:{key:'PUMP-RISK',label:'🔴 펌프 위험'}},
    {...base,symbol:'STALEUSDT',dataState:'stale',scanClass:{key:'STALE',label:'⚪ 판단 보류'}}
  ]);assert.equal(excluded.recorded,0);assert.equal(excluded.skipped,3);
  assert.equal((await store.listSnapshots()).length,2);

  now=1000+Core.HORIZONS.m15;
  const eval15=await service.evaluateDue();assert(eval15.evaluated>=2,'both due 15m slots should evaluate');
  const out=await store.getOutcome('ONEUSDT:PRE-SURGE:0');
  assert.equal(out.horizons.m15.status,'evaluated');
  assert(Math.abs(out.horizons.m15.returnPct-10)<1e-9);
  assert.equal(out.horizons.h1.status,'pending','1h must remain pending before due');

  const perf=await service.getPerformance({classKey:'PRE-SURGE'});
  const cls=perf.classes.find(x=>x.key==='PRE-SURGE');assert(cls);assert.equal(cls.horizons.m15.evaluatedCount,1);assert.equal(cls.horizons.m15.sampleState,'표본 부족');
  assert.equal(perf.recent.length,1);

  const nullTimeStore=createMemoryStore();
  const nullTimeService=createSignalPerformanceService({store:nullTimeStore,resolver,now:()=>31*60*1000});
  const nullTime=await nullTimeService.recordItems([{...base,symbol:'TIMEUSDT',updatedAt:null,capturedAt:null}]);
  assert.equal(nullTime.recorded,1);
  assert.equal((await nullTimeStore.listSnapshots())[0].capturedAt,31*60*1000,'null capture timestamps must fall back to now');

  const badStore={...createMemoryStore(),async putSnapshot(){throw new Error('blob down')}};
  const isolated=createSignalPerformanceService({store:badStore,resolver,now:()=>0});
  const r=await isolated.recordItems([base]);assert.equal(r.errors.length,1,'store failures should be returned, not thrown');
  console.log('signal performance service PASS');
})().catch(e=>{console.error(e);process.exit(1)});

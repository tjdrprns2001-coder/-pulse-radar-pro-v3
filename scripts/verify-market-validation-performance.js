'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createMarketValidationPerformance,buildStats}=require('../lib/coin-scan/market-validation-performance.js');
function snap(id,status,price=100,ts=1000){return{snapshotId:id,createdAt:ts,canonical:{symbol:'BTCUSDT',decisionTimestamp:ts,signal:{lastPrice:price}},result:{validationStatus:status}}}
(async()=>{
 const store=createMemoryStore();
 const resolver={async resolve(_s,target){return{status:'evaluated',marketTs:target,price:target===3601000?104:target===14401000?106:110}}};
 const svc=createMarketValidationPerformance({store,resolver,now:()=>90000000,maxEvaluationsPerRun:20});
 for(const [id,st] of [['v1','VALIDATED'],['v2','VALIDATED'],['c1','CONFLICTED'],['i1','INVALIDATED']]){const s=snap(id,st);await store.putMarketValidationSnapshot(id,s);await svc.record(s)}
 const ev=await svc.evaluateDue();assert(ev.evaluated>=12);
 const stats=await svc.getStats({refresh:true});assert.equal(stats.overall.sampleCount,4);assert.equal(stats.byStatus.VALIDATED.sampleCount,2);assert(stats.byStatus.VALIDATED.horizons.h24.meanReturnPct>0);assert(Number.isFinite(stats.validationLift.h24.meanReturnLiftPct));assert(Number.isFinite(stats.falseRejection.h24.gt5PctRatio));
 const rows=[{snapshot:snap('a','VALIDATED'),outcome:{horizons:{h24:{returnPct:10}}}},{snapshot:snap('b','CONFLICTED'),outcome:{horizons:{h24:{returnPct:-2}}}}];const direct=buildStats(rows);assert(direct.validationLift.h24.meanReturnLiftPct>0);
 console.log('market validation performance PASS');
})().catch(e=>{console.error(e);process.exit(1)});

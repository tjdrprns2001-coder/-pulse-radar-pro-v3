'use strict';
const assert=require('node:assert/strict');
const fs=require('fs');
const {createRuntimeScanService,snapshotTime,isStale}=require('../lib/pulse-ai/runtime-scan.js');
const {dependencyStatus}=require('../lib/health/dependency-status.js');
const CLOCK=1792100000000;
function fresh(at=CLOCK){return{
  status:'ok',updatedAt:at,partial:false,items:[{symbol:'AAAUSDT'}],
  dataHealth:{live:1,errors:0,delayed:0,blocked:0},marketCoverage:{spot:2,futures:1,both:0}
}}
function response(body){return{ok:true,status:200,json:async()=>body}}
async function main(){
  assert.equal(snapshotTime('2026-10-16T00:00:00Z'),Date.parse('2026-10-16T00:00:00Z'));
  assert.equal(snapshotTime(''),null);
  assert(isStale(fresh(CLOCK-360000),CLOCK,300000));
  assert(!isStale(fresh(CLOCK-30000),CLOCK,300000));
  assert(isStale(fresh(CLOCK+90000),CLOCK,300000),'future timestamps beyond allowed skew must be rejected');
  let requests=0,release;
  const delayed=new Promise(resolve=>{release=resolve});
  const concurrent=createRuntimeScanService({
    runtimeUrl:'https://example.test',now:()=>CLOCK,
    fetchImpl:async()=>{requests++;await delayed;return response(fresh())},
    fallback:{run:async()=>{throw Error('unexpected fallback')}}
  });
  const one=concurrent.run({mode:'summary',limit:100});
  const two=concurrent.run({mode:'summary',limit:100});
  release();
  const [a,b]=await Promise.all([one,two]);
  assert.equal(requests,1,'concurrent identical scans must share a single upstream call');
  assert.equal(a.pulseAiScanSource,'runtime');assert.deepEqual(a,b);
  let clock=CLOCK,calls=0,fail=false;
  const recovering=createRuntimeScanService({
    runtimeUrl:'https://example.test',now:()=>clock,lastGoodMaxAgeMs:300000,
    fetchImpl:async()=>{calls++;if(fail)throw Error('down');return response(fresh(clock))},
    fallback:{run:async()=>{throw Error('down')}}
  });
  await recovering.run({mode:'summary'});
  fail=true;clock+=60000;
  const fallback=await recovering.run({mode:'summary'});
  assert.equal(fallback.pulseAiScanSource,'last-good');assert.equal(fallback.partial,true);
  assert(fallback.sourceWarning.includes('직전 정상 스냅샷'));
  clock+=420000;
  await assert.rejects(()=>recovering.run({mode:'summary'}),'expired last-good must not be served');
  let localCalls=0;
  const remoteStale=createRuntimeScanService({
    runtimeUrl:'https://example.test',now:()=>CLOCK,
    fetchImpl:async()=>response(fresh(CLOCK-7200000)),
    fallback:{run:async()=>{localCalls++;return fresh()}}
  });
  const switched=await remoteStale.run({mode:'summary'});
  assert.equal(switched.pulseAiScanSource,'local-fallback');
  assert.equal(localCalls,1);
  const staleOnly=createRuntimeScanService({
    runtimeUrl:'https://example.test',now:()=>CLOCK,
    fetchImpl:async()=>{throw Error('offline')},
    fallback:{run:async()=>fresh(CLOCK-7200000)}
  });
  await assert.rejects(()=>staleOnly.run({mode:'summary'}),'stale local must not be promoted as fresh');
  const ready=dependencyStatus({storage_ready:true,persistence:{durable:true,kind:'postgres'}},'sha123');
  assert.equal(ready.chartStorage.status,'ready');assert.equal(ready.release,'sha123');
  const notReady=dependencyStatus({storage_ready:false,reason:'postgres_not_configured',persistence:{durable:false,kind:'file',error:'postgres://secret@host'}},'sha456');
  assert.equal(notReady.chartStorage.status,'degraded');
  assert.equal(notReady.chartStorage.reason,'postgres_not_configured');
  assert(!JSON.stringify(notReady).includes('secret'),'database connection data must never be exposed');
  const malicious=dependencyStatus({storage_ready:false,reason:'postgres://secrets'},null);
  assert.equal(malicious.chartStorage.reason,'storage_not_ready');
  const source=fs.readFileSync('render-temp-server.js','utf8');
  assert(source.includes("u.pathname==='/health/dependencies'"));
  assert(source.includes("dependencyStatus(runtime,RELEASE)"));
  assert(source.includes('ready?200:503'),'durability readiness must continue returning HTTP 503 when degraded');
  console.log('Pulse scan freshness, singleflight and safe storage diagnostics PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

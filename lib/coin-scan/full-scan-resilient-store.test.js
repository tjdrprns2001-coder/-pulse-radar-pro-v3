'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMemoryFullScanStore,createResilientFullScanStore}=require('./full-scan-resilient-store.js');

test('memory store supports auto bucket, resume items and latest results',async()=>{
  const s=createMemoryFullScanStore(),run={id:'r1',kind:'auto',bucketKey:'b1',status:'RUNNING',createdAt:1,updatedAt:1};
  assert.equal((await s.claimAutoBucket(run)).claimed,true);
  assert.equal((await s.claimAutoBucket({...run,id:'r2'})).claimed,false);
  await s.putItem('r1',{symbol:'AAAUSDT',tier:'small',marketCapUsd:1,preIgnitionScore:70});
  await s.updateRun('r1',{status:'DONE',completedAt:10});
  const latest=await s.latest({limit:10});assert.equal(latest.id,'r1');assert.equal(latest.items[0].symbol,'AAAUSDT')
});
test('resilient store falls back when postgres is unavailable and keeps scanning',async()=>{
  let calls=0;const fail={};
  for(const name of ['createRun','claimAutoBucket','updateRun','putItem','getRun','getItems','latest'])fail[name]=async()=>{calls++;throw new Error('getaddrinfo ENOTFOUND postgres')};
  const seen=[],s=createResilientFullScanStore({primary:fail,cooldownMs:60000,onFallback:x=>seen.push(x)});
  const run={id:'r1',kind:'auto',bucketKey:'b1',status:'RUNNING',createdAt:1,updatedAt:1};
  assert.equal((await s.claimAutoBucket(run)).claimed,true);await s.putItem('r1',{symbol:'AAAUSDT',tier:'small'});await s.updateRun('r1',{status:'DONE',completedAt:10});
  const latest=await s.latest({limit:10});assert.equal(latest.items.length,1);assert.equal(calls,1,'circuit breaker avoids repeated DNS stalls');assert.equal(seen.length,1);assert.equal(s.state().primaryAvailable,false)
});
test('successful primary writes are mirrored for seamless later fallback',async()=>{
  const memory=createMemoryFullScanStore(),primary=createMemoryFullScanStore();let broken=false;
  const wrapper={};for(const name of ['createRun','claimAutoBucket','updateRun','putItem','getRun','getItems','latest'])wrapper[name]=async(...a)=>{if(broken)throw new Error('db down');return primary[name](...a)};
  const s=createResilientFullScanStore({primary:wrapper,fallback:memory,cooldownMs:60000});
  const run={id:'r1',kind:'auto',bucketKey:'b1',status:'RUNNING',createdAt:1,updatedAt:1};await s.claimAutoBucket(run);await s.putItem('r1',{symbol:'AAAUSDT',tier:'small'});await s.updateRun('r1',{status:'DONE',completedAt:10});
  broken=true;const latest=await s.latest({limit:10});assert.equal(latest.id,'r1');assert.equal(latest.items[0].symbol,'AAAUSDT')
});

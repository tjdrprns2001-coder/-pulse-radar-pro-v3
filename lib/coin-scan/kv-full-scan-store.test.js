'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createKvFullScanStore,SHARDS,shardFor}=require('./kv-full-scan-store.js');

function fakeKv(){
  const m=new Map();
  return{
    async putState(k,v){m.set(k,JSON.parse(JSON.stringify(v)));return true},
    async getState(k){const v=m.get(k);return v==null?null:JSON.parse(JSON.stringify(v))},
    async ping(){return'PONG'},
    keyPrefix:'fake:fullscan'
  };
}
test('KV full-scan store claims buckets and persists sharded items without clobbering',async()=>{
  const store=createKvFullScanStore({kvStore:fakeKv()});
  const run={id:'r1',kind:'auto',bucketKey:'auto:1',status:'QUEUED',createdAt:1,updatedAt:1};
  const c1=await store.claimAutoBucket(run);assert.equal(c1.claimed,true);
  const c2=await store.claimAutoBucket({...run,id:'r2'});assert.equal(c2.claimed,false);assert.equal(c2.run.id,'r1');
  const items=Array.from({length:80},(_,i)=>({symbol:'C'+i+'USDT',tier:i%3===0?'small':i%3===1?'mid':'large',marketCapUsd:1000-i,preIgnitionScore:i,complete:true}));
  await Promise.all(items.map(x=>store.putItem('r1',x)));
  const got=await store.getItems('r1',{limit:200});
  assert.equal(got.length,80);
  assert.equal(new Set(got.map(x=>x.symbol)).size,80);
  const mids=await store.getItems('r1',{tiers:['mid'],limit:200});assert(mids.length>0&&mids.every(x=>x.tier==='mid'));
  await store.updateRun('r1',{status:'DONE',completedAt:100,completedCount:80});
  const latest=await store.latest({limit:200});assert.equal(latest.id,'r1');assert.equal(latest.items.length,80);
  assert.equal(await store.ping(),'PONG');
});
test('shard function is stable and bounded',()=>{
  for(const s of ['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT']){const a=shardFor(s),b=shardFor(s);assert.equal(a,b);assert(a>=0&&a<SHARDS)}
});
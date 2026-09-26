import test from 'node:test';
import assert from 'node:assert/strict';
import {createSource} from './upstream.mjs';

const completed={schemaVersion:'1.0',kind:'scan',id:'fixture',status:'complete',asOf:1,finishedAt:2,candidates:[],counts:{universe:527}};

test('upstream is fixed GET and exposes live partial state while preserving last complete for failures',async()=>{
 let clock=10000,status='complete',calls=0;
 const source=createSource({
   env:{IGNITION_UPSTREAM_TOKEN:'test-only'},
   now:()=>clock,
   fetcher:async(url,opts)=>{
     calls++;
     assert.equal(url,'https://ignition-scanner.tjdrprns10.chatgpt.site/api/v1/results');
     assert.equal(opts.method,'GET');
     assert.equal(opts.redirect,'error');
     assert.deepEqual(Object.keys(opts.headers),['OAI-Sites-Authorization']);
     const body={...completed,status};
     if(status!=='complete')delete body.finishedAt;
     if(status==='running')body.candidates=[{symbol:'AXSUSDT',detailComplete:false,coverage:6}];
     return Response.json(body);
   }
 });
 const first=await source();
 assert.equal(first.status,'complete');
 assert.equal((await source()).status,'complete');
 assert.equal(calls,1);

 status='running';clock+=6000;
 const live=await source();
 assert.equal(live.status,'running');
 assert.equal(live.candidates.length,1);
 assert.equal(live.servedFromLastComplete,false);

 status='failed';clock+=6000;
 const fallback=await source();
 assert.equal(fallback.status,'complete');
 assert.equal(fallback.sourceStatus,'failed');
 assert.equal(fallback.servedFromLastComplete,true);
 assert.equal(calls,3);
});

test('no completed result observed returns null for failed or cancelled jobs',async()=>{
 for(const status of ['failed','cancelled']){
  const source=createSource({env:{IGNITION_UPSTREAM_TOKEN:'test-only'},fetcher:async()=>Response.json({...completed,status,finishedAt:undefined})});
  assert.equal(await source(),null);
 }
});

test('queued, running and paused snapshots are passed through read-only',async()=>{
 for(const status of ['queued','running','paused']){
  const source=createSource({env:{IGNITION_UPSTREAM_TOKEN:'test-only'},fetcher:async()=>Response.json({...completed,status,finishedAt:undefined,candidates:[{symbol:'TESTUSDT'}]})});
  const row=await source();
  assert.equal(row.status,status);
  assert.equal(row.sourceStatus,status);
  assert.equal(row.servedFromLastComplete,false);
 }
});

test('upstream failures fail closed and concurrent calls share one request',async()=>{
 let calls=0;
 const source=createSource({env:{IGNITION_UPSTREAM_TOKEN:'test-only'},fetcher:async()=>{calls++;return new Response('',{status:403});}});
 const results=await Promise.allSettled([source(),source()]);
 assert.ok(results.every(x=>x.status==='rejected'));
 assert.equal(calls,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSource} from './upstream.mjs';
const completed={schemaVersion:'1.0',kind:'scan',id:'fixture',status:'complete',asOf:1,finishedAt:2,candidates:[]};
test('upstream is fixed GET with internal auth; completed results survive newer running work',async()=>{
 let clock=10000,status='complete',calls=0;
 const source=createSource({env:{IGNITION_UPSTREAM_TOKEN:'test-only'},now:()=>clock,fetcher:async(url,opts)=>{calls++;assert.equal(url,'https://ignition-scanner.tjdrprns10.chatgpt.site/api/v1/results');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.deepEqual(Object.keys(opts.headers),['OAI-Sites-Authorization']);return Response.json({...completed,status});}});
 assert.equal((await source()).id,'fixture');assert.equal((await source()).id,'fixture');assert.equal(calls,1);
 status='running';clock+=6000;assert.equal((await source()).status,'complete');assert.equal(calls,2);
});
test('no completed result observed returns null; failed jobs are never passed through',async()=>{const source=createSource({env:{IGNITION_UPSTREAM_TOKEN:'test-only'},fetcher:async()=>Response.json({...completed,status:'failed'})});assert.equal(await source(),null);});
test('upstream failures fail closed and concurrent calls share one request',async()=>{let calls=0;const source=createSource({env:{IGNITION_UPSTREAM_TOKEN:'test-only'},fetcher:async()=>{calls++;return new Response('',{status:403});}});const results=await Promise.allSettled([source(),source()]);assert.ok(results.every(x=>x.status==='rejected'));assert.equal(calls,1);});

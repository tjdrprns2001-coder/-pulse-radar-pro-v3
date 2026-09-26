import test from 'node:test';
import assert from 'node:assert/strict';
import {Binance,UpstreamError} from '../lib/scanner/binance.mjs';
import {MemoryStore} from './memory-store.mjs';

test('futures 403 fails over and remembers the working host',async()=>{
 const store=new MemoryStore(),calls=[];
 const api=new Binance(store,async url=>{
   calls.push(url);
   const host=new URL(url).host;
   if(host==='fapi.binance.com')return new Response('',{status:403});
   return Response.json({serverTime:123});
 },{futuresBases:['https://fapi.binance.com','https://fapi1.binance.com']});
 const first=await api.get('/fapi/v1/time',{},1);
 assert.equal(first.serverTime,123);
 assert.deepEqual(calls.map(x=>new URL(x).host),['fapi.binance.com','fapi1.binance.com']);
 calls.length=0;
 await api.get('/fapi/v1/ping',{},1);
 assert.equal(new URL(calls[0]).host,'fapi1.binance.com');
 assert.equal(api.metrics.failovers,1);
});

test('451 is host-specific and can fail over',async()=>{
 const store=new MemoryStore(),calls=[];
 const api=new Binance(store,async url=>{
   calls.push(new URL(url).host);
   return calls.length===1?new Response('',{status:451}):Response.json({serverTime:456});
 },{futuresBases:['https://fapi.binance.com','https://fapi2.binance.com']});
 const r=await api.get('/fapi/v1/time',{},1);
 assert.equal(r.serverTime,456);
 assert.deepEqual(calls,['fapi.binance.com','fapi2.binance.com']);
});

test('429 is global cooldown and never bypassed via another host',async()=>{
 const store=new MemoryStore(),calls=[];
 const api=new Binance(store,async url=>{
   calls.push(new URL(url).host);
   return new Response('',{status:429,headers:{'retry-after':'60'}});
 },{futuresBases:['https://fapi.binance.com','https://fapi1.binance.com']});
 await assert.rejects(()=>api.get('/fapi/v1/time'),e=>e instanceof UpstreamError&&e.status===429);
 assert.deepEqual(calls,['fapi.binance.com']);
 await assert.rejects(()=>api.get('/fapi/v1/ping'),e=>e instanceof UpstreamError&&e.status===429);
 assert.equal(calls.length,1);
});

test('spot 403 uses alternate spot endpoint',async()=>{
 const store=new MemoryStore(),calls=[];
 const api=new Binance(store,async url=>{
   calls.push(new URL(url).host);
   if(calls.length===1)return new Response('',{status:403});
   return Response.json({serverTime:789});
 },{spotBases:['https://api.binance.com','https://api-gcp.binance.com']});
 const r=await api.get('/api/v3/time',{},1,true);
 assert.equal(r.serverTime,789);
 assert.deepEqual(calls,['api.binance.com','api-gcp.binance.com']);
});

test('all blocked hosts return final upstream error without infinite retry',async()=>{
 const store=new MemoryStore(),calls=[];
 const api=new Binance(store,async url=>{calls.push(new URL(url).host);return new Response('',{status:403});},{futuresBases:['https://fapi.binance.com','https://fapi1.binance.com']});
 await assert.rejects(()=>api.get('/fapi/v1/time'),e=>e instanceof UpstreamError&&e.status===403);
 assert.equal(calls.length,2);
});

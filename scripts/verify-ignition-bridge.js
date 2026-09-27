'use strict';
const assert=require('assert');
const handler=require('../handlers/ignition-results.js');

function makeRes(){
 let code=200,body=null,headers={};
 return{
  setHeader(k,v){headers[k]=String(v);return this},
  status(n){code=n;return this},
  json(v){body=v;return v},
  snapshot(){return{code,body,headers}}
 };
}

(async()=>{
 {
  const res=makeRes();
  await handler({method:'GET'},res,{env:{}});
  const s=res.snapshot();
  assert.equal(s.code,503);
  assert.equal(s.body.error,'ignition_bridge_not_configured');
 }
 {
  let auth='';
  const res=makeRes();
  await handler({method:'GET'},res,{
   env:{IGNITION_API_BASE_URL:'https://scanner.example',IGNITION_RESULTS_TOKEN:'secret'},
   now:()=>200000,
   fetchImpl:async(_url,opt)=>{
    auth=opt.headers.authorization;
    return{ok:true,status:200,json:async()=>({
      schemaVersion:'1.0',status:'complete',scan:{id:'scan-1',asOf:140000,finishedAt:150000,partialData:false},
      candidates:[
       {symbol:'AXSUSDT',score:81,detailComplete:true,coverage:10,reasons:['ready'],oi:{source:'BINANCE_FUTURES'},frames:{'1h':{source:'BYBIT_LINEAR_FALLBACK'},'4h':{source:'BYBIT_LINEAR_FALLBACK'}},taker:{source:'UNAVAILABLE',ratio:null},funding:{source:'BYBIT_LINEAR_FALLBACK'}},
       {symbol:'KAVAUSDT',score:72,detailComplete:false,coverage:8,reasons:['partial']}
      ]
    })};
   }
  });
  const s=res.snapshot();
  assert.equal(s.code,200);
  assert.equal(auth,'Bearer secret');
  assert.equal(s.body.status,'ok');
  assert.equal(s.body.state,'ready');
  assert.equal(s.body.sourceStatus,'complete');
  assert.equal(s.body.servedFromLastComplete,false);
  assert.equal(s.body.candidateCount,2);
  assert.equal(s.body.usableCount,1);
  assert.equal(s.body.partialCount,1);
  assert.equal(s.body.freshnessState,'live');
  assert.equal(s.body.id,'scan-1');
  assert.equal(s.body.finishedAt,150000);
  assert.equal(s.body.candidates[0].usable,true);
  assert.equal(s.body.candidates[1].usable,false);
  assert.equal(s.body.dataMode,'mixed-fallback');
  assert.equal(s.body.fallbackCandidateCount,1);
  assert.equal(s.body.candidates[0].provenance.mode,'mixed');
  assert.deepEqual(s.body.candidates[0].provenance.frames,['BYBIT']);
  assert.equal(s.body.candidates[0].provenance.oi,'BINANCE');
  assert.equal(s.body.candidates[0].provenance.taker,'UNAVAILABLE');
 }
 {
  const res=makeRes();
  await handler({method:'GET'},res,{env:{IGNITION_API_BASE_URL:'https://scanner.example',IGNITION_RESULTS_TOKEN:'secret'},now:()=>200000,fetchImpl:async()=>({ok:true,status:200,json:async()=>({schemaVersion:'1.0',status:'running',sourceStatus:'running',servedFromLastComplete:false,scan:{id:'scan-2',asOf:190000,finishedAt:null,partialData:true,stage:'deep'},counts:{candidates:8,deep:3},candidates:[{symbol:'TESTUSDT',score:55,detailComplete:false,coverage:4}]})})});
  const s=res.snapshot();assert.equal(s.code,200);assert.equal(s.body.state,'partial');assert.equal(s.body.active,true);assert.equal(s.body.partialCount,1);
 }
 {
  const res=makeRes();
  await handler({method:'GET'},res,{env:{IGNITION_API_BASE_URL:'https://scanner.example',IGNITION_RESULTS_TOKEN:'secret'},now:()=>200000,fetchImpl:async()=>({ok:true,status:200,json:async()=>({schemaVersion:'1.0',status:'complete',sourceStatus:'failed',servedFromLastComplete:true,scan:{id:'scan-1',asOf:140000,finishedAt:150000,partialData:false,stage:'complete'},candidates:[]})})});
  const s=res.snapshot();assert.equal(s.code,200);assert.equal(s.body.state,'fallback');assert.equal(s.body.sourceStatus,'failed');assert.equal(s.body.servedFromLastComplete,true);
 }
 {
  const res=makeRes();
  await handler({method:'POST'},res,{env:{}});
  assert.equal(res.snapshot().code,405);
 }
 console.log('ignition bridge PASS');
})().catch(e=>{console.error(e);process.exit(1)});

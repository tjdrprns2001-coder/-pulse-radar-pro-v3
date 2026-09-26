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
       {symbol:'AXSUSDT',score:81,detailComplete:true,coverage:10,reasons:['ready']},
       {symbol:'KAVAUSDT',score:72,detailComplete:false,coverage:8,reasons:['partial']}
      ]
    })};
   }
  });
  const s=res.snapshot();
  assert.equal(s.code,200);
  assert.equal(auth,'Bearer secret');
  assert.equal(s.body.status,'ok');
  assert.equal(s.body.candidateCount,2);
  assert.equal(s.body.usableCount,1);
  assert.equal(s.body.partialCount,1);
  assert.equal(s.body.freshnessState,'live');
  assert.equal(s.body.id,'scan-1');
  assert.equal(s.body.finishedAt,150000);
  assert.equal(s.body.candidates[0].usable,true);
  assert.equal(s.body.candidates[1].usable,false);
 }
 {
  const res=makeRes();
  await handler({method:'POST'},res,{env:{}});
  assert.equal(res.snapshot().code,405);
 }
 console.log('ignition bridge PASS');
})().catch(e=>{console.error(e);process.exit(1)});

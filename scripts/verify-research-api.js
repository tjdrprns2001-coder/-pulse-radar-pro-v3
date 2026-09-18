'use strict';
const assert=require('assert');
const handler=require('../api/research-backtest.js');
function call(method,query={},body={},headers={},ctx={}){
 return new Promise(resolve=>{
  let code=200,payload=null;const res={setHeader(){},status(n){code=n;return this},json(v){payload=v;resolve({code,payload});return v}};
  handler({method,query,body,headers},res,ctx);
 });
}
(async()=>{
 const runtime={
  async status(){return{runs:[],manifests:[{manifestVersion:'m1',frozen:true}],universes:[]}},
  async stats({split}){return{split,sampleCount:2,labels:{}}},
  async events(){return[{eventId:'e1'}]},
  async runCollection(body){return{status:'partial',runId:body.runId}},
  async evaluate(body){return{evaluated:1,runId:body.runId}}
 };
 let r=await call('GET',{action:'status'},{},{},{runtime});assert.equal(r.code,200);assert.equal(r.payload.status,'ok');
 r=await call('GET',{action:'stats',split:'validation'},{},{},{runtime});assert.equal(r.code,200);assert.equal(r.payload.data.split,'validation');
 r=await call('GET',{action:'events',limit:'999'},{},{},{runtime});assert.equal(r.code,200);assert.equal(r.payload.items.length,1);
 r=await call('GET',{action:'nope'},{},{},{runtime});assert.equal(r.code,400);
 r=await call('POST',{action:'run'},{runId:'r1'},{},{runtime,adminToken:''});assert.equal(r.code,503,'POST must stay locked without configured token');
 r=await call('POST',{action:'run'},{runId:'r1'},{'x-research-admin-token':'bad'},{runtime,adminToken:'secret'});assert.equal(r.code,401);
 r=await call('POST',{action:'run'},{runId:'r1'},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.code,200);assert.equal(r.payload.status,'ok');
 r=await call('POST',{action:'evaluate'},{runId:'r1'},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.code,200);assert.equal(r.payload.data.evaluated,1);
 console.log('research api PASS');
})().catch(e=>{console.error(e);process.exit(1)});

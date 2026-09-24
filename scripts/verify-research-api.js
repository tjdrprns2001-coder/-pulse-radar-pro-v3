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
  async evaluate(body){return{evaluated:1,runId:body.runId}},
  dantePresets:{'256':{id:'256',label:'256 선행 후보'}},
  async reports(){return[{id:'rep1',type:'dante-backtest'}]},
  async report(id){return id==='rep1'?{id:'rep1'}:null},
  async paperList(){return[{id:'pt1',state:'OPEN'}]},
  async paperStats(){return{total:1,open:1,closed:0}},
  async runDante(body){return{id:'dr1',presetId:body.presetId}},
  async runCausalIct(body){return{id:'ci1',symbol:body.symbol||'BTCUSDT'}},
  async runWalkForward(body){return{id:'wf1',presetId:body.presetId}},
  async paperOpen(){return{id:'pt1',state:'OPEN'}},
  async paperMark(){return{id:'pt1',state:'OPEN',lastMarkPrice:101}},
  async paperClose(){return{id:'pt1',state:'CLOSED'}}
 };
 let r=await call('GET',{action:'status'},{},{},{runtime});assert.equal(r.code,200);assert.equal(r.payload.status,'ok');
 r=await call('GET',{action:'stats',split:'validation'},{},{},{runtime});assert.equal(r.code,200);assert.equal(r.payload.data.split,'validation');
 r=await call('GET',{action:'events',limit:'999'},{},{},{runtime});assert.equal(r.code,200);assert.equal(r.payload.items.length,1);
 r=await call('GET',{action:'presets'},{},{},{runtime});assert.equal(r.code,200);assert(r.payload.data['256']);
 r=await call('GET',{action:'reports'},{},{},{runtime});assert.equal(r.payload.items[0].id,'rep1');
 r=await call('GET',{action:'report',id:'rep1'},{},{},{runtime});assert.equal(r.payload.data.id,'rep1');
 r=await call('GET',{action:'paper-stats'},{},{},{runtime});assert.equal(r.payload.data.total,1);
 r=await call('GET',{action:'paper'},{},{},{runtime});assert.equal(r.payload.items[0].id,'pt1');
 r=await call('GET',{action:'nope'},{},{},{runtime});assert.equal(r.code,400);
 r=await call('POST',{action:'run'},{runId:'r1'},{},{runtime,adminToken:''});assert.equal(r.code,503,'POST must stay locked without configured token');
 r=await call('POST',{action:'run'},{runId:'r1'},{'x-research-admin-token':'bad'},{runtime,adminToken:'secret'});assert.equal(r.code,401);
 r=await call('POST',{action:'run'},{runId:'r1'},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.code,200);assert.equal(r.payload.status,'ok');
 r=await call('POST',{action:'evaluate'},{runId:'r1'},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.code,200);assert.equal(r.payload.data.evaluated,1);
 r=await call('POST',{action:'dante-run'},{presetId:'256'},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.code,200);assert.equal(r.payload.data.id,'dr1');
 r=await call('POST',{action:'causal-ict-run'},{symbol:'BTCUSDT',timeframe:'4h'},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.code,200);assert.equal(r.payload.data.id,'ci1');
 r=await call('POST',{action:'walk-forward'},{presetId:'256'},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.code,200);assert.equal(r.payload.data.id,'wf1');
 r=await call('POST',{action:'paper-open'},{},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.payload.data.state,'OPEN');
 r=await call('POST',{action:'paper-mark'},{},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.payload.data.lastMarkPrice,101);
 r=await call('POST',{action:'paper-close'},{},{'x-research-admin-token':'secret'},{runtime,adminToken:'secret'});assert.equal(r.payload.data.state,'CLOSED');
 console.log('research api PASS');
})().catch(e=>{console.error(e);process.exit(1)});

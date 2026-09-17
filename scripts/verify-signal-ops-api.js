'use strict';
const assert=require('assert');
const calibration=require('../api/signal-calibration.js');
const alerts=require('../api/signal-alerts.js');
const health=require('../api/signal-health.js');
const backfill=require('../api/signal-backfill.js');
function res(){let statusCode=200,body=null,headers={};return{setHeader(k,v){headers[k]=String(v)},status(n){statusCode=n;return this},json(v){body=v;return v},out(){return{statusCode,body,headers}}}}
(async()=>{
  const performance={async getPerformance(){return{generatedAt:1,calibration:{minSamples:30,classes:{'PRE-SURGE':{horizons:{h1:{sampleCount:30,status:'통계 사용 가능'}}}}}}}};
  let r=res();await calibration({method:'GET',query:{class:'PRE-SURGE',horizon:'h1'}},r,{performance});assert.equal(r.out().statusCode,200);assert.equal(r.out().body.status,'ok');assert(r.out().body.calibration);
  r=res();await calibration({method:'GET',query:{horizon:'bad'}},r,{performance});assert.equal(r.out().statusCode,400);
  const alertService={async list(){return[{id:'a1',symbol:'AAAUSDT'}]}};r=res();await alerts({method:'GET',query:{symbol:'AAAUSDT',limit:'10'}},r,{alerts:alertService});assert.equal(r.out().body.items.length,1);
  const store={async listSnapshots(){return[]},async listOutcomes(){return[]},async listEvidence(){return[]},async listAlerts(){return[]},async getCheckpoint(){return{jobId:'j1',nextTs:100}}};
  r=res();await health({method:'GET',query:{}},r,{store,provider:{async getUniverse(){return{symbols:[]}}},performance});assert.equal(r.out().statusCode,200);assert.equal(r.out().body.status,'ok');assert(r.out().body.modules);
  r=res();await backfill({method:'GET',query:{job:'j1'}},r,{store});assert.equal(r.out().statusCode,200);assert.equal(r.out().body.checkpoint.jobId,'j1');
  r=res();await backfill({method:'POST',query:{},headers:{},body:{}},r,{store,backfill:{async run(){throw new Error('should not run')}},adminToken:'secret'});assert.equal(r.out().statusCode,401);
  let ran=0;r=res();await backfill({method:'POST',query:{},headers:{'x-signal-admin-token':'secret'},body:{jobId:'j2',symbols:['BTCUSDT'],startTs:0,endTs:3600000,stepMs:900000}},r,{store,backfill:{async run(x){ran++;return{status:'partial',checkpoint:{jobId:x.jobId}}}},adminToken:'secret'});assert.equal(r.out().statusCode,200);assert.equal(ran,1);
  console.log('signal operations api PASS');
})().catch(e=>{console.error(e);process.exit(1)});

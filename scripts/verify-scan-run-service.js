'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createScanRunService}=require('../lib/coin-scan/scan-run-service.js');

const symbols=['AUSDT','BUSDT','CUSDT','DUSDT','EUSDT','FUSDT','GUSDT'];
let deepCalls=0;
const scanService={async run({mode,symbols:requested=[]}={}){
  if(mode==='summary')return{status:'ok',updatedAt:1,scanCount:100,candidateSymbols:symbols.slice(0,4),items:symbols.map(s=>({symbol:s,candidateScore:10}))};
  if(mode==='prescan')return{status:'ok',updatedAt:2,prescan:{poolCount:7,outputCount:7},candidateSymbols:symbols,items:symbols.map((s,i)=>({symbol:s,preScan:{score:70+i,best:{key:'MA'}}}))};
  if(mode==='deep'){deepCalls++;return{status:'ok',updatedAt:3,items:requested.map(s=>({symbol:s,deep:true,strategyCycle:{stage:'PATTERN_READY'}})),autoScreening:{all:requested.map(s=>({symbol:s,classification:'WATCHLIST'})),watchlist:requested.map(s=>({symbol:s,classification:'WATCHLIST'}))}}}
  throw new Error('unexpected mode '+mode);
}};
(async()=>{
  const store=createMemoryStore(),svc=createScanRunService({scanService,store,now:(()=>{let t=1000;return()=>++t})()});
  const started=await svc.start({precision:true});
  assert.equal(started.status,'QUEUED');
  const done=await svc.execute(started.id);
  assert.equal(done.status,'DONE');
  assert.equal(done.deepDone,7);
  assert.equal(done.deepTotal,7);
  assert.equal(deepCalls,2,'7 symbols should run as 6+1 chunks');
  const a=done.items.find(x=>x.symbol==='AUSDT');
  assert(a.deep,'deep result must replace/merge summary item');
  assert(a.preScan&&a.preScan.score===70,'prescan evidence must survive deep merge');
  assert.equal(done.autoScreening.all.length,7);
  const reread=await svc.get(started.id);
  assert.equal(reread.status,'DONE');
  console.log('scan run service PASS');
})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createScanRunService,DEEP_CHUNK,DEEP_WORKERS,FULL_VALIDATION_CHUNKS}=require('../lib/coin-scan/scan-run-service.js');

const symbols=Array.from({length:17},(_,i)=>String.fromCharCode(65+i)+'USDT');
let deepCalls=0,activeDeep=0,maxActiveDeep=0;
const validationModes=[];
const scanService={async run({mode,symbols:requested=[],validation='full',precision=false}={}){
  if(mode==='summary')return{status:'ok',updatedAt:1,scanCount:100,candidateSymbols:symbols.slice(0,12),items:symbols.map(s=>({symbol:s,candidateScore:10}))};
  if(mode==='prescan')return{status:'ok',updatedAt:2,prescan:{poolCount:17,outputCount:17},candidateSymbols:symbols,items:symbols.map((s,i)=>({symbol:s,preScan:{score:70+i,best:{key:'MA'}}}))};
  if(mode==='deep'){
    deepCalls++;activeDeep++;maxActiveDeep=Math.max(maxActiveDeep,activeDeep);validationModes.push(validation);
    await new Promise(r=>setTimeout(r,8));
    activeDeep--;
    return{status:'ok',updatedAt:3,deepScanCount:requested.length,items:requested.map(s=>({symbol:s,deep:true,strategyCycle:{stage:'PATTERN_READY'}})),autoScreening:{all:requested.map(s=>({symbol:s,classification:'WATCHLIST'})),watchlist:requested.map(s=>({symbol:s,classification:'WATCHLIST'}))}};
  }
  throw new Error('unexpected mode '+mode);
}};
(async()=>{
  assert.equal(DEEP_CHUNK,8,'autoscan deep chunks should be wider than v1');
  assert.equal(DEEP_WORKERS,2,'deep chunk workers must stay bounded to reduce rate-limit risk');
  assert.equal(FULL_VALIDATION_CHUNKS,2,'expensive validation should be front-loaded to top candidates');

  const store=createMemoryStore(),svc=createScanRunService({scanService,store,now:(()=>{let t=1000;return()=>++t})()});
  const started=await svc.start({precision:false});
  assert.equal(started.status,'QUEUED');
  const done=await svc.execute(started.id);
  assert.equal(done.status,'DONE');
  assert.equal(done.deepDone,17);
  assert.equal(done.deepTotal,17);
  assert.equal(deepCalls,3,'17 symbols should run as 8+8+1 chunks');
  assert(maxActiveDeep>=2,'persistent scan-run must execute deep chunks concurrently');
  assert(maxActiveDeep<=DEEP_WORKERS,'deep concurrency must stay bounded');
  assert.deepEqual(validationModes.sort(),['light','light','off'].sort(),'only first two chunks should get setup validation in normal mode');

  const a=done.items.find(x=>x.symbol==='AUSDT');
  assert(a.deep,'deep result must replace/merge summary item');
  assert(a.preScan&&a.preScan.score===70,'prescan evidence must survive deep merge');
  assert.equal(done.autoScreening.all.length,17);
  const reread=await svc.get(started.id);
  assert.equal(reread.status,'DONE');

  // Precision mode preserves full expensive validation for the highest-priority chunks only.
  deepCalls=0;activeDeep=0;maxActiveDeep=0;validationModes.length=0;
  const precisionRun=await svc.start({precision:true});
  await svc.execute(precisionRun.id);
  assert.deepEqual(validationModes.sort(),['full','full','off'].sort(),'precision mode should fully validate only the top chunks');

  console.log('scan run service PASS');
})().catch(e=>{console.error(e);process.exit(1)});

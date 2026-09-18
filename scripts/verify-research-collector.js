'use strict';
const assert=require('assert');
const {createMemoryResearchStore}=require('../lib/research-backtest-v2/store.js');
const {createUniverseSnapshot}=require('../lib/research-backtest-v2/universe.js');
const {createCollector,alignCloseTs}=require('../lib/research-backtest-v2/collector.js');
const {createFrozenManifest}=require('../lib/research-backtest-v2/contracts.js');

(async()=>{
 const store=createMemoryResearchStore();
 const manifest=createFrozenManifest({manifestVersion:'m1',createdAt:1,derivedFromSplit:'train',screenerConfigVersion:'s1',signalTimeframe:'15m',evaluationGridMs:900000,thresholds:{scoreMin:50}});
 const universe=createUniverseSnapshot({version:'u1',mode:'current-survivors-only',observedAt:1,exchangeInfo:{symbols:[
  {symbol:'AAAUSDT',baseAsset:'AAA',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'BBBUSDT',baseAsset:'BBB',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}
 ]}});
 assert.equal(universe.survivorshipSafe,false);
 assert.equal(alignCloseTs(1,900000),899999);
 assert.equal(alignCloseTs(900000,900000),1799999);
 let futureCalls=0,frameCalls=0;
 const provider={
  async getHistoricalFrames(symbol,{simulatedTs}){frameCalls++;return {'15m':[[simulatedTs-899999,1,1,1,1,1,simulatedTs,1,1,1,1,0]]}},
  async getFutureBars(){futureCalls++;throw new Error('collector must never request future')}
 };
 const buildFeatures=({symbol,signalCandleCloseTs,manifest,universe})=>({
   eventId:symbol+':'+signalCandleCloseTs,symbol,signalCandleOpenTs:signalCandleCloseTs-899999,signalCandleCloseTs,entryPrice:1,
   datasetSplit:'train',universeVersion:universe.universeVersion,universeMode:universe.universeMode,survivorshipSafe:universe.survivorshipSafe,
   featureSchemaVersion:'research-features-v1',screenerConfigVersion:manifest.screenerConfigVersion,outcomeSchemaVersion:'research-outcomes-v1',
   thresholdManifestVersion:manifest.manifestVersion,source:'historical-replay',numericFeatures:{score:symbol==='AAAUSDT'?60:40},featureAvailability:{score:true}
 });
 const screen=(e)=>e.numericFeatures.score>=50;
 const svc=createCollector({provider,store,buildFeatures,screen,maxStepsPerRun:2,now:()=>999});
 const r1=await svc.run({runId:'r1',manifest,universe,startTs:1,endTs:2699999});
 assert.equal(r1.status,'partial');assert.equal(r1.matchedEvents,2);assert.equal(futureCalls,0);
 assert.equal((await store.listEvents()).length,2);
 const cp=await store.getCheckpoint('r1');assert.equal(cp.nextTs,2699999);
 const r2=await svc.run({runId:'r1',manifest,universe,startTs:1,endTs:2699999});
 assert.equal(r2.status,'complete');assert.equal((await store.listEvents()).length,3);
 const before=(await store.listEvents()).length;await svc.run({runId:'r1',manifest,universe,startTs:1,endTs:2699999});assert.equal((await store.listEvents()).length,before);
 assert(frameCalls>=6);assert.equal(futureCalls,0);

 const retryStore=createMemoryResearchStore();let fail=true;
 const retryProvider={async getHistoricalFrames(symbol,{simulatedTs}){if(symbol==='BBBUSDT'&&fail){fail=false;throw new Error('temporary')}return{'15m':[[0,1,1,1,1,1,simulatedTs,1,1,1,1,0]]}}};
 const allMatch=({symbol,signalCandleCloseTs,manifest,universe})=>({eventId:symbol+':'+signalCandleCloseTs,symbol,signalCandleCloseTs,signalCandleOpenTs:0,entryPrice:1,datasetSplit:'train',universeVersion:universe.universeVersion,universeMode:universe.universeMode,survivorshipSafe:false,featureSchemaVersion:'f',screenerConfigVersion:manifest.screenerConfigVersion,outcomeSchemaVersion:'o',thresholdManifestVersion:manifest.manifestVersion,source:'historical-replay',numericFeatures:{x:1},featureAvailability:{x:true}});
 const retry=createCollector({provider:retryProvider,store:retryStore,buildFeatures:allMatch,screen:()=>true,maxStepsPerRun:1});
 let rr=await retry.run({runId:'retry',manifest,universe,startTs:1,endTs:899999});
 assert.equal(rr.status,'partial');assert(rr.errors.length===1);assert.equal((await retryStore.getCheckpoint('retry')).nextTs,899999,'failed timestamp must not advance');
 rr=await retry.run({runId:'retry',manifest,universe,startTs:1,endTs:899999});
 assert.equal(rr.status,'complete');assert.equal((await retryStore.listEvents()).length,2,'retry must recover missing symbol while deduping success');
 console.log('research collector PASS');
})().catch(e=>{console.error(e);process.exit(1)});

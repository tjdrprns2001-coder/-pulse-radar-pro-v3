'use strict';
const assert=require('assert');
const {createMemoryResearchStore}=require('../lib/research-backtest-v2/store.js');
const {createUniverseSnapshot}=require('../lib/research-backtest-v2/universe.js');
const {createCollector}=require('../lib/research-backtest-v2/collector.js');
const {createFrozenManifest}=require('../lib/research-backtest-v2/contracts.js');

(async()=>{
 const store=createMemoryResearchStore();
 const manifest=createFrozenManifest({manifestVersion:'m1',createdAt:1,derivedFromSplit:'train',screenerConfigVersion:'s1',signalTimeframe:'15m',evaluationGridMs:900000,thresholds:{scoreMin:50}});
 const universe=createUniverseSnapshot({version:'u1',mode:'current-survivors-only',observedAt:1,exchangeInfo:{symbols:[
  {symbol:'AAAUSDT',baseAsset:'AAA',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'BBBUSDT',baseAsset:'BBB',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}
 ]}});
 assert.equal(universe.survivorshipSafe,false);
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
 const r1=await svc.run({runId:'r1',manifest,universe,startTs:900000,endTs:2700000});
 assert.equal(r1.status,'partial');assert.equal(r1.matchedEvents,2);assert.equal(futureCalls,0);
 assert.equal((await store.listEvents()).length,2,'all matches from completed steps must persist');
 const cp=await store.getCheckpoint('r1');assert.equal(cp.nextTs,2700000);
 const r2=await svc.run({runId:'r1',manifest,universe,startTs:900000,endTs:2700000});
 assert.equal(r2.status,'complete');assert.equal((await store.listEvents()).length,3);
 const before=(await store.listEvents()).length;await svc.run({runId:'r1',manifest,universe,startTs:900000,endTs:2700000});
 assert.equal((await store.listEvents()).length,before,'resume must dedupe');
 assert(frameCalls>=6);assert.equal(futureCalls,0);
 const run=await store.getRun('r1');assert.equal(run.universeMode,'current-survivors-only');assert.equal(run.survivorshipSafe,false);
 console.log('research collector PASS');
})().catch(e=>{console.error(e);process.exit(1)});

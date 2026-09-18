'use strict';
const assert=require('assert');
const {splitForTimestamp,createFrozenManifest,assertValidationManifest,eventId,FEATURE_SCHEMA_VERSION,OUTCOME_SCHEMA_VERSION}=require('../lib/research-backtest-v2/contracts.js');
const {createMemoryResearchStore,createBlobResearchStore}=require('../lib/research-backtest-v2/store.js');

(async()=>{
  const trainEnd=Date.parse('2024-12-31T23:59:59.999Z');
  const valStart=Date.parse('2025-01-01T00:00:00.000Z');
  const valEnd=Date.parse('2026-09-18T00:00:00.000Z');
  assert.equal(splitForTimestamp(trainEnd,valEnd),'train');
  assert.equal(splitForTimestamp(valStart,valEnd),'validation');
  assert.equal(splitForTimestamp(valStart,null),'validation','null validation end must use default');
  assert.equal(splitForTimestamp(valEnd+1,valEnd),'excluded');

  const manifest=createFrozenManifest({
    manifestVersion:'threshold-v1',
    createdAt:1000,
    derivedFromSplit:'train',
    featureSchemaVersion:FEATURE_SCHEMA_VERSION,
    screenerConfigVersion:'screen-v1',
    signalTimeframe:'15m',
    evaluationGridMs:900000,
    thresholds:{volumeMultiple:3,ribbonAtrMax:1}
  });
  assert.equal(manifest.frozen,true);
  assert(Object.isFrozen(manifest));
  assert(Object.isFrozen(manifest.thresholds));
  assert.equal(assertValidationManifest(manifest),true);
  assert.throws(()=>assertValidationManifest({...manifest,frozen:false}),/frozen/i);
  assert.throws(()=>assertValidationManifest({...manifest,derivedFromSplit:'validation'}),/train/i);

  const a=eventId({symbol:'btcusdt',signalCandleCloseTs:12345,screenerConfigVersion:'screen-v1'});
  const b=eventId({symbol:'BTCUSDT',signalCandleCloseTs:12345,screenerConfigVersion:'screen-v1'});
  assert.equal(a,b);
  assert.notEqual(a,eventId({symbol:'BTCUSDT',signalCandleCloseTs:12346,screenerConfigVersion:'screen-v1'}));

  const mem=createMemoryResearchStore();
  const event={eventId:a,symbol:'BTCUSDT',numericFeatures:{rsi:null},featureSchemaVersion:FEATURE_SCHEMA_VERSION,outcomeSchemaVersion:OUTCOME_SCHEMA_VERSION};
  assert.equal(await mem.putEvent(event),true);
  assert.equal(await mem.putEvent({...event,numericFeatures:{rsi:0}}),false,'event must be immutable/deduped');
  assert.equal((await mem.getEvent(a)).numericFeatures.rsi,null,'null feature must remain null');
  await mem.putOutcome(a,{eventId:a,labels:{Hit_6H_8pct:false}});
  assert.equal((await mem.getEvent(a)).numericFeatures.rsi,null,'outcome write must not mutate event');
  await mem.putManifest(manifest.manifestVersion,manifest);
  await mem.putCheckpoint('run-1',{nextTs:123});
  assert.equal((await mem.getCheckpoint('run-1')).nextTs,123);

  const blobs=new Map();
  const fakeGetStore=(name)=>({
    async get(key,{type}={}){const raw=blobs.get(name+':'+key);if(raw==null)return null;return type==='json'?JSON.parse(raw):raw},
    async setJSON(key,value){blobs.set(name+':'+key,JSON.stringify(value))},
    async set(key,value){blobs.set(name+':'+key,String(value))},
    async list({prefix}){const keys=[...blobs.keys()].filter(k=>k.startsWith(name+':'+prefix)).map(k=>({key:k.slice(name.length+1)}));return{blobs:keys}}
  });
  const bs=createBlobResearchStore({getStore:fakeGetStore});
  await bs.putEvent(event);
  await bs.putOutcome(a,{eventId:a});
  const keys=[...blobs.keys()];
  assert(keys.some(k=>k.includes('pulse-research-backtest-v2:research-v2/events/')));
  assert(keys.some(k=>k.includes('pulse-research-backtest-v2:research-v2/outcomes/')));
  assert(!keys.some(k=>k.includes('pulse-signal-performance')));

  console.log('research contracts PASS');
})().catch(e=>{console.error(e);process.exit(1)});

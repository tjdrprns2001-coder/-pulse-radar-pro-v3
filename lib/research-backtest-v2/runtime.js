'use strict';
const {createBlobResearchStore}=require('./store.js');
const {createFrozenManifest,finite}=require('./contracts.js');
const {createUniverseSnapshot}=require('./universe.js');
const {createCollector}=require('./collector.js');
const {buildFeatureSnapshot,trimClosedFrames}=require('./features.js');
const {createOutcomeEvaluator}=require('./outcomes.js');
const {buildStats}=require('./stats.js');
const {classifyHistorical}=require('../signal-performance/backfill-classifier.js');
const {createBinanceProvider}=require('../coin-scan/binance-provider.js');

function createFeatureBuilder({classifyFn=classifyHistorical}={}){
  return async function buildResearchFeature(args={}){
    const closedFrames=trimClosedFrames(args.frames,args.signalCandleCloseTs);
    const scannerItem=await classifyFn({symbol:args.symbol,frames:closedFrames,simulatedTs:args.signalCandleCloseTs});
    return buildFeatureSnapshot({...args,frames:closedFrames,scannerItem});
  };
}
function screenEvent(event,manifest){
  const t=manifest?.thresholds||{},f=event?.numericFeatures||{};
  const checks=[
    ['volumeMultiple','volumeAcceleration15m',(a,b)=>a>=b],
    ['takerMin','takerRatio',(a,b)=>a>=b],
    ['ribbonAtrMax','ribbonWidthAtr15m',(a,b)=>a<=b],
    ['minCandidateScore','candidateScore',(a,b)=>a>=b],
    ['rsiMin','rsi15m',(a,b)=>a>=b],
    ['rsiMax','rsi15m',(a,b)=>a<=b]
  ];
  for(const [tk,fk,cmp] of checks){
    const threshold=finite(t[tk]);if(threshold==null)continue;
    const value=finite(f[fk]);if(value==null||!cmp(value,threshold))return false;
  }
  if(t.requireBreakout===true&&f.breakout!==1)return false;
  return true;
}
function latestBy(rows,key='createdAt'){return rows.slice().sort((a,b)=>(Number(b?.[key])||0)-(Number(a?.[key])||0))[0]||null}
function createResearchRuntime({getStore,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
  if(typeof getStore!=='function')throw new Error('Netlify Blobs getStore adapter required');
  const store=createBlobResearchStore({getStore});
  const provider=createBinanceProvider({fetchImpl,now});
  const collector=createCollector({
    provider,store,now,maxStepsPerRun:8,screen:screenEvent,
    buildFeatures:createFeatureBuilder()
  });
  const evaluator=createOutcomeEvaluator({provider,store,maxEventsPerRun:12});
  async function resolveManifest(body={}){
    let manifest=null;
    if(body.manifest){
      manifest=createFrozenManifest(body.manifest);
      const existing=await store.getManifest(manifest.manifestVersion);
      if(existing&&JSON.stringify(existing)!==JSON.stringify(manifest))throw new Error('manifest version already exists with different content');
      if(!existing)await store.putManifest(manifest.manifestVersion,manifest);
    }else if(body.manifestVersion)manifest=await store.getManifest(body.manifestVersion);
    if(!manifest)throw new Error('frozen manifest not found');
    return manifest;
  }
  async function resolveUniverse(body={}){
    if(body.universeVersion){const saved=await store.getUniverse(body.universeVersion);if(saved)return saved}
    const info=await provider.getUniverse();
    const observedAt=now(),version=String(body.universeVersion||('current-survivors-'+new Date(observedAt).toISOString().slice(0,10)));
    const universe=createUniverseSnapshot({exchangeInfo:info,version,mode:'current-survivors-only',observedAt,source:'binance-current-exchangeInfo'});
    const existing=await store.getUniverse(version);if(!existing)await store.putUniverse(version,universe);
    return existing||universe;
  }
  async function status(){
    const [runs,manifests,universes]=await Promise.all([store.listRuns(),store.listManifests(),store.listUniverses()]);
    return{runs:runs.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,20),manifests:manifests.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)),universes,survivorshipWarning:universes.some(x=>x.survivorshipSafe!==true)};
  }
  async function runCollection(body={}){
    const manifest=await resolveManifest(body),universe=await resolveUniverse(body);
    const startTs=finite(body.startTs),endTs=finite(body.endTs);if(startTs==null||endTs==null)throw new Error('startTs and endTs required');
    const runId=String(body.runId||'').trim();if(!runId)throw new Error('runId required');
    return collector.run({runId,manifest,universe,startTs,endTs,validationEndTs:finite(body.validationEndTs)});
  }
  async function evaluate(body={}){return evaluator.run({runId:String(body.runId||''),limit:body.limit})}
  async function stats({split='train',manifestVersion=null}={}){
    const manifests=await store.listManifests();const manifest=manifestVersion?await store.getManifest(manifestVersion):latestBy(manifests);
    if(!manifest)return{initialized:false,split,sampleCount:0,evaluatedCount:0,unbiasedSampleCount:0,survivorshipWarning:false,validationIntegrity:'not-initialized',labels:{Hit_6H_8pct:{evaluatedCount:0,hitCount:0,missCount:0,hitRate:null},Hit_24H_12pct:{evaluatedCount:0,hitCount:0,missCount:0,hitRate:null}},horizons:{},features:{},featureComparison:{},sectorAnalysis:{status:'표본 부족',minimum:30,counts:{}}};
    const [events,outcomes]=await Promise.all([store.listEvents(),store.listOutcomes()]);
    return buildStats({events,outcomes,manifest,split});
  }
  async function events({split=null,limit=50}={}){
    let rows=await store.listEvents();if(split)rows=rows.filter(x=>x.datasetSplit===split);
    return rows.sort((a,b)=>b.signalCandleCloseTs-a.signalCandleCloseTs).slice(0,Math.max(1,Math.min(200,Number(limit)||50)));
  }
  return{store,provider,collector,evaluator,status,runCollection,evaluate,stats,events,screenEvent};
}
module.exports={createFeatureBuilder,screenEvent,createResearchRuntime};

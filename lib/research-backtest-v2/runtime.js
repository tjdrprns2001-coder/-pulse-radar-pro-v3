'use strict';
const {createBlobResearchStore}=require('./store.js');
const {createFrozenManifest,finite}=require('./contracts.js');
const {createUniverseSnapshot}=require('./universe.js');
const {createCollector}=require('./collector.js');
const {buildFeatureSnapshot,trimClosedFrames}=require('./features.js');
const {createOutcomeEvaluator}=require('./outcomes.js');
const {buildStats}=require('./stats.js');
const {classifyHistorical}=require('../signal-performance/backfill-classifier.js');
const {createCryptoResearchDataEngine}=require('./crypto-data-engine.js');
const {PRESETS}=require('./dante-presets.js');
const {runPresetBacktest,walkForward}=require('./dante-backtest.js');
const {createPaperTradingService}=require('./paper-trading.js');
const {runCausalIctBacktest}=require('./causal-ict-backtest.js');
const SetupReplay=require('./setup-event-replay.js');
const SetupPit=require('./setup-point-in-time-replay.js');
const SetupValidation=require('./setup-validation-harness.js');
const {buildPerformanceReport}=require('./performance-report.js');

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
  const provider=createCryptoResearchDataEngine({fetchImpl,now,exchange:'BINANCE',marketType:'spot',quoteAsset:'USDT'});
  const collector=createCollector({
    provider,store,now,maxStepsPerRun:8,screen:screenEvent,
    buildFeatures:createFeatureBuilder()
  });
  const evaluator=createOutcomeEvaluator({provider,store,maxEventsPerRun:12});
  const paper=createPaperTradingService({store,now});
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
    const observedAt=now(),prov=typeof provider.provenance==='function'?provider.provenance():null;
    const requestedMode=String(body.universeMode||'current-survivors-only');
    const version=String(body.universeVersion||('crypto-'+provider.exchange.toLowerCase()+'-'+provider.marketType+'-'+new Date(observedAt).toISOString().slice(0,10)));
    const universe=createUniverseSnapshot({exchangeInfo:info,version,mode:requestedMode,observedAt,source:prov?.universe?.sourceBase||'crypto-current-exchangeInfo',exchange:provider.exchange,marketType:prov?.universe?.marketType||provider.marketType,quoteAsset:provider.quoteAsset,lineageComplete:Boolean(body.lineageComplete)});
    const existing=await store.getUniverse(version);if(!existing)await store.putUniverse(version,universe);
    return existing||universe;
  }
  async function status(){
    const [runs,manifests,universes]=await Promise.all([store.listRuns(),store.listManifests(),store.listUniverses()]);
    return{runs:runs.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,20),manifests:manifests.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)),universes,survivorshipWarning:universes.some(x=>x.survivorshipSafe!==true),dataEngine:typeof provider.provenance==='function'?provider.provenance():null,sessionPolicy:provider.sessionPolicy||null,lineagePolicy:provider.lineagePolicy||null};
  }
  async function runCollection(body={}){
    const manifest=await resolveManifest(body),universe=await resolveUniverse(body);
    const startTs=finite(body.startTs),endTs=finite(body.endTs);if(startTs==null||endTs==null)throw new Error('startTs and endTs required');
    const runId=String(body.runId||'').trim();if(!runId)throw new Error('runId required');
    return collector.run({runId,manifest,universe,startTs,endTs,validationEndTs:finite(body.validationEndTs)});
  }
  async function evaluate(body={}){return evaluator.run({runId:String(body.runId||''),limit:body.limit})}
  async function runDante(body={}){
    const symbol=String(body.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),presetId=String(body.presetId||'bowl224');
    if(!PRESETS[presetId])throw new Error('invalid Dante preset');
    const rows=Math.max(260,Math.min(1500,Number(body.rows)||900)),endTime=finite(body.endTime)??now();
    const bars=await provider.getKlinesAt(symbol,'1d',{endTime,rows});
    const result=runPresetBacktest({rows:bars,presetId,params:body.params||{},marketType:body.marketType||provider.marketType,costAssumptions:body.costAssumptions||{},exitPolicy:body.exitPolicy||{}});
    const id=String(body.reportId||('dante-'+presetId+'-'+symbol+'-'+Math.trunc(endTime)));
    const report={id,type:'dante-backtest',symbol,presetId,engine:PRESETS[presetId].engine,createdAt:now(),dataEngine:provider.provenance(),result};
    await store.putReport(id,report);return report;
  }
  async function runCausalIct(body={}){
    const symbol=String(body.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),tf=String(body.timeframe||'4h').toLowerCase();
    const rows=Math.max(120,Math.min(1500,Number(body.rows)||800)),endTime=finite(body.endTime)??now();
    const bars=await provider.getKlinesAt(symbol,tf,{endTime,rows});
    const result=runCausalIctBacktest({rows:bars,spec:body.spec||null,costMultipliers:Array.isArray(body.costMultipliers)?body.costMultipliers:[1,1.5,2]});
    const id=String(body.reportId||('causal-ict-'+symbol+'-'+tf+'-'+Math.trunc(endTime)));
    const report={id,type:'causal-ict-backtest',symbol,timeframe:tf,engine:result.engine,createdAt:now(),dataEngine:provider.provenance(),result};
    await store.putReport(id,report);return report;
  }
  async function runSetupValidation(body={}){
    const symbol=String(body.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),tf=String(body.signalTimeframe||'15m').toLowerCase();
    const endTime=finite(body.endTime)??now(),startTime=finite(body.startTime);
    const frames=body.frames&&typeof body.frames==='object'?body.frames:await provider.getHistoricalFrames(symbol,{simulatedTs:endTime});
    const pit=SetupPit.replayPointInTime({
      symbol,frames,signalTimeframe:tf,startTs:startTime,endTs:endTime,
      contextTimeline:Array.isArray(body.contextTimeline)?body.contextTimeline:[],
      defaultDataState:String(body.defaultDataState||'live'),includeSnapshots:false
    });
    const rows=Array.isArray(frames[tf])?frames[tf]:[];
    const result=SetupValidation.validateSetupResearch({
      rows,transitions:pit.transitions,splits:body.splits,config:body.executionConfig||{},
      costMultipliers:Array.isArray(body.costMultipliers)?body.costMultipliers:[1,1.5,2],
      lockedConfigFingerprint:body.lockedConfigFingerprint||null
    });
    const id=String(body.reportId||('setup-validation-'+symbol+'-'+tf+'-'+Math.trunc(endTime)));
    const report={
      id,type:'setup-validation',symbol,timeframe:tf,engine:result.version,createdAt:now(),
      dataEngine:provider.provenance(),pointInTimeVersion:pit.version,
      pointInTimeSummary:{decisionCount:pit.decisionCount,transitionCount:pit.transitions.length,confirmedCount:pit.confirmedTransitions.length},
      result,lookaheadSafe:true,
      validationPolicy:'DEVELOPMENT -> ROLLING WALK-FORWARD -> LOCKED OOS; COST STRESS 1x/1.5x/2x'
    };
    await store.putReport(id,report);return report;
  }
  async function runSetupPointInTime(body={}){
    const symbol=String(body.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),tf=String(body.signalTimeframe||'15m').toLowerCase();
    const endTime=finite(body.endTime)??now(),startTime=finite(body.startTime);
    const frames=body.frames&&typeof body.frames==='object'?body.frames:await provider.getHistoricalFrames(symbol,{simulatedTs:endTime});
    const pit=SetupPit.replayPointInTime({
      symbol,frames,signalTimeframe:tf,startTs:startTime,endTs:endTime,
      contextTimeline:Array.isArray(body.contextTimeline)?body.contextTimeline:[],
      defaultDataState:String(body.defaultDataState||'live'),includeSnapshots:Boolean(body.includeSnapshots)
    });
    const prefix=body.checkPrefixInvariant===false?null:SetupPit.prefixInvariant({
      symbol,frames,signalTimeframe:tf,startTs:startTime,endTs:endTime,
      contextTimeline:Array.isArray(body.contextTimeline)?body.contextTimeline:[],
      defaultDataState:String(body.defaultDataState||'live')
    });
    const signals=SetupReplay.signalsFromSetupTransitions(pit.transitions);
    const signalRows=Array.isArray(frames[tf])?frames[tf]:[];
    const replay=signals.length?SetupReplay.runEventReplay({rows:signalRows,signals,config:body.executionConfig||{}}):null;
    const id=String(body.reportId||('setup-pit-'+symbol+'-'+tf+'-'+Math.trunc(endTime)));
    const report={
      id,type:'setup-point-in-time-replay',symbol,timeframe:tf,engine:pit.version,createdAt:now(),
      dataEngine:provider.provenance(),pointInTime:pit,prefixInvariant:prefix,eventReplay:replay,
      lookaheadSafe:Boolean(prefix?.pass!==false),
      executionPolicy:'CLOSED_MULTI_TF_STATE_TRANSITION -> CONFIRMED_SIGNAL -> NEXT_OPEN_FILL'
    };
    await store.putReport(id,report);return report;
  }
  async function runSetupReplay(body={}){
    const symbol=String(body.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),tf=String(body.timeframe||'15m').toLowerCase();
    const rows=Math.max(50,Math.min(1500,Number(body.rows)||900)),endTime=finite(body.endTime)??now();
    const bars=Array.isArray(body.bars)&&body.bars.length?body.bars:await provider.getKlinesAt(symbol,tf,{endTime,rows});
    let signals=Array.isArray(body.signals)?body.signals:[];
    if(!signals.length&&Array.isArray(body.transitions))signals=SetupReplay.signalsFromSetupTransitions(body.transitions);
    const result=SetupReplay.runEventReplay({rows:bars,signals,config:body.config||{}});
    const trades=result.closedTrades.map(t=>({
      status:'filled',entryIndex:t.entryIndex,exitIndex:t.exitIndex,entryTime:t.entryTime,exitTime:t.exitTime,
      entryPrice:t.entryPrice,exitPrice:t.exitPrice,netReturnPct:Number(t.returnFraction)*100,
      grossReturnPct:null,holdingBars:t.exitIndex-t.entryIndex+1,costs:{roundTripPct:null},exitReason:t.exitReason,
      side:'long',netPnl:t.netPnl
    }));
    const performance=buildPerformanceReport(trades,{initialEquity:1,periodsPerYear:365});
    const id=String(body.reportId||('setup-replay-'+symbol+'-'+tf+'-'+Math.trunc(endTime)));
    const report={id,type:'setup-event-replay',symbol,timeframe:tf,engine:result.version,createdAt:now(),dataEngine:provider.provenance(),result,performance,lookaheadSafe:true,executionPolicy:'CONFIRMED_CLOSE_SIGNAL_NEXT_OPEN_FILL_STOP_FIRST'};
    await store.putReport(id,report);return report;
  }
  async function runWalkForward(body={}){
    const symbol=String(body.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),presetId=String(body.presetId||'bowl224');
    if(!PRESETS[presetId])throw new Error('invalid Dante preset');
    const rows=Math.max(500,Math.min(1500,Number(body.rows)||1200)),endTime=finite(body.endTime)??now();
    const bars=await provider.getKlinesAt(symbol,'1d',{endTime,rows});
    const result=walkForward({rows:bars,presetId,paramGrid:body.paramGrid||{},marketType:body.marketType||provider.marketType,costAssumptions:body.costAssumptions||{},exitPolicy:body.exitPolicy||{},trainBars:Number(body.trainBars)||365,validationBars:Number(body.validationBars)||120,stepBars:Number(body.stepBars)||120,objectiveMetric:String(body.objectiveMetric||'profitFactor')});
    const id=String(body.reportId||('walk-'+presetId+'-'+symbol+'-'+Math.trunc(endTime)));
    const report={id,type:'walk-forward',symbol,presetId,engine:PRESETS[presetId].engine,createdAt:now(),dataEngine:provider.provenance(),result};
    await store.putReport(id,report);return report;
  }
  async function reports({limit=30,type=null}={}){
    let rows=await store.listReports();if(type)rows=rows.filter(x=>x.type===type);
    return rows.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt)).slice(0,Math.max(1,Math.min(200,Number(limit)||30)));
  }
  async function report(id){return store.getReport(id)}
  async function paperList(opts={}){return paper.list(opts)}
  async function paperStats(){return paper.stats()}
  async function paperOpen(body={}){return paper.open(body)}
  async function paperMark(body={}){return paper.mark(body)}
  async function paperClose(body={}){return paper.close(body)}
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
  return{store,provider,collector,evaluator,paper,status,runCollection,evaluate,runDante,runCausalIct,runSetupValidation,runSetupPointInTime,runSetupReplay,runWalkForward,reports,report,paperList,paperStats,paperOpen,paperMark,paperClose,stats,events,screenEvent,dantePresets:PRESETS};
}
module.exports={createFeatureBuilder,screenEvent,createResearchRuntime};

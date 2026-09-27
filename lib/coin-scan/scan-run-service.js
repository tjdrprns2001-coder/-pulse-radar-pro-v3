'use strict';

const VERSION='SCAN_RUN_v2';
const DEEP_CHUNK=8;
const DEEP_WORKERS=2;
const FULL_VALIDATION_CHUNKS=2;
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function idNow(now=Date.now()){return 'scan-'+Number(now).toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function slimMeta(x={}){
  return{updatedAt:x.updatedAt,scanCount:x.scanCount,deepScanCount:x.deepScanCount,dataHealth:x.dataHealth,marketBreadth:x.marketBreadth,marketCoverage:x.marketCoverage,marketSource:x.marketSource,derivativesSource:x.derivativesSource,sourceWarning:x.sourceWarning,partial:x.partial,staleFallback:x.staleFallback,universeMeta:x.universeMeta,prescan:x.prescan||null,samplingResearch:x.samplingResearch||null};
}
function compactSample(p){if(!p||typeof p!=='object')return null;return{archetypeLabel:p.archetypeLabel,archetype:p.archetype,phaseLabel:p.phaseLabel,phase:p.phase,score:p.score,oiProfile:p.oiProfile,takerProfile:p.takerProfile,liquidity:p.liquidity,sweep:p.sweep,timeSymmetry:p.timeSymmetry?{m15:p.timeSymmetry.m15,h1:p.timeSymmetry.h1}:null,resetReignition:p.resetReignition,similarity:Array.isArray(p.similarity)?p.similarity.slice(0,1):[],dormancy:p.dormancy}}
function compactV3(v){if(!v||typeof v!=='object')return null;const causal=v.causalIct||{},tf=causal.primaryTf||'4h',row=causal.timeframes?.[tf]||causal.timeframes?.['4h'];return{longTerm:v.longTerm?{filter:v.longTerm.filter}:null,oiPath:v.oiPath,taker:v.taker,rvol:v.rvol,nearestPd:v.nearestPd,movingAverage:v.movingAverage?{'1h':v.movingAverage['1h']}:null,causalIct:{available:causal.available,reason:causal.reason,primaryTf:tf,longStage:causal.longStage,contractPass:causal.contractPass,timeframes:row?{[tf]:row}:{}},warnings:Array.isArray(v.warnings)?v.warnings.slice(0,2):[],invalidation:v.invalidation,stage:v.stage,effectiveType:v.effectiveType}}
function compactSamplingV3(v){if(!v||typeof v!=='object')return null;return{version:v.version,mode:v.mode,evidenceScore:v.evidenceScore,rankingEffect:v.rankingEffect,sequence:v.sequence?{eventCount:v.sequence.eventCount,eventTypes:Array.isArray(v.sequence.eventTypes)?v.sequence.eventTypes.slice(0,8):[],bullishEventCount:v.sequence.bullishEventCount,compressionHours:v.sequence.compressionHours,stage:v.sequence.stage}:null,integrity:v.integrity?{status:v.integrity.status,lookaheadViolations:Array.isArray(v.integrity.lookaheadViolations)?v.integrity.lookaheadViolations.slice(0,2):[],byTf:v.integrity.byTf}:null,nativeSyntheticAudit:v.nativeSyntheticAudit?{status:v.nativeSyntheticAudit.status,comparisons:v.nativeSyntheticAudit.comparisons}:null,alternativeBars:v.alternativeBars?{version:v.alternativeBars.version,revision:v.alternativeBars.revision,status:v.alternativeBars.status,tradeCount:v.alternativeBars.tradeCount,evaluationTradeCount:v.alternativeBars.evaluationTradeCount,policy:v.alternativeBars.policy,calibration:v.alternativeBars.calibration?{status:v.alternativeBars.calibration.status,calibrationTradeCount:v.alternativeBars.calibration.calibrationTradeCount,evaluationTradeCount:v.alternativeBars.calibration.evaluationTradeCount,calibrationEndTime:v.alternativeBars.calibration.calibrationEndTime,evaluationStartTime:v.alternativeBars.calibration.evaluationStartTime,thresholds:v.alternativeBars.calibration.thresholds}:null,bars:v.alternativeBars.bars,latest:v.alternativeBars.latest}:null,microstructure:v.microstructure||null}}
function compactStrategy(x){if(!x||typeof x!=='object')return null;return{version:x.version,stage:x.stage,reentryEligible:x.reentryEligible,patternEligible:x.patternEligible,reentryScore:x.reentryScore,priorSurge:x.priorSurge,cooled:x.cooled,reset:x.reset,best:x.best,fakeout:x.fakeout||null,entryQuality:x.entryQuality||null,entryTiming:x.entryTiming||null,breakoutStates:Array.isArray(x.breakoutStates)?x.breakoutStates.slice(0,4):[],activeTracks:Array.isArray(x.activeTracks)?x.activeTracks.slice(0,8):[],reasons:Array.isArray(x.reasons)?x.reasons.slice(0,5):[],bookManual:x.bookManual?{score:x.bookManual.score,registryVersion:x.bookManual.registryVersion,registrySummary:x.bookManual.registrySummary,rankable:Array.isArray(x.bookManual.rankable)?x.bookManual.rankable.slice(0,5):[],evidence:Array.isArray(x.bookManual.evidence)?x.bookManual.evidence.slice(0,6):[],warnings:Array.isArray(x.bookManual.warnings)?x.bookManual.warnings.slice(0,3):[],riskPlan:x.bookManual.riskPlan,dataGaps:Array.isArray(x.bookManual.dataGaps)?x.bookManual.dataGaps.slice(0,6):[]}:null}}
function compactRunItem(x={}){return{symbol:x.symbol,baseAsset:x.baseAsset,marketScope:x.marketScope,spotListed:x.spotListed,futuresListed:x.futuresListed,sector:x.sector,candidateScore:x.candidateScore,preIgnitionScore:x.preIgnitionScore,autoDeepEligible:x.autoDeepEligible,autoDeepReason:x.autoDeepReason,priceChange24h:x.priceChange24h,priceChange1h:x.priceChange1h,priceChange15m:x.priceChange15m,reaccumulating:x.reaccumulating,bottomReady:x.bottomReady,scanClass:x.scanClass,tradeSignal:x.tradeSignal,summary:x.summary,reasons:Array.isArray(x.reasons)?x.reasons.slice(0,3):[],dataState:x.dataState,tfState:x.tfState,v2Flow:x.v2Flow,v2Type:x.v2Type,v3LongTier:x.v3LongTier,isTransitionEvent:x.isTransitionEvent,sampleSubtype:x.sampleSubtype,stageTransition:x.stageTransition,typeTransition:x.typeTransition,transitionAt:x.transitionAt,eventSnapshotId:x.eventSnapshotId,oi4hChangePct:x.oi4hChangePct,oi8hChangePct:x.oi8hChangePct,trueTakerRatio:x.trueTakerRatio,fundingRate:x.fundingRate,samplePattern:compactSample(x.samplePattern),dormancyMemory:x.dormancyMemory,momentumSignals:x.momentumSignals?{overheated:x.momentumSignals.overheated,aligned:x.momentumSignals.aligned,rsi15m:x.momentumSignals.rsi15m,macd15m:x.momentumSignals.macd15m,stochRsi15m:x.momentumSignals.stochRsi15m,kdj15m:x.momentumSignals.kdj15m}:null,marketIntelligence:x.marketIntelligence?{available:x.marketIntelligence.available,exchangeCount:x.marketIntelligence.exchangeCount,spotCount:x.marketIntelligence.spotCount,derivativesCount:x.marketIntelligence.derivativesCount,maxPriceDispersionPct:x.marketIntelligence.maxPriceDispersionPct,spotFuturesBasisPct:x.marketIntelligence.spotFuturesBasisPct}:null,preScan:x.preScan?{score:x.preScan.score,eligible:x.preScan.eligible,continuation:x.preScan.continuation,reentryLike:x.preScan.reentryLike,strongKinds:x.preScan.strongKinds,best:x.preScan.best}:null,strategyCycle:compactStrategy(x.strategyCycle),v3:compactV3(x.v3),samplingV3:compactSamplingV3(x.samplingV3),priceFrameSources:x.priceFrameSources||null,deep:x.deep}}
function compactScreeningRow(s){if(!s||typeof s!=='object')return s;return{symbol:s.symbol,classification:s.classification,label:s.label,scores:s.scores,evidence:Array.isArray(s.evidence)?s.evidence.slice(0,4):[],contradictions:Array.isArray(s.contradictions)?s.contradictions.slice(0,4):[],data_gaps:Array.isArray(s.data_gaps)?s.data_gaps.slice(0,4):[],missing:Array.isArray(s.missing)?s.missing.slice(0,4):[]}}
function mergeItems(base=[],next=[]){
  const m=new Map((base||[]).filter(x=>x?.symbol).map(x=>[x.symbol,x]));
  for(const x of next||[])if(x?.symbol){const prev=m.get(x.symbol)||{};m.set(x.symbol,{...prev,...x,preScan:x.preScan??prev.preScan??null})}
  return [...m.values()];
}
function mergeScreening(current={},next={}){
  const buckets=['candidates','watchlist','eventRisk','conflicted','riskFiltered','insufficientData','rejected'];
  const allMap=new Map((current.all||[]).filter(x=>x?.symbol).map(x=>[x.symbol,compactScreeningRow(x)]));
  for(const x of next.all||[])if(x?.symbol)allMap.set(x.symbol,compactScreeningRow(x));
  const all=[...allMap.values()];
  const out={all};
  for(const b of buckets){const m=new Map((current[b]||[]).filter(x=>x?.symbol).map(x=>[x.symbol,compactScreeningRow(x)]));for(const x of next[b]||[])if(x?.symbol)m.set(x.symbol,compactScreeningRow(x));out[b]=[...m.values()]}
  return out;
}
function createScanRunService({scanService,store,now=()=>Date.now()}={}){
  if(!scanService||typeof scanService.run!=='function')throw new Error('scanService required');
  if(!store||typeof store.putState!=='function'||typeof store.getState!=='function')throw new Error('state store required');
  const key=id=>'scan-run:'+String(id);
  async function save(run){run.updatedAt=now();await store.putState(key(run.id),clone(run));return clone(run)}
  async function get(id){const x=await store.getState(key(id));return x?clone(x):null}
  async function start({precision=false}={}){
    const id=idNow(now()),run={version:VERSION,id,status:'QUEUED',stage:'queued',createdAt:now(),updatedAt:now(),precision:Boolean(precision),deepDone:0,deepTotal:0,candidateSymbols:[],items:[],autoScreening:{all:[]},samplingResearch:{requested:0,ready:0,partial:0,unavailable:0},samplingSamplesRecorded:0,meta:null,error:null};
    return save(run);
  }
  async function execute(id){
    let run=await get(id);if(!run)throw Object.assign(new Error('scan run not found'),{statusCode:404});
    if(run.status==='DONE')return run;
    if(run.status==='RUNNING'&&now()-(Number(run.updatedAt)||0)<30000)return run;
    run.status='RUNNING';run.stage='summary';run.error=null;await save(run);
    try{
      const summary=await scanService.run({mode:'summary',limit:500,precision:run.precision,persistObservations:false});
      run.items=(summary.items||[]).map(compactRunItem);run.meta=slimMeta(summary);run.candidateSymbols=(summary.candidateSymbols||[]).slice(0,40);run.stage='prescan';await save(run);

      let candidates=run.candidateSymbols.slice();
      try{
        const prescan=await scanService.run({mode:'prescan',limit:120,precision:run.precision,persistObservations:false});
        if(Array.isArray(prescan.candidateSymbols)&&prescan.candidateSymbols.length)candidates=prescan.candidateSymbols.slice(0,40);
        const pre=new Map((prescan.items||[]).filter(x=>x?.symbol).map(x=>[x.symbol,x.preScan]));
        run.items=run.items.map(x=>pre.has(x.symbol)?{...x,preScan:pre.get(x.symbol)}:x);
        run.meta={...(run.meta||{}),prescan:prescan.prescan||null};
      }catch(e){run.prescanError=String(e?.message||e)}
      run.candidateSymbols=candidates;run.deepTotal=candidates.length;run.deepDone=0;run.stage='deep';await save(run);

      const chunks=[];for(let i=0;i<candidates.length;i+=DEEP_CHUNK)chunks.push({index:chunks.length,symbols:candidates.slice(i,i+DEEP_CHUNK)});
      let next=0,completed=0,commit=Promise.resolve();
      async function applyChunk(entry,deep){
        commit=commit.then(async()=>{
          run.items=mergeItems(run.items,(deep.items||[]).map(compactRunItem));
          run.autoScreening=mergeScreening(run.autoScreening,deep.autoScreening||{});
          completed+=entry.symbols.length;run.deepDone=Math.min(run.deepTotal,completed);
          const sr=deep?.samplingResearch;
          if(sr){
            run.samplingResearch=run.samplingResearch||{requested:0,ready:0,partial:0,unavailable:0};
            for(const k of ['requested','ready','partial','unavailable'])run.samplingResearch[k]+=Number(sr[k])||0;
          }
          run.samplingSamplesRecorded+=Number(deep?.samplingOosRecording?.recorded)||0;
          run.meta={...(run.meta||{}),...slimMeta(deep),prescan:run.meta?.prescan||null,samplingResearch:run.samplingResearch||null,samplingSamplesRecorded:run.samplingSamplesRecorded};
          run.partial=Boolean(run.partial||deep.partial);
          if(deep.auxiliary?.status==='degraded')run.auxiliary=deep.auxiliary;
          await save(run);
        });
        return commit;
      }
      async function worker(){
        while(true){
          const entry=chunks[next++];if(!entry)return;
          const validation=entry.index<FULL_VALIDATION_CHUNKS?(run.precision?'full':'light'):'off';
          const deep=await scanService.run({mode:'deep',limit:entry.symbols.length,symbols:entry.symbols,precision:run.precision,validation,persistObservations:false,sourceScanId:run.id});
          await applyChunk(entry,deep);
        }
      }
      await Promise.all(Array.from({length:Math.min(DEEP_WORKERS,chunks.length||1)},worker));
      await commit;
      run.status='DONE';run.stage='complete';run.completedAt=now();return save(run);
    }catch(e){
      run.status='FAILED';run.stage='failed';run.error=String(e?.message||e);run.failedAt=now();await save(run);throw e;
    }
  }
  return{VERSION,DEEP_CHUNK,DEEP_WORKERS,FULL_VALIDATION_CHUNKS,start,get,execute};
}
module.exports={VERSION,DEEP_CHUNK,DEEP_WORKERS,FULL_VALIDATION_CHUNKS,compactRunItem,compactScreeningRow,mergeItems,mergeScreening,createScanRunService};

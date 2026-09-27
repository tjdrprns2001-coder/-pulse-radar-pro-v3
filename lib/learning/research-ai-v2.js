'use strict';

const fs=require('fs');
const path=require('path');
const Evidence=require('./evidence.js');
const Neural=require('./neural.js');
const Outcome=require('./outcome-engine.js');
const Canonical=require('./canonical-snapshot.js');
const Similarity=require('./similarity.js');
const Split=require('./dataset-split.js');
const Metrics=require('./metrics.js');
const Registry=require('./model-registry.js');
const ResearchStats=require('./research-stats.js');
const ArchetypeLab=require('./archetype-lab.js');
const ResearchLab=require('./research-lab.js');
const Integrity=require('./research-integrity.js');
const Regime=require('./regime-detector.js');
const SealedOos=require('./sealed-oos-evaluator.js');
const Book=require('../coin-scan/book-strategy-registry.js');

const VERSION='RESEARCH_AI_v2';
const MIN_LABELS=20;
const MAX_OBSERVATIONS=4000;
const STATE_FILE=path.join(__dirname,'..','..','data','learning','research-ai-state.json');
const REMOTE_STATE_URL=process.env.RESEARCH_AI_STATE_URL||
  'https://raw.githubusercontent.com/tjdrprns2001-coder/-pulse-radar-pro-v3/learning-memory/data/learning/research-ai-state.json';

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v,a=0,b=1){const x=n(v,0);return Math.max(a,Math.min(b,x))}
function itemPrice(item={}){return n(item.price,n(item.lastPrice))}
function itemTime(item={}){return n(item.asOf,n(item.updatedAt,Date.now()))}
function stage(score){return score>=80?'PRE_SURGE_MATCH':score>=65?'READY':score>=50?'WATCH':'LOW_MATCH'}
function observationKey(item){return String(item.symbol||'')+':'+Math.floor(itemTime(item)/3600000)}

function initialState(){
  const model=Neural.createModel(Evidence.FEATURE_NAMES.length);
  const registry=Registry.upsert(Registry.createRegistry(),Registry.createEntry({id:'tiny-mlp-v2',type:Neural.MODEL_TYPE,state:'SHADOW',metadata:{shadowOnly:true}}));
  return{
    version:VERSION,updatedAt:Date.now(),source:'local-seed',observations:[],model,registry,
    training:{labels:0,positive:0,negative:0,lastLoss:null,lastTrainedAt:null,dataset:{train:0,validation:0,lockedOos:0},metrics:{validation:null,lockedOos:null}},
    validation:{lockedOosStart:null,frozenAt:null,oosGeneration:0},
    integrity:{version:Integrity.VERSION,contract:{...Integrity.CONTRACT},datasetSnapshotId:null,lastHealth:null},
    experimentLedger:[],sealedReviews:[],
    memory:{seedSamples:Evidence.loadSeedSamples().length,bookTechniques:Book.TECHNIQUES.length,bookRankingTechniques:Book.activeForRanking().length,persistence:'github-learning-memory',researchNotes:[],
      notes:['SHADOW_ONLY','실제 확정봉 outcome만 정답 라벨 사용','누락값은 저장 시 null 유지','TRAIN→VALIDATION→LOCKED_OOS 시간순 분리']}
  };
}
function migrateObservation(row={}){
  const next={...row};
  if(!Array.isArray(next.features))next.features=[];
  if(!('outcomeV2' in next))next.outcomeV2=null;
  if(!('labelStatus' in next))next.labelStatus=next.label==null?'UNRESOLVED':'LEGACY';
  const currentContract=next.integrity?.contract?.contractVersion===Integrity.CONTRACT.contractVersion;
  if(!currentContract){
    next.referenceOnly=true;
    next.legacyReason=next.legacyReason||'PRE_INTEGRITY_CONTRACT';
  }
  return next;
}
function sanitizeState(raw){
  const base=initialState(),s=raw&&typeof raw==='object'?{...base,...raw}:base;
  s.version=VERSION;
  s.observations=Array.isArray(s.observations)?s.observations.map(migrateObservation):[];
  if(!Neural.validateModel(s.model,Evidence.FEATURE_NAMES.length))s.model=Neural.createModel(Evidence.FEATURE_NAMES.length);
  s.training={...base.training,...(s.training||{}),dataset:{...base.training.dataset,...(s.training?.dataset||{})},metrics:{...base.training.metrics,...(s.training?.metrics||{})}};
  s.validation={...base.validation,...(s.validation||{})};
  s.integrity={...base.integrity,...(s.integrity||{}),version:Integrity.VERSION,contract:{...Integrity.CONTRACT,...(s.integrity?.contract||{})}};
  s.registry=s.registry&&Array.isArray(s.registry.models)?s.registry:base.registry;
  s.experimentLedger=Array.isArray(s.experimentLedger)?s.experimentLedger:[];
  s.sealedReviews=Array.isArray(s.sealedReviews)?s.sealedReviews:[];
  s.memory={...base.memory,...(s.memory||{}),researchNotes:Array.isArray(s.memory?.researchNotes)?s.memory.researchNotes:[],seedSamples:Evidence.loadSeedSamples().length,bookTechniques:Book.TECHNIQUES.length,bookRankingTechniques:Book.activeForRanking().length,persistence:'github-learning-memory'};
  return s;
}
function loadLocal(){
  try{return sanitizeState(JSON.parse(fs.readFileSync(STATE_FILE,'utf8')))}catch{return initialState()}
}
function scorePrediction(state,item){
  const sample=Evidence.sampleSimilarity(item),book=Evidence.bookEvidence(item),base=Evidence.scannerScore(item);
  const features=Evidence.normalizeItem(item),labels=n(state.training?.labels,0);
  const neural=labels>=MIN_LABELS?Neural.forward(state.model,Evidence.modelVector(features)).p:null;
  const heuristic=Similarity.blendScores([
    {value:base==null?null:base/100,weight:.45},
    {value:sample.score==null?null:sample.score/100,weight:.35},
    {value:book.score==null?null:book.score/100,weight:.20}
  ]);
  const blended=Similarity.blendScores([
    {value:heuristic,weight:neural==null?1:.70},
    {value:neural,weight:neural==null?0:.30}
  ]);
  const score=Math.round(clamp(blended==null?0:blended)*100);
  return{
    version:VERSION,shadowOnly:true,score,stage:stage(score),features,
    sampleSimilarity:sample,bookEvidence:book,
    neural:{active:neural!=null,score:neural==null?null:Math.round(neural*100),labels,minimumLabels:MIN_LABELS,model:Neural.MODEL_TYPE},
    note:'연구용 SHADOW_ONLY. 기존 자동스캐너 순위·진입 판단을 직접 변경하지 않음.'
  };
}
function trainingRows(observations=[]){
  return observations.filter(x=>!x.referenceOnly&&x.integrity?.contract?.contractVersion===Integrity.CONTRACT.contractVersion&&(x.label===0||x.label===1)&&Array.isArray(x.features)&&x.features.length===Evidence.FEATURE_NAMES.length)
    .map(x=>({...x,features:Evidence.modelVector(x.features)}));
}
function predictRows(model,rows=[]){
  return rows.map(r=>({...r,prediction:Neural.forward(model,r.features).p}));
}
function retrain(state){
  const labeled=trainingRows(state.observations).sort((a,b)=>a.asOf-b.asOf);
  state.training.labels=labeled.length;
  state.training.positive=labeled.filter(x=>x.label===1).length;
  state.training.negative=labeled.filter(x=>x.label===0).length;
  state.integrity.datasetSnapshotId=Integrity.datasetSnapshotId(labeled,Integrity.CONTRACT);
  state.integrity.lastHealth=Integrity.cohortHealth(state.observations.filter(x=>!x.referenceOnly));
  if(labeled.length<MIN_LABELS){
    state.training.dataset={train:0,validation:0,lockedOos:0,purged:0,embargoed:0};
    state.training.metrics={validation:null,lockedOos:null};
    return state;
  }
  const split=Split.purgedChronological(labeled,{lockedOosStart:state.validation?.lockedOosStart,purgeHours:Integrity.CONTRACT.purgeHours,embargoHours:Integrity.CONTRACT.embargoHours});
  const leak=Split.assertNoLeakage(split);
  if(!leak.ok)throw new Error('dataset leakage: '+leak.errors.join(','));
  const trainRows=split.train.length?split.train:labeled.slice(0,Math.max(1,Math.floor(labeled.length*.6)));
  const model=Neural.createModel(Evidence.FEATURE_NAMES.length);
  const trained=Neural.train(model,trainRows,{epochs:12,lr:.018});
  state.model=trained.model;
  const valPred=predictRows(state.model,split.validation||[]),oosPred=predictRows(state.model,split.lockedOos||[]);
  const valBin=Metrics.binaryMetrics(valPred),valOut=Metrics.outcomeMetrics(split.validation||[]);
  const oosBin=Metrics.binaryMetrics(oosPred),oosOut=Metrics.outcomeMetrics(split.lockedOos||[]);
  state.training.lastLoss=trained.metrics.loss;state.training.lastTrainedAt=Date.now();
  state.training.dataset={train:trainRows.length,validation:split.validation.length,lockedOos:split.lockedOos.length,purged:split.purge?.purged||0,embargoed:split.purge?.embargoed||0};
  state.integrity.datasetSnapshotId=Integrity.datasetSnapshotId(labeled,Integrity.CONTRACT);
  state.integrity.lastHealth=Integrity.cohortHealth(state.observations.filter(x=>!x.referenceOnly));
  state.training.metrics={
    validation:{...valBin,...valOut,calibrationError:Metrics.maxCalibrationError(valPred)},
    lockedOos:{...oosBin,...oosOut,calibrationError:Metrics.maxCalibrationError(oosPred)}
  };
  let entry=(state.registry.models||[]).find(x=>x.id==='tiny-mlp-v2')||Registry.createEntry({id:'tiny-mlp-v2',type:Neural.MODEL_TYPE});
  entry={...entry,updatedAt:Date.now(),metrics:{labels:labeled.length,loss:trained.metrics.loss,validation:state.training.metrics.validation,lockedOos:state.training.metrics.lockedOos}};
  state.registry=Registry.upsert(state.registry,entry);
  return state;
}
function observeBatch(state,items=[],meta={}){
  const now=Date.now(),predictions={};let added=0;
  for(const item of items||[]){
    if(!item?.symbol)continue;
    const pred=scorePrediction(state,item);predictions[item.symbol]=pred;
    if(item.state==='DATA_GAP'||(item.dataState&&item.dataState!=='live'))continue;
    const asOf=itemTime(item),canonical=Canonical.canonicalize(item,{capturedAt:now,source:meta.source||'scanner',bookRuleIds:pred.bookEvidence.matched.map(x=>x.id)});
    const integrity=Integrity.integrityMeta({item,canonical,asOf,source:meta.source||'scanner',sourceScanId:meta.sourceScanId||null,experimentCountBeforeThis:state.observations.length});
    const key='cohort:'+integrity.eventFamilyKey;
    if(state.observations.some(x=>x.key===key||x.integrity?.eventFamilyKey===integrity.eventFamilyKey))continue;
    state.observations.push({
      key,eventId:integrity.eventId,symbol:item.symbol,asOf,capturedAt:now,price:itemPrice(item),signalClose:itemPrice(item),entryPolicy:Integrity.CONTRACT.entryPolicy,
      scannerState:item.state||item.scanClass?.key||item.dataState||null,scannerScore:Evidence.scannerScore(item),regime:(()=>{const r=Regime.detect(item);return r.regime!=='UNKNOWN'?r.regime:(item.regime||null)})(),regimeMeta:Regime.detect(item),
      setupType:item.setup?.type||item.sampleArchetype||item.v2Type||null,
      features:pred.features,canonicalSnapshot:canonical,researchScore:pred.score,researchStage:pred.stage,
      sampleTop:pred.sampleSimilarity.top.slice(0,3),bookRuleIds:pred.bookEvidence.matched.map(x=>x.id),
      outcomeV2:null,label:null,labelStatus:'UNRESOLVED',source:meta.source||'scanner',referenceOnly:false,integrity
    });
    added++;
  }
  if(state.observations.length>MAX_OBSERVATIONS)state.observations=state.observations.slice(-MAX_OBSERVATIONS);
  state.updatedAt=now;state.source='runtime';
  return{predictions,added,resolved:0,status:statusOf(state)};
}
function resolveSymbol(state,symbol,candles,{now=Date.now()}={}){
  let resolved=0,changed=0;
  for(let i=0;i<state.observations.length;i++){
    const row=state.observations[i];
    if(row.symbol!==symbol)continue;
    const outcome=Outcome.resolveObservation(row,candles,{now});
    const before=JSON.stringify(row.outcomeV2);
    const next=Outcome.applyOutcome(row,outcome);
    if(JSON.stringify(outcome)!==before)changed++;
    if(row.label==null&&next.label!=null)resolved++;
    state.observations[i]=next;
  }
  if(changed){retrain(state);state.updatedAt=now;state.source='runtime-outcome'}
  return{changed,resolved,status:statusOf(state)};
}
function ingestLabeledSample(state,item,{label=1,source='auto-sample',metadata=null,knownAt=Date.now()}={}){
  if(!item?.symbol)throw new Error('labeled sample symbol required');
  const y=Number(label)===1?1:0,pred=scorePrediction(state,item);
  const knowledgeAt=n(knownAt,Date.now());
  const key='labeled:'+String(source)+':'+String(item.symbol).toUpperCase()+':'+Math.floor(knowledgeAt/60000);
  if(state.observations.some(x=>x.key===key))return{added:0,duplicate:true,prediction:pred,status:statusOf(state)};
  const canonical=Canonical.canonicalize({...item,asOf:knowledgeAt},{capturedAt:knowledgeAt,source,bookRuleIds:pred.bookEvidence.matched.map(x=>x.id)});
  state.observations.push({
    key,symbol:String(item.symbol).toUpperCase(),asOf:knowledgeAt,capturedAt:knowledgeAt,price:itemPrice(item),
    scannerState:item.state||item.scanClass?.key||item.dataState||null,scannerScore:Evidence.scannerScore(item),regime:(()=>{const r=Regime.detect(item);return r.regime!=='UNKNOWN'?r.regime:(item.regime||null)})(),regimeMeta:Regime.detect(item),
    setupType:item.setup?.type||item.sampleArchetype||item.v2Type||null,
    features:pred.features,canonicalSnapshot:canonical,researchScore:pred.score,researchStage:pred.stage,
    sampleTop:pred.sampleSimilarity.top.slice(0,3),bookRuleIds:pred.bookEvidence.matched.map(x=>x.id),
    outcomeV2:metadata?.outcome||{confirmed:true,source:'retrospective-auto-sample',metadata:metadata||null},
    label:y,labelStatus:'RETROSPECTIVE_KNOWN_AT_CAPTURE',source,metadata:metadata||null,referenceOnly:metadata?.referenceOnly!==false,
    integrity:Integrity.integrityMeta({item,canonical,asOf:knowledgeAt,source,sourceScanId:metadata?.sourceScanId||null,experimentCountBeforeThis:state.observations.length})
  });
  if(state.observations.length>MAX_OBSERVATIONS)state.observations=state.observations.slice(-MAX_OBSERVATIONS);
  retrain(state);state.updatedAt=knowledgeAt;state.source=source;
  return{added:1,duplicate:false,prediction:pred,status:statusOf(state)};
}
function freezeLockedOos(state,startAt){
  const t=n(startAt);if(t==null)throw new Error('locked OOS start required');
  if(state.validation?.lockedOosStart!=null&&state.validation.lockedOosStart!==t)throw new Error('locked OOS boundary already frozen');
  state.validation={...state.validation,lockedOosStart:t,frozenAt:state.validation?.frozenAt||Date.now(),oosGeneration:Number(state.validation?.oosGeneration||0)+1};
  retrain(state);return state.validation;
}
function statusOf(state){
  const cohortRows=state.observations.filter(x=>!x.referenceOnly),labeled=cohortRows.filter(x=>x.label===0||x.label===1),pending=cohortRows.filter(x=>x.label==null);
  const modelEntry=(state.registry?.models||[]).find(x=>x.id==='tiny-mlp-v2');
  const stats=ResearchStats.summary(state.observations),archetypes=ArchetypeLab.buildClusters(state.observations);
  return{
    version:VERSION,shadowOnly:true,updatedAt:state.updatedAt,observations:state.observations.length,pending:pending.length,
    labels:labeled.length,positive:labeled.filter(x=>x.label===1).length,negative:labeled.filter(x=>x.label===0).length,
    model:{type:Neural.MODEL_TYPE,state:modelEntry?.state||'SHADOW',active:labeled.length>=MIN_LABELS,minimumLabels:MIN_LABELS,trainedAt:state.model?.trainedAt||null,lastLoss:state.training?.lastLoss??null},
    dataset:state.training?.dataset||null,metrics:state.training?.metrics||null,validation:state.validation||null,
    research:{archetypeCandidates:archetypes.length,bookRuleRows:stats.bookRules.length,derivedRuleCandidates:stats.derivedRules.length,hypothesisLab:'export에서 계산',researchIdeas:'export에서 계산'},
    sources:{seedSamples:Evidence.loadSeedSamples().length,autoReverseTraceSamples:state.observations.filter(x=>x.source==='auto-surge-reverse-trace').length,autoFailureSamples:state.observations.filter(x=>x.source==='auto-failed-ignition-reverse-trace').length,bookTechniques:Book.TECHNIQUES.length,bookRankingTechniques:Book.activeForRanking().length},
    persistence:state.memory?.persistence||'github-learning-memory'
  };
}

function mergeExperimentLedger(existing=[],experiments=[],datasetSnapshotId=null){
  const map=new Map((existing||[]).map(x=>[x.idempotencyKey,x]));
  const now=Date.now();
  for(const exp of experiments||[]){
    const key=String(exp.idempotencyKey||'');if(!key)continue;
    const prev=map.get(key);
    const stopReason=exp.state==='SAMPLE_INSUFFICIENT'?'SAMPLE_INSUFFICIENT':exp.state==='BLOCKED_DATA_QUALITY'?'BLOCKED_DATA_QUALITY':null;
    map.set(key,{...(prev||{}),experimentId:exp.id,hypothesisId:exp.hypothesisId,idempotencyKey:key,datasetSnapshotId,
      strategyId:exp.dna?.strategyId||null,strategyVersion:exp.dna?.version||null,state:exp.state,testCount:prev?.testCount||1,
      firstSeenAt:prev?.firstSeenAt||now,lastSeenAt:now,stopReason,rankWeight:0,budget:exp.budget||null});
  }
  return [...map.values()].sort((a,b)=>Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0)).slice(0,300);
}
function mergeResearchNotes(existing=[],notes=[]){
  const map=new Map((existing||[]).map(x=>[x.id,x]));
  for(const n of notes||[])if(n?.id)map.set(n.id,{...(map.get(n.id)||{}),...n});
  return [...map.values()].sort((a,b)=>Number(b.at||0)-Number(a.at||0)).slice(0,300);
}

function strategyPreRegistered(state,strategy){
  const frozenAt=Number(state.validation?.frozenAt||0);if(!frozenAt)return false;
  return (state.experimentLedger||[]).some(x=>x.strategyId===strategy?.strategyId&&String(x.strategyVersion||'')===String(strategy?.version||strategy?.strategyVersion||'')&&Number(x.firstSeenAt||0)<=frozenAt);
}
function sealedReview(state,{champion,challenger}={}){
  if(!state.validation?.lockedOosStart)return{status:'BLOCKED',reason:'LOCKED_OOS_NOT_FROZEN'};
  if(!strategyPreRegistered(state,champion)||!strategyPreRegistered(state,challenger))return{status:'BLOCKED',reason:'STRATEGY_NOT_PREREGISTERED_BEFORE_OOS_FREEZE'};
  const result=SealedOos.compare({rows:state.observations,champion,challenger,lockedOosStart:state.validation.lockedOosStart,minSample:30,minRegimes:2,iterations:1000});
  const row={id:'OOS-'+Date.now(),recordedAt:Date.now(),champion:{strategyId:champion.strategyId,version:champion.version||champion.strategyVersion},challenger:{strategyId:challenger.strategyId,version:challenger.version||challenger.strategyVersion},result};
  state.sealedReviews=[row,...(state.sealedReviews||[])].slice(0,100);state.updatedAt=Date.now();state.source='sealed-oos-review';return row;
}
class ResearchAIv2{
  constructor(){this.state=loadLocal();this.hydrating=null;this.lastRemoteHydrate=0}
  async hydrateRemote(force=false){
    if(!force&&Date.now()-this.lastRemoteHydrate<5*60*1000)return false;
    if(this.hydrating)return this.hydrating;
    this.hydrating=(async()=>{
      try{
        const r=await fetch(REMOTE_STATE_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6000)});
        if(!r.ok)return false;
        const remote=sanitizeState(await r.json());
        if(n(remote.updatedAt,0)>n(this.state.updatedAt,0))this.state=remote;
        this.lastRemoteHydrate=Date.now();return true;
      }catch{return false}finally{this.hydrating=null}
    })();
    return this.hydrating;
  }
  predict(item){return scorePrediction(this.state,item)}
  observe(items,meta={}){return observeBatch(this.state,Array.isArray(items)?items:[items],meta)}
  ingestLabeled(item,opts={}){return ingestLabeledSample(this.state,item,opts)}
  resolveSymbol(symbol,candles,opts={}){return resolveSymbol(this.state,String(symbol||'').toUpperCase(),candles,opts)}
  freezeLockedOos(startAt){return freezeLockedOos(this.state,startAt)}
  sealedReview(input){return sealedReview(this.state,input)}
  status(){return statusOf(this.state)}
  exportState(){
    const locked=this.state.validation?.lockedOosStart;
    const discoveryRows=this.state.observations.filter(x=>!x.referenceOnly&&!Integrity.isOos(x,locked));
    const referenceRows=this.state.observations.filter(x=>x.referenceOnly);
    const lab=ResearchLab.labSummary(discoveryRows,{integrity:this.state.integrity,pastNotes:this.state.memory?.researchNotes||[]});
    this.state.experimentLedger=mergeExperimentLedger(this.state.experimentLedger,lab.experiments,this.state.integrity?.datasetSnapshotId||null);
    this.state.memory.researchNotes=mergeResearchNotes(this.state.memory?.researchNotes||[],lab.notes||[]);
    const research={stats:ResearchStats.summary(discoveryRows),archetypes:ArchetypeLab.buildClusters(discoveryRows),lab};
    const sealedEvaluation={locked:Boolean(locked),lockedOosStart:locked||null,generation:this.state.validation?.oosGeneration||0,count:this.state.training?.dataset?.lockedOos||0,metrics:this.state.training?.metrics?.lockedOos||null,hypothesisGeneratorAccess:false};
    return JSON.parse(JSON.stringify({...this.state,research,sealedEvaluation,referenceSampleCount:referenceRows.length,exportedAt:Date.now(),featureNames:Evidence.FEATURE_NAMES}))
  }
}
let singleton;
function defaultResearchAIv2(){if(!singleton){singleton=new ResearchAIv2();singleton.hydrateRemote().catch(()=>{})}return singleton}

module.exports={VERSION,MIN_LABELS,MAX_OBSERVATIONS,initialState,sanitizeState,scorePrediction,trainingRows,retrain,observeBatch,ingestLabeledSample,resolveSymbol,freezeLockedOos,strategyPreRegistered,sealedReview,statusOf,mergeExperimentLedger,mergeResearchNotes,ResearchAIv2,defaultResearchAIv2};

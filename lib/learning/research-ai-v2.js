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
const Book=require('../coin-scan/book-strategy-registry.js');

const VERSION='RESEARCH_AI_v2';
const MIN_LABELS=20;
const MAX_OBSERVATIONS=4000;
const STATE_FILE=path.join(__dirname,'..','..','data','learning','research-ai-state.json');
const REMOTE_STATE_URL=process.env.RESEARCH_AI_STATE_URL||
  'https://raw.githubusercontent.com/tjdrprns2001-coder/-pulse-radar-pro-v3/learning-memory/data/learning/research-ai-state.json';

function n(v,d=null){const x=Number(v);return Number.isFinite(x)?x:d}
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
    validation:{lockedOosStart:null,frozenAt:null},
    memory:{seedSamples:Evidence.loadSeedSamples().length,bookTechniques:Book.TECHNIQUES.length,bookRankingTechniques:Book.activeForRanking().length,persistence:'github-learning-memory',
      notes:['SHADOW_ONLY','실제 확정봉 outcome만 정답 라벨 사용','누락값은 저장 시 null 유지','TRAIN→VALIDATION→LOCKED_OOS 시간순 분리']}
  };
}
function migrateObservation(row={}){
  const next={...row};
  if(!Array.isArray(next.features))next.features=[];
  if(!('outcomeV2' in next))next.outcomeV2=null;
  if(!('labelStatus' in next))next.labelStatus=next.label==null?'UNRESOLVED':'LEGACY';
  return next;
}
function sanitizeState(raw){
  const base=initialState(),s=raw&&typeof raw==='object'?{...base,...raw}:base;
  s.version=VERSION;
  s.observations=Array.isArray(s.observations)?s.observations.map(migrateObservation):[];
  if(!Neural.validateModel(s.model,Evidence.FEATURE_NAMES.length))s.model=Neural.createModel(Evidence.FEATURE_NAMES.length);
  s.training={...base.training,...(s.training||{}),dataset:{...base.training.dataset,...(s.training?.dataset||{})},metrics:{...base.training.metrics,...(s.training?.metrics||{})}};
  s.validation={...base.validation,...(s.validation||{})};
  s.registry=s.registry&&Array.isArray(s.registry.models)?s.registry:base.registry;
  s.memory={...base.memory,...(s.memory||{}),seedSamples:Evidence.loadSeedSamples().length,bookTechniques:Book.TECHNIQUES.length,bookRankingTechniques:Book.activeForRanking().length,persistence:'github-learning-memory'};
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
  return observations.filter(x=>(x.label===0||x.label===1)&&Array.isArray(x.features)&&x.features.length===Evidence.FEATURE_NAMES.length)
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
  if(labeled.length<MIN_LABELS){
    state.training.dataset={train:0,validation:0,lockedOos:0};
    state.training.metrics={validation:null,lockedOos:null};
    return state;
  }
  const split=Split.chronological(labeled,{lockedOosStart:state.validation?.lockedOosStart});
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
  state.training.dataset={train:trainRows.length,validation:split.validation.length,lockedOos:split.lockedOos.length};
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
    const key=observationKey(item);
    if(state.observations.some(x=>x.key===key))continue;
    const canonical=Canonical.canonicalize(item,{capturedAt:now,source:meta.source||'scanner',bookRuleIds:pred.bookEvidence.matched.map(x=>x.id)});
    state.observations.push({
      key,symbol:item.symbol,asOf:itemTime(item),capturedAt:now,price:itemPrice(item),
      scannerState:item.state||item.scanClass?.key||item.dataState||null,scannerScore:Evidence.scannerScore(item),regime:item.regime||null,
      setupType:item.setup?.type||item.sampleArchetype||item.v2Type||null,
      features:pred.features,canonicalSnapshot:canonical,researchScore:pred.score,researchStage:pred.stage,
      sampleTop:pred.sampleSimilarity.top.slice(0,3),bookRuleIds:pred.bookEvidence.matched.map(x=>x.id),
      outcomeV2:null,label:null,labelStatus:'UNRESOLVED',source:meta.source||'scanner'
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
function freezeLockedOos(state,startAt){
  const t=n(startAt);if(t==null)throw new Error('locked OOS start required');
  if(state.validation?.lockedOosStart!=null&&state.validation.lockedOosStart!==t)throw new Error('locked OOS boundary already frozen');
  state.validation={lockedOosStart:t,frozenAt:state.validation?.frozenAt||Date.now()};
  retrain(state);return state.validation;
}
function statusOf(state){
  const labeled=state.observations.filter(x=>x.label===0||x.label===1),pending=state.observations.filter(x=>x.label==null);
  const modelEntry=(state.registry?.models||[]).find(x=>x.id==='tiny-mlp-v2');
  return{
    version:VERSION,shadowOnly:true,updatedAt:state.updatedAt,observations:state.observations.length,pending:pending.length,
    labels:labeled.length,positive:labeled.filter(x=>x.label===1).length,negative:labeled.filter(x=>x.label===0).length,
    model:{type:Neural.MODEL_TYPE,state:modelEntry?.state||'SHADOW',active:labeled.length>=MIN_LABELS,minimumLabels:MIN_LABELS,trainedAt:state.model?.trainedAt||null,lastLoss:state.training?.lastLoss??null},
    dataset:state.training?.dataset||null,metrics:state.training?.metrics||null,validation:state.validation||null,
    sources:{seedSamples:Evidence.loadSeedSamples().length,bookTechniques:Book.TECHNIQUES.length,bookRankingTechniques:Book.activeForRanking().length},
    persistence:state.memory?.persistence||'github-learning-memory'
  };
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
  resolveSymbol(symbol,candles,opts={}){return resolveSymbol(this.state,String(symbol||'').toUpperCase(),candles,opts)}
  freezeLockedOos(startAt){return freezeLockedOos(this.state,startAt)}
  status(){return statusOf(this.state)}
  exportState(){return JSON.parse(JSON.stringify({...this.state,exportedAt:Date.now(),featureNames:Evidence.FEATURE_NAMES}))}
}
let singleton;
function defaultResearchAIv2(){if(!singleton){singleton=new ResearchAIv2();singleton.hydrateRemote().catch(()=>{})}return singleton}

module.exports={VERSION,MIN_LABELS,MAX_OBSERVATIONS,initialState,sanitizeState,scorePrediction,trainingRows,retrain,observeBatch,resolveSymbol,freezeLockedOos,statusOf,ResearchAIv2,defaultResearchAIv2};

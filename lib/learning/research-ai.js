'use strict';

const fs=require('fs');
const path=require('path');
const Book=require('../coin-scan/book-strategy-registry.js');

const VERSION='RESEARCH_AI_v1';
const MODEL_TYPE='tiny_mlp_18x12x6x1';
const FEATURE_NAMES=[
  'scannerScore','change24h','liquidityLog','oi4h','taker','funding',
  'setupValid','setupType','trend1d','trend4h','rsi1h','rvol1h',
  'compression1h','obv1h','rsi15m','rvol15m','regime','netRR'
];
const STATE_FILE=path.join(__dirname,'..','..','data','learning','research-ai-state.json');
const REMOTE_STATE_URL=process.env.RESEARCH_AI_STATE_URL||
  'https://raw.githubusercontent.com/tjdrprns2001-coder/-pulse-radar-pro-v3/learning-memory/data/learning/research-ai-state.json';
const MAX_OBSERVATIONS=4000;
const MIN_LABELS=20;

function n(v,d=null){const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v,a=-1,b=1){v=n(v,0);return Math.max(a,Math.min(b,v))}
function sigmoid(x){return 1/(1+Math.exp(-Math.max(-30,Math.min(30,x))))}
function trend(v){return v==='UP'?1:v==='DOWN'?-1:0}
function regime(v){return v==='SUPPORTIVE'?1:v==='RISK_OFF'?-1:0}
function typeCode(v){
  return ({SWEEP_RECLAIM:1,BREAKOUT_RETEST:.8,TREND_PULLBACK:.65,COMPRESSION:.35,NONE:0})[String(v||'').toUpperCase()]||0;
}
function normalizeItem(item={}){
  const s1=item.stats?.['1h']||{},s15=item.stats?.['15m']||{};
  const logVol=item.quoteVolume24h>0?Math.log10(Math.max(1,item.quoteVolume24h/1e6))/4:0;
  const out=[
    clamp(n(item.score,0)/100,0,1),
    clamp(n(item.change24h,0)/8),
    clamp(logVol,0,1),
    clamp(n(item.flow?.oi4hPct,0)/10),
    clamp((n(item.flow?.takerRatio,1)-1)/.8),
    clamp(n(item.flow?.funding8hPct,0)/.05),
    item.setup?.valid?1:0,
    typeCode(item.setup?.type),
    trend(item.stats?.['1d']?.trend),
    trend(item.stats?.['4h']?.trend),
    clamp((n(s1.rsi,50)-50)/30),
    clamp(Math.log2(Math.max(.25,n(s1.rvol,1)))/4),
    clamp(1-n(s1.compression,4)/8,-1,1),
    s1.obvUp?1:-1,
    clamp((n(s15.rsi,50)-50)/30),
    clamp(Math.log2(Math.max(.25,n(s15.rvol,1)))/4),
    regime(item.regime),
    clamp(n(item.plan?.netRR,0)/3,0,1)
  ];
  return out.map(x=>n(x,0));
}
function seedFeature(sample={}){
  const t4=sample.tf4h||{},t1=sample.tf1h||{},t15=sample.tf15m||{};
  return [
    null,
    n(sample.pre6h_change_pct),
    null,
    n(sample.oi_pre_4h_pct),
    n(sample.taker_pre_1h),
    null,
    /up/i.test(String(t1.bos||''))?1:0,
    /up/i.test(String(t1.bos||''))?0.8:0,
    null,
    String(t4.ma_align||'')==='bull'?1:String(t4.ma_align||'')==='bear'?-1:0,
    n(t1.rsi),
    n(t1.rvol),
    null,
    null,
    n(t15.rsi),
    n(t15.rvol),
    null,
    null
  ];
}
function normalizedSeedFeature(sample={}){
  const x=seedFeature(sample);
  const out=new Array(FEATURE_NAMES.length).fill(null);
  out[1]=x[1]==null?null:clamp(x[1]/8);
  out[3]=x[3]==null?null:clamp(x[3]/10);
  out[4]=x[4]==null?null:clamp((x[4]-1)/.8);
  out[6]=x[6];out[7]=x[7];out[9]=x[9];
  out[10]=x[10]==null?null:clamp((x[10]-50)/30);
  out[11]=x[11]==null?null:clamp(Math.log2(Math.max(.25,x[11]))/4);
  out[14]=x[14]==null?null:clamp((x[14]-50)/30);
  out[15]=x[15]==null?null:clamp(Math.log2(Math.max(.25,x[15]))/4);
  return out;
}
function distanceSimilarity(a,b){
  let sum=0,count=0;
  for(let i=0;i<Math.min(a.length,b.length);i++){
    if(a[i]==null||b[i]==null)continue;
    const d=a[i]-b[i];sum+=d*d;count++;
  }
  if(!count)return .5;
  return Math.exp(-sum/count*2.2);
}
function deterministicWeight(i,j,scale=.12){return Math.sin((i+1)*17.13+(j+1)*9.77)*scale}
function newModel(){
  const h1=12,h2=6,input=FEATURE_NAMES.length;
  return{
    type:MODEL_TYPE,trainedLabels:0,trainedAt:null,
    w1:Array.from({length:h1},(_,j)=>Array.from({length:input},(_,i)=>deterministicWeight(i,j))),
    b1:Array(h1).fill(0),
    w2:Array.from({length:h2},(_,j)=>Array.from({length:h1},(_,i)=>deterministicWeight(i,j,.1))),
    b2:Array(h2).fill(0),
    w3:Array.from({length:h2},(_,i)=>deterministicWeight(i,0,.1)),
    b3:0
  };
}
function forward(model,x){
  const h1=model.w1.map((row,j)=>Math.tanh(row.reduce((s,w,i)=>s+w*x[i],model.b1[j])));
  const h2=model.w2.map((row,j)=>Math.tanh(row.reduce((s,w,i)=>s+w*h1[i],model.b2[j])));
  const z=model.w3.reduce((s,w,i)=>s+w*h2[i],model.b3);
  return{h1,h2,p:sigmoid(z)};
}
function trainOne(model,x,y,lr=.025){
  const f=forward(model,x),dz=f.p-y;
  const oldW3=model.w3.slice();
  for(let i=0;i<model.w3.length;i++)model.w3[i]-=lr*dz*f.h2[i];
  model.b3-=lr*dz;
  const dh2=oldW3.map((w,i)=>dz*w*(1-f.h2[i]*f.h2[i]));
  const oldW2=model.w2.map(r=>r.slice());
  for(let j=0;j<model.w2.length;j++){
    for(let i=0;i<model.w2[j].length;i++)model.w2[j][i]-=lr*dh2[j]*f.h1[i];
    model.b2[j]-=lr*dh2[j];
  }
  const dh1=f.h1.map((h,i)=>{
    let s=0;for(let j=0;j<oldW2.length;j++)s+=dh2[j]*oldW2[j][i];
    return s*(1-h*h);
  });
  for(let j=0;j<model.w1.length;j++){
    for(let i=0;i<model.w1[j].length;i++)model.w1[j][i]-=lr*dh1[j]*x[i];
    model.b1[j]-=lr*dh1[j];
  }
  return f.p;
}
function loadSeedSamples(){
  try{return require('../../PRE_SURGE_V3_REVERSE_TRACE_2026-09-26.json').samples||[]}catch{return[]}
}
function initialState(){
  return{
    version:VERSION,updatedAt:Date.now(),source:'local-seed',
    model:newModel(),observations:[],
    training:{labels:0,positive:0,negative:0,lastLoss:null,lastTrainedAt:null},
    memory:{
      seedSamples:loadSeedSamples().length,
      bookTechniques:Book.TECHNIQUES.length,
      bookRankingTechniques:Book.activeForRanking().length,
      persistence:'github-learning-memory',
      notes:['샘플·책 규칙·실제 6H/24H 결과를 분리 저장','모델은 SHADOW_ONLY이며 자동 랭킹을 직접 변경하지 않음']
    }
  };
}
function sanitizeState(raw){
  const s=raw&&typeof raw==='object'?raw:initialState();
  if(!s.model||s.model.type!==MODEL_TYPE)s.model=newModel();
  if(!Array.isArray(s.observations))s.observations=[];
  if(!s.training)s.training={labels:0,positive:0,negative:0,lastLoss:null,lastTrainedAt:null};
  if(!s.memory)s.memory=initialState().memory;
  s.version=VERSION;
  return s;
}
function loadLocal(){
  try{return sanitizeState(JSON.parse(fs.readFileSync(STATE_FILE,'utf8')))}catch{return initialState()}
}
function bookEvidence(item={}){
  const matched=[];
  const add=(id,why)=>{const row=Book.get(id);if(row)matched.push({id,label:row.label,why})};
  const d=item.stats?.['1d']||{},h4=item.stats?.['4h']||{},h1=item.stats?.['1h']||{},m15=item.stats?.['15m']||{};
  if(d.trend==='UP'&&h4.trend==='UP')add('MARKET_STRUCTURE','1D·4H 상승 구조');
  if(h1.rvol>=1.5||m15.rvol>=1.5)add('VOLUME_PRICE','하위봉 RVOL 증가');
  if(item.setup?.type==='SWEEP_RECLAIM')add('LIQUIDITY_SWEEP','저점 스윕 후 회복');
  if(item.setup?.type==='BREAKOUT_RETEST')add('TRENDLINE_RETEST','돌파 후 리테스트');
  if(item.setup?.type==='TREND_PULLBACK')add('TREND_FOLLOWING','추세 눌림·회복');
  if(h1.obvUp)add('OBV','1H OBV 우위');
  if(n(h1.rsi)!=null)add('RSI','1H RSI 확인');
  if(n(h1.macd)!=null)add('MACD','1H MACD 확인');
  const rankIds=new Set(Book.activeForRanking().map(x=>x.id));
  const rankHits=matched.filter(x=>rankIds.has(x.id)).length;
  const score=Math.min(100,Math.round(rankHits/Math.max(1,Math.min(5,Book.activeForRanking().length))*100));
  return{score,matched:matched.slice(0,8),registryVersion:Book.VERSION};
}
function sampleSimilarity(item={}){
  const x=normalizeItem(item),seeds=loadSeedSamples();
  const rows=seeds.map(s=>({symbol:s.symbol,similarity:distanceSimilarity(x,normalizedSeedFeature(s))}))
    .sort((a,b)=>b.similarity-a.similarity);
  const top=rows.slice(0,5);
  const score=Math.round((top.reduce((s,r)=>s+r.similarity,0)/Math.max(1,top.length))*100);
  return{score,top};
}
function stage(score){
  if(score>=80)return'PRE_SURGE_MATCH';
  if(score>=65)return'READY';
  if(score>=50)return'WATCH';
  return'LOW_MATCH';
}
function labelFrom(obs){
  const r6=n(obs.outcome6hPct),r24=n(obs.outcome24hPct);
  if(r6!=null&&r6>=4)return 1;
  if(r6!=null&&r6<=-2)return 0;
  if(r24!=null&&r24>=8)return 1;
  if(r24!=null&&r24<=0)return 0;
  return null;
}
function predictionFor(state,item){
  const sample=sampleSimilarity(item),book=bookEvidence(item),base=clamp(n(item.score,0)/100,0,1);
  const x=normalizeItem(item),labels=n(state.training?.labels,0);
  const neural=labels>=MIN_LABELS?forward(state.model,x).p:null;
  let p=.45*base+.35*(sample.score/100)+.20*(book.score/100);
  if(neural!=null)p=.7*p+.3*neural;
  const score=Math.round(clamp(p,0,1)*100);
  return{
    version:VERSION,shadowOnly:true,score,stage:stage(score),
    sampleSimilarity:sample,bookEvidence:book,
    neural:{active:neural!=null,score:neural==null?null:Math.round(neural*100),labels,minimumLabels:MIN_LABELS,model:MODEL_TYPE},
    note:'연구용 SHADOW_ONLY. 기존 자동스캐너 순위·진입 판단을 직접 변경하지 않음.'
  };
}
function maybeResolveOutcomes(state,item,now=Date.now()){
  const price=n(item.price);if(!(price>0))return 0;
  let changed=0;
  for(const o of state.observations){
    if(o.symbol!==item.symbol||!(o.price>0)||o.asOf>=now)continue;
    const age=now-o.asOf;
    if(o.outcome6hPct==null&&age>=6*3600000){
      o.outcome6hPct=(price/o.price-1)*100;o.outcome6hAt=now;changed++;
    }
    if(o.outcome24hPct==null&&age>=24*3600000){
      o.outcome24hPct=(price/o.price-1)*100;o.outcome24hAt=now;changed++;
    }
    const y=labelFrom(o);if(y!=null&&o.label==null){o.label=y;o.labeledAt=now;changed++}
  }
  return changed;
}
function retrain(state){
  const labeled=state.observations.filter(x=>x.label===0||x.label===1).slice(-500);
  state.training.labels=labeled.length;
  state.training.positive=labeled.filter(x=>x.label===1).length;
  state.training.negative=labeled.filter(x=>x.label===0).length;
  if(labeled.length<MIN_LABELS)return;
  const model=state.model||newModel();
  let loss=0,count=0;
  for(let epoch=0;epoch<12;epoch++){
    for(const row of labeled){
      const p=trainOne(model,row.features,row.label,.018);
      loss+=-(row.label*Math.log(Math.max(1e-6,p))+(1-row.label)*Math.log(Math.max(1e-6,1-p)));count++;
    }
  }
  model.trainedLabels=labeled.length;model.trainedAt=Date.now();
  state.model=model;state.training.lastLoss=count?loss/count:null;state.training.lastTrainedAt=Date.now();
}
function observationKey(item){return String(item.symbol||'')+':'+Math.floor(n(item.asOf,Date.now())/3600000)}
function observeBatch(state,items=[],meta={}){
  const now=Date.now(),predictions={};let resolved=0,added=0;
  for(const item of items||[]){
    if(!item?.symbol)continue;
    resolved+=maybeResolveOutcomes(state,item,now);
    const pred=predictionFor(state,item);predictions[item.symbol]=pred;
    if(item.state==='DATA_GAP')continue;
    const key=observationKey(item);
    if(state.observations.some(x=>x.key===key))continue;
    state.observations.push({
      key,symbol:item.symbol,asOf:n(item.asOf,now),capturedAt:now,price:n(item.price),
      scannerState:item.state||null,scannerScore:n(item.score),regime:item.regime||null,
      setupType:item.setup?.type||null,features:normalizeItem(item),
      researchScore:pred.score,researchStage:pred.stage,
      sampleTop:pred.sampleSimilarity.top.slice(0,3),bookRuleIds:pred.bookEvidence.matched.map(x=>x.id),
      outcome6hPct:null,outcome24hPct:null,label:null,source:meta.source||'trader-scan'
    });added++;
  }
  if(state.observations.length>MAX_OBSERVATIONS)state.observations=state.observations.slice(-MAX_OBSERVATIONS);
  if(resolved)retrain(state);
  state.updatedAt=now;state.source='runtime';
  return{predictions,added,resolved,status:statusOf(state)};
}
function statusOf(state){
  const labeled=state.observations.filter(x=>x.label===0||x.label===1);
  return{
    version:VERSION,shadowOnly:true,updatedAt:state.updatedAt,
    observations:state.observations.length,labels:labeled.length,
    positive:labeled.filter(x=>x.label===1).length,negative:labeled.filter(x=>x.label===0).length,
    model:{type:MODEL_TYPE,active:labeled.length>=MIN_LABELS,minimumLabels:MIN_LABELS,trainedAt:state.model?.trainedAt||null,lastLoss:state.training?.lastLoss??null},
    sources:{seedSamples:loadSeedSamples().length,bookTechniques:Book.TECHNIQUES.length,bookRankingTechniques:Book.activeForRanking().length},
    persistence:state.memory?.persistence||'github-learning-memory'
  };
}
class ResearchAI{
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
  predict(item){return predictionFor(this.state,item)}
  observe(items,meta={}){return observeBatch(this.state,Array.isArray(items)?items:[items],meta)}
  status(){return statusOf(this.state)}
  exportState(){
    return JSON.parse(JSON.stringify({...this.state,exportedAt:Date.now(),featureNames:FEATURE_NAMES}));
  }
}
let singleton;
function defaultResearchAI(){if(!singleton){singleton=new ResearchAI();singleton.hydrateRemote().catch(()=>{})}return singleton}

module.exports={VERSION,MODEL_TYPE,FEATURE_NAMES,normalizeItem,sampleSimilarity,bookEvidence,predictionFor,observeBatch,statusOf,ResearchAI,defaultResearchAI};

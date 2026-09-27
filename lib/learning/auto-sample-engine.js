'use strict';

const {defaultResearchAIv2}=require('./research-ai-v2.js');

const VERSION='AUTO_SURGE_SAMPLE_ENGINE_v1';
const CHECKPOINTS=[72,24,12,4,1,.25];
const TF_MS={'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000,'3d':259200000,'1w':604800000};

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,n(v,0)))}
function kTime(r){return Array.isArray(r)?n(r[0]):n(r?.time??r?.openTime)}
function kClose(r){return Array.isArray(r)?n(r[4]):n(r?.close)}
function kHigh(r){return Array.isArray(r)?n(r[2]):n(r?.high)}
function kLow(r){return Array.isArray(r)?n(r[3]):n(r?.low)}
function kVol(r){return Array.isArray(r)?n(r[5],0):n(r?.volume,0)}
function closed(rows=[]){const a=(Array.isArray(rows)?rows:[]).filter(x=>kTime(x)!=null&&kClose(x)!=null);return a.length>20?a.slice(0,-1):a}
function before(rows,cutoff){return closed(rows).filter(x=>kTime(x)<=cutoff)}
function avg(a=[]){const x=a.map(n).filter(v=>v!=null);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function rsi(rows,period=14){const c=rows.map(kClose).filter(v=>v!=null);if(c.length<period+1)return null;let g=0,l=0;for(let i=c.length-period;i<c.length;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}const ag=g/period,al=l/period;return al===0?(ag>0?100:50):100-100/(1+ag/al)}
function rvol(rows,period=20){if(rows.length<period+1)return null;const v=kVol(rows.at(-1)),base=avg(rows.slice(-period-1,-1).map(kVol));return base>0&&v!=null?v/base:null}
function ema(values,period){if(values.length<period)return null;const k=2/(period+1);let e=values.slice(0,period).reduce((s,v)=>s+v,0)/period;for(let i=period;i<values.length;i++)e=values[i]*k+e*(1-k);return e}
function stats(rows=[]){
  const a=rows.filter(x=>kClose(x)!=null),c=a.map(kClose);if(!a.length)return{available:false};
  const e20=ema(c,20),e60=ema(c,60),last=c.at(-1);
  return{available:true,bars:a.length,close:last,rsi:rsi(a),rvol:rvol(a),trend:e20!=null&&e60!=null?(e20>e60&&last>=e20?'UP':e20<e60&&last<=e20?'DOWN':'MIXED'):'MIXED',ema20:e20,ema60:e60};
}
function changePct(rows,hours,tfMs){
  if(!rows.length)return null;const last=rows.at(-1),lastT=kTime(last),target=lastT-hours*3600000;let prior=null;
  for(const r of rows){if(kTime(r)<=target)prior=r;else break}
  const a=kClose(prior),b=kClose(last);return a&&b!=null?((b/a)-1)*100:null;
}
function volume24h(rows,tfMs){if(!rows.length)return null;const lastT=kTime(rows.at(-1)),cut=lastT-86400000;return rows.filter(r=>kTime(r)>=cut).reduce((s,r)=>s+(kVol(r)||0)*(kClose(r)||0),0)}
function detectCompleted(item={}){
  const cls=String(item.scanClass?.key||''),v2=String(item.v2Type||item.v2RawType||''),phase=String(item.samplePhase||'');
  const ch=n(item.priceChange24h,0),ch1=n(item.priceChange1h,0);
  return cls==='POST-SURGE'||v2==='PROGRESSED'||phase==='PROGRESSED'||ch>=10||ch1>=8;
}
function detectOnset(frames={},asOf=Date.now()){
  const rows=closed(frames['15m']||[]).filter(r=>kTime(r)<=asOf).slice(-192);
  if(rows.length<32)return null;
  let best=null;
  for(let end=Math.max(12,rows.length-96);end<rows.length;end++){
    const hi=kHigh(rows[end]);if(hi==null)continue;
    const from=Math.max(0,end-96);let low=Infinity,idx=-1;
    for(let i=from;i<end;i++){const lo=kLow(rows[i]);if(lo!=null&&lo<low){low=lo;idx=i}}
    if(idx<0||!Number.isFinite(low)||low<=0)continue;
    const move=(hi/low-1)*100;
    if(move>=10){best={onsetIndex:idx,onsetAt:kTime(rows[idx]),onsetPrice:kClose(rows[idx]),peakAt:kTime(rows[end]),peakPrice:hi,surgePct:move};break}
  }
  return best;
}
function checkpoint(frameRows,onsetAt,hours,tf){
  const rows=closed(frameRows||[]),cut=onsetAt-hours*3600000;let row=null;
  for(const r of rows){if(kTime(r)<=cut)row=r;else break}
  if(!row)return null;
  return{hoursBefore:hours,time:kTime(row),price:kClose(row),tf};
}
function buildCheckpoints(frames,onsetAt){
  return CHECKPOINTS.map(h=>{
    const tf=h>=24?'4h':h>=4?'1h':'15m';
    return checkpoint(frames[tf],onsetAt,h,tf);
  }).filter(Boolean);
}
function buildResearchItem(item,frames,onset,knownAt){
  const cutoff=onset.onsetAt-900000;
  const f1d=before(frames['1d']||[],cutoff),f4=before(frames['4h']||[],cutoff),f1=before(frames['1h']||[],cutoff),f15=before(frames['15m']||[],cutoff);
  const s1d=stats(f1d),s4=stats(f4),s1=stats(f1),s15=stats(f15);
  const base=f1.length?f1:f15,last=base.at(-1),price=kClose(last);
  return{
    symbol:item.symbol,asOf:knownAt,updatedAt:knownAt,price,lastPrice:price,
    priceChange24h:changePct(f1,24,TF_MS['1h']),
    quoteVolume24h:volume24h(f1,TF_MS['1h']),
    stats:{'1d':s1d,'4h':s4,'1h':s1,'15m':s15},
    tfState:{'1d':s1d.trend,'4h':s4.trend,'1h':s1.trend,'15m':s15.trend},
    structure:s4.trend==='UP'||s1.trend==='UP'?'bullish':s4.trend==='DOWN'?'bearish':'neutral',
    setup:{type:item.breakout?'BREAKOUT_RETEST':item.pullback?'TREND_PULLBACK':item.sampleArchetype||'AUTO_REVERSE_TRACE',valid:true},
    sampleArchetype:item.sampleArchetype||item.v2Type||null,
    dataState:'live',state:'AUTO_PRE_SURGE_SAMPLE',
    flow:{oi4hPct:null,takerRatio:null,funding8hPct:null},
    scannerScore:n(item.preIgnitionScore,n(item.candidateScore,n(item.tradeSignal?.confidence,50))),
    researchOnly:true,
    autoSample:{lookaheadSafe:true,featureCutoffAt:cutoff,knownAt,sourceEvent:'IGNITION_COMPLETED'}
  };
}
function similarity(a=[],b=[]){
  let sum=0,count=0;for(let i=0;i<Math.min(a.length,b.length);i++){const x=n(a[i]),y=n(b[i]);if(x==null||y==null)continue;const d=x-y;sum+=d*d;count++}
  return count?Math.exp(-(sum/count)*2.4):0;
}
class AutoSampleEngine{
  constructor(){this.ai=defaultResearchAIv2();this.seen=new Set();this.registry=[];this.hydrated=false}
  async hydrate(){if(this.hydrated)return;await this.ai.hydrateRemote(false);this.hydrated=true}
  score(item){
    const pred=this.ai.predict(item),features=pred.features||[];let top=null;
    for(const s of this.registry){const sim=similarity(features,s.features||[]);if(!top||sim>top.similarity)top={sampleId:s.sampleId,symbol:s.symbol,similarity:sim,surgePct:s.surgePct}}
    return{version:VERSION,shadowOnly:true,researchScore:pred.score,researchStage:pred.stage,nearestAutoSample:top?{...top,similarityPct:Math.round(top.similarity*100)}:null,registrySize:this.registry.length,promotionState:'SHADOW',rankWeight:0};
  }
  async observe({items=[],framesBySymbol={},asOf=Date.now(),sourceScanId=null}={}){
    await this.hydrate();const captured=[],errors=[];let duplicates=0;
    for(const item of items){
      try{
        item.autoSampleResearch=this.score(item);
        if(!detectCompleted(item))continue;
        const frames=framesBySymbol?.[item.symbol];if(!frames)continue;
        const onset=detectOnset(frames,asOf);if(!onset)continue;
        const sampleId=[item.symbol,onset.onsetAt].join(':');if(this.seen.has(sampleId)){duplicates++;continue}
        const researchItem=buildResearchItem(item,frames,onset,asOf);
        const labeled=this.ai.ingestLabeled(researchItem,{label:1,source:'auto-surge-reverse-trace',knownAt:asOf,metadata:{sampleId,sourceScanId,onset,lookaheadSafe:true,featureCutoffAt:onset.onsetAt-900000}});
        const features=labeled.prediction?.features||this.ai.predict(researchItem).features||[];
        const sample={sampleId,symbol:item.symbol,capturedAt:asOf,sourceScanId,onsetAt:onset.onsetAt,peakAt:onset.peakAt,surgePct:onset.surgePct,featureCutoffAt:onset.onsetAt-900000,lookaheadSafe:true,checkpoints:buildCheckpoints(frames,onset.onsetAt),features,researchScore:labeled.prediction?.score??null,label:1,labelStatus:'RETROSPECTIVE_KNOWN_AT_CAPTURE',derivativesHistoricalCoverage:'N/A_UNLESS_AVAILABLE_AT_CUTOFF'};
        this.registry.push(sample);if(this.registry.length>250)this.registry=this.registry.slice(-250);this.seen.add(sampleId);
        item.autoSampleCapture={captured:true,sampleId,surgePct:Math.round(onset.surgePct*100)/100,featureCutoffAt:sample.featureCutoffAt,lookaheadSafe:true};
        item.autoSampleResearch=this.score(item);captured.push(sample);
      }catch(e){errors.push({symbol:item?.symbol||null,error:String(e?.message||e)})}
    }
    return{version:VERSION,shadowOnly:true,capturedCount:captured.length,duplicateCount:duplicates,registrySize:this.registry.length,captured:captured.slice(-20),researchStatus:this.ai.status(),promotion:{state:'SHADOW',rankWeight:0,reason:'OOS 검증 전 자동 랭킹 반영 금지'},errors};
  }
}
let singleton;
function defaultAutoSampleEngine(){if(!singleton)singleton=new AutoSampleEngine();return singleton}
module.exports={VERSION,CHECKPOINTS,detectCompleted,detectOnset,buildResearchItem,AutoSampleEngine,defaultAutoSampleEngine};

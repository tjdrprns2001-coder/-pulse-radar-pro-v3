'use strict';

const {defaultResearchAIv2}=require('./research-ai-v2.js');
const ResearchLab=require('./research-lab.js');

const VERSION='AUTO_SURGE_SAMPLE_ENGINE_v2';
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

function barRvol(rows,i,period=20){
  if(i<period)return null;
  const base=avg(rows.slice(i-period,i).map(kVol)),v=kVol(rows[i]);
  return base>0&&v!=null?v/base:null;
}
function detectFailedIgnition(frames={},asOf=Date.now()){
  const rows=closed(frames['15m']||[]).filter(r=>kTime(r)<=asOf).slice(-240);
  if(rows.length<64)return null;
  const candidates=[];
  for(let i=Math.max(24,rows.length-112);i<=rows.length-17;i++){
    const close=kClose(rows[i]),prior=rows.slice(Math.max(0,i-16),i),priorHigh=Math.max(...prior.map(kHigh).filter(Number.isFinite));
    if(!Number.isFinite(close)||!Number.isFinite(priorHigh)||priorHigh<=0)continue;
    const rv=barRvol(rows,i,20),prev=kClose(rows[i-1]),impulse=prev>0?((close/prev)-1)*100:0;
    const breakout=close>=priorHigh*1.001;
    if(!(breakout||(rv!=null&&rv>=2&&impulse>=.6)))continue;
    const future=rows.slice(i+1,Math.min(rows.length,i+49));if(future.length<8)continue;
    const peak=Math.max(...future.map(kHigh).filter(Number.isFinite)),trough=Math.min(...future.map(kLow).filter(Number.isFinite)),last=kClose(future.at(-1));
    const peakPct=peak>0?((peak/close)-1)*100:null,troughPct=trough>0?((trough/close)-1)*100:null,endPct=last>0?((last/close)-1)*100:null;
    const fakeout=future.slice(0,8).some(r=>kClose(r)<priorHigh*.997);
    const failed=(peakPct!=null&&peakPct<5)&&((troughPct!=null&&troughPct<=-4)||(endPct!=null&&endPct<=-3)||fakeout);
    if(!failed)continue;
    candidates.push({onsetAt:kTime(rows[i]),onsetPrice:close,peakAt:kTime(future.reduce((a,b)=>kHigh(a)>=kHigh(b)?a:b)),peakPrice:peak,
      surgePct:peakPct??0,drawdownPct:troughPct,endPct,rvol:rv,breakout,fakeout,knownResolvedAt:kTime(future.at(-1))+900000});
  }
  return candidates.length?candidates.at(-1):null;
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
  constructor(){this.ai=defaultResearchAIv2();this.seen=new Set();this.registry=[];this.hydrated=false;this.labCache=null}
  async hydrate(){if(this.hydrated)return;await this.ai.hydrateRemote(false);this.hydrated=true}
  strategyMatch(ruleIds=[],strategy=null){
    if(!strategy?.ruleIds?.length)return null;
    const have=new Set(ruleIds),need=strategy.ruleIds,hit=need.filter(id=>have.has(id)).length;
    return{strategyId:strategy.dna?.strategyId||strategy.id||null,name:strategy.dna?.name||strategy.title||null,
      matchPct:Math.round(hit/need.length*100),matched:hit,total:need.length,labScore:strategy.labScore??null,role:strategy.role||null,rankWeight:0};
  }
  score(item){
    const pred=this.ai.predict(item),features=pred.features||[],ruleIds=(pred.bookEvidence?.matched||[]).map(x=>x.id);let positive=null,negative=null;
    for(const s of this.registry){
      const sim=similarity(features,s.features||[]),row={sampleId:s.sampleId,symbol:s.symbol,similarity:sim,surgePct:s.surgePct,drawdownPct:s.drawdownPct,label:s.label};
      if(s.label===0){if(!negative||sim>negative.similarity)negative=row}
      else if(!positive||sim>positive.similarity)positive=row;
    }
    const comp=this.labCache?.competition||{},champion=this.strategyMatch(ruleIds,comp.champion),
      challengers=(comp.challengers||[]).map(x=>this.strategyMatch(ruleIds,x)).filter(Boolean).sort((a,b)=>b.matchPct-a.matchPct);
    return{version:VERSION,shadowOnly:true,researchScore:pred.score,researchStage:pred.stage,
      nearestAutoSample:positive?{...positive,similarityPct:Math.round(positive.similarity*100)}:null,
      nearestFailureSample:negative?{...negative,similarityPct:Math.round(negative.similarity*100)}:null,
      championMatch:champion,bestChallengerMatch:challengers[0]||null,
      positiveRegistrySize:this.registry.filter(x=>x.label===1).length,negativeRegistrySize:this.registry.filter(x=>x.label===0).length,
      registrySize:this.registry.length,promotionState:'SHADOW',rankWeight:0};
  }
  async observe({items=[],framesBySymbol={},asOf=Date.now(),sourceScanId=null}={}){
    await this.hydrate();
    const cohort=this.ai.observe(items,{source:'auto-scan-cohort',sourceScanId});
    try{this.labCache=ResearchLab.labSummary((this.ai.exportState().observations||[]).filter(x=>!x.referenceOnly))}catch{this.labCache=null}
    const captured=[],negativeCaptured=[],errors=[];let duplicates=0;
    for(const item of items){
      try{
        item.autoSampleResearch=this.score(item);
        const frames=framesBySymbol?.[item.symbol];if(!frames)continue;

        if(detectCompleted(item)){
          const onset=detectOnset(frames,asOf);
          if(onset){
            const sampleId=['POS',item.symbol,onset.onsetAt].join(':');
            if(this.seen.has(sampleId))duplicates++;
            else{
              const researchItem=buildResearchItem(item,frames,onset,asOf);
              researchItem.autoSample.sourceEvent='IGNITION_COMPLETED';
              const labeled=this.ai.ingestLabeled(researchItem,{label:1,source:'auto-surge-reverse-trace',knownAt:asOf,metadata:{sampleId,sourceScanId,onset,lookaheadSafe:true,featureCutoffAt:onset.onsetAt-900000,referenceOnly:true}});
              const features=labeled.prediction?.features||this.ai.predict(researchItem).features||[];
              const sample={sampleId,symbol:item.symbol,capturedAt:asOf,sourceScanId,onsetAt:onset.onsetAt,peakAt:onset.peakAt,surgePct:onset.surgePct,
                featureCutoffAt:onset.onsetAt-900000,lookaheadSafe:true,checkpoints:buildCheckpoints(frames,onset.onsetAt),features,researchScore:labeled.prediction?.score??null,
                label:1,labelStatus:'RETROSPECTIVE_KNOWN_AT_CAPTURE',sampleType:'POSITIVE_SURGE',derivativesHistoricalCoverage:'N/A_UNLESS_AVAILABLE_AT_CUTOFF'};
              this.registry.push(sample);this.seen.add(sampleId);captured.push(sample);
              item.autoSampleCapture={captured:true,sampleId,surgePct:Math.round(onset.surgePct*100)/100,featureCutoffAt:sample.featureCutoffAt,lookaheadSafe:true,label:1};
            }
          }
        }

        const fail=detectFailedIgnition(frames,asOf);
        if(fail&&Number(fail.knownResolvedAt)<=asOf){
          const sampleId=['NEG',item.symbol,fail.onsetAt].join(':');
          if(this.seen.has(sampleId))duplicates++;
          else{
            const researchItem=buildResearchItem(item,frames,fail,asOf);
            researchItem.autoSample.sourceEvent='IGNITION_FAILED';
            researchItem.state='AUTO_FAILED_IGNITION_SAMPLE';
            researchItem.setup={...(researchItem.setup||{}),type:'FAILED_IGNITION',valid:false};
            const labeled=this.ai.ingestLabeled(researchItem,{label:0,source:'auto-failed-ignition-reverse-trace',knownAt:asOf,metadata:{sampleId,sourceScanId,failure:fail,lookaheadSafe:true,featureCutoffAt:fail.onsetAt-900000,referenceOnly:true}});
            const features=labeled.prediction?.features||this.ai.predict(researchItem).features||[];
            const sample={sampleId,symbol:item.symbol,capturedAt:asOf,sourceScanId,onsetAt:fail.onsetAt,peakAt:fail.peakAt,surgePct:fail.surgePct,drawdownPct:fail.drawdownPct,
              endPct:fail.endPct,fakeout:fail.fakeout,rvol:fail.rvol,featureCutoffAt:fail.onsetAt-900000,lookaheadSafe:true,checkpoints:buildCheckpoints(frames,fail.onsetAt),
              features,researchScore:labeled.prediction?.score??null,label:0,labelStatus:'RETROSPECTIVE_FAILURE_KNOWN_AT_CAPTURE',sampleType:'NEGATIVE_FAILED_IGNITION'};
            this.registry.push(sample);this.seen.add(sampleId);negativeCaptured.push(sample);
          }
        }

        if(this.registry.length>400)this.registry=this.registry.slice(-400);
        item.autoSampleResearch=this.score(item);
      }catch(e){errors.push({symbol:item?.symbol||null,error:String(e?.message||e)})}
    }
    return{version:VERSION,shadowOnly:true,cohortObserved:Number(cohort?.added)||0,capturedCount:captured.length,negativeCapturedCount:negativeCaptured.length,duplicateCount:duplicates,
      registrySize:this.registry.length,positiveRegistrySize:this.registry.filter(x=>x.label===1).length,negativeRegistrySize:this.registry.filter(x=>x.label===0).length,
      captured:captured.slice(-20),negativeCaptured:negativeCaptured.slice(-20),researchStatus:this.ai.status(),
      promotion:{state:'SHADOW',rankWeight:0,reason:'OOS 검증 전 자동 랭킹 반영 금지'},errors};
  }}
let singleton;
function defaultAutoSampleEngine(){if(!singleton)singleton=new AutoSampleEngine();return singleton}
module.exports={VERSION,CHECKPOINTS,detectCompleted,detectOnset,detectFailedIgnition,buildResearchItem,AutoSampleEngine,defaultAutoSampleEngine};

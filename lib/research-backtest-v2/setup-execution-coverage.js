'use strict';

const VERSION='SETUP_EXECUTION_COVERAGE_SPLIT_r0.1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function ct(r){return finite(Array.isArray(r)?r[6]:r?.closeTime)}
function op(r){return finite(Array.isArray(r)?r[1]:r?.open)}
function hi(r){return finite(Array.isArray(r)?r[2]:r?.high)}
function lo(r){return finite(Array.isArray(r)?r[3]:r?.low)}
function cl(r){return finite(Array.isArray(r)?r[4]:r?.close)}
function mean(a=[]){const x=a.map(Number).filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function quantile(a=[],p=.5){const x=a.map(Number).filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return null;const z=(x.length-1)*p,i=Math.floor(z),j=Math.ceil(z);return i===j?x[i]:x[i]+(x[j]-x[i])*(z-i)}
function dist(a=[]){const x=a.map(Number).filter(Number.isFinite);return{count:x.length,mean:mean(x),p25:quantile(x,.25),p50:quantile(x,.5),p75:quantile(x,.75),p90:quantile(x,.9)}}
function triggerState(type){return type==='BOTTOM_REVERSAL'?'BOTTOM_TRIGGER':'PREBREAKOUT_TRIGGER'}
function confirmState(type){return type==='BOTTOM_REVERSAL'?'BOTTOM_CONFIRMED':'BREAKOUT_CONFIRMED'}
function executionEvidence(features={}){
  const e=features?.evidence||{},x=e.execution;
  if(features?.pointInTimeContextMissing==='execution'||e.pointInTimeContextMissing==='execution')return{available:false,reason:'historical_execution_unavailable'};
  if(x?.available===true)return{available:true,reason:null};
  if(x?.available===false)return{available:false,reason:(x.reasons||[])[0]||'execution_unavailable'};
  return{available:false,reason:'execution_not_recorded'};
}
function alignIndex(rows=[],time){
  const t=finite(time);if(t==null)return-1;
  let exact=-1,last=-1;
  for(let i=0;i<rows.length;i++){const x=ct(rows[i]);if(x==null)continue;if(x===t){exact=i;break}if(x<t)last=i;if(x>t)break}
  return exact>=0?exact:last;
}
function forwardExcursion(rows=[],index,horizonBars=24){
  if(index<0||index>=rows.length)return null;
  const ref=cl(rows[index]);if(!(ref>0))return null;
  const future=rows.slice(index+1,index+1+Math.max(1,Number(horizonBars)||24));
  if(!future.length)return{referencePrice:ref,horizonBars:0,mfePct:null,maePct:null,endReturnPct:null};
  const maxHigh=Math.max(...future.map(hi).filter(Number.isFinite));
  const minLow=Math.min(...future.map(lo).filter(Number.isFinite));
  const endClose=cl(future.at(-1));
  return{
    referencePrice:ref,horizonBars:future.length,
    mfePct:Number.isFinite(maxHigh)?(maxHigh/ref-1)*100:null,
    maePct:Number.isFinite(minLow)?(minLow/ref-1)*100:null,
    endReturnPct:endClose!=null?(endClose/ref-1)*100:null
  };
}
function evaluateStructureTriggers({rows=[],transitions=[],horizonBars=24}={}){
  const tr=(transitions||[]).slice().sort((a,b)=>(finite(a?.decisionTime)||0)-(finite(b?.decisionTime)||0)),events=[];
  for(const x of tr){
    const type=String(x?.setupType||'');
    if(!['BOTTOM_REVERSAL','PREBREAKOUT'].includes(type)||x?.toState!==triggerState(type))continue;
    const idx=alignIndex(rows,x.candleCloseTime??x.decisionTime);
    const horizonEnd=Math.min(rows.length-1,idx+Math.max(1,Number(horizonBars)||24));
    const cutoffTime=horizonEnd>=0?ct(rows[horizonEnd]):null;
    let confirmed=null,failed=null;
    for(const y of tr){
      if(y===x||String(y?.setupType||'')!==type)continue;
      const yt=finite(y?.decisionTime??y?.candleCloseTime),xt=finite(x?.decisionTime??x?.candleCloseTime);
      if(yt==null||xt==null||yt<=xt)continue;
      if(cutoffTime!=null&&yt>cutoffTime)break;
      if(y.toState===confirmState(type)){confirmed=y;break}
      if(y.toState==='FAILED_SETUP'||y.toState==='EXPIRED'){failed=y;break}
    }
    const ex=executionEvidence(x.features||{});
    events.push({
      symbol:x.symbol||null,setupType:type,triggerTime:finite(x.decisionTime??x.candleCloseTime),triggerIndex:idx,
      executionAvailableAtTrigger:ex.available,executionCoverageReason:ex.reason,
      confirmedWithinHorizon:Boolean(confirmed),failedBeforeConfirm:Boolean(failed&&!confirmed),
      confirmationTime:finite(confirmed?.decisionTime??confirmed?.candleCloseTime),
      confirmationLatencyMinutes:confirmed?((finite(confirmed.decisionTime??confirmed.candleCloseTime)-finite(x.decisionTime??x.candleCloseTime))/60000):null,
      forward:forwardExcursion(rows,idx,horizonBars)
    });
  }
  return events;
}
function summarizeStructure(events=[]){
  const byType={};
  for(const type of ['BOTTOM_REVERSAL','PREBREAKOUT']){
    const a=(events||[]).filter(x=>x.setupType===type),covered=a.filter(x=>x.executionAvailableAtTrigger),confirmed=a.filter(x=>x.confirmedWithinHorizon),failed=a.filter(x=>x.failedBeforeConfirm);
    byType[type]={
      triggerCount:a.length,
      executionCoveredCount:covered.length,
      executionCoverageRate:a.length?covered.length/a.length:null,
      confirmConversionRate:a.length?confirmed.length/a.length:null,
      failBeforeConfirmRate:a.length?failed.length/a.length:null,
      confirmationLatencyMinutes:dist(a.map(x=>x.confirmationLatencyMinutes)),
      mfePct:dist(a.map(x=>x.forward?.mfePct)),
      maePct:dist(a.map(x=>x.forward?.maePct)),
      endReturnPct:dist(a.map(x=>x.forward?.endReturnPct))
    };
  }
  const all=events||[],covered=all.filter(x=>x.executionAvailableAtTrigger),confirmed=all.filter(x=>x.confirmedWithinHorizon);
  return{
    triggerCount:all.length,
    executionCoveredCount:covered.length,
    executionCoverageRate:all.length?covered.length/all.length:null,
    confirmConversionRate:all.length?confirmed.length/all.length:null,
    mfePct:dist(all.map(x=>x.forward?.mfePct)),
    maePct:dist(all.map(x=>x.forward?.maePct)),
    byType
  };
}
function buildCoverageReport({rows=[],transitions=[],horizonBars=24}={}){
  const events=evaluateStructureTriggers({rows,transitions,horizonBars});
  return{
    version:VERSION,
    policy:'structure/OI diagnostics are reported independently from execution-qualified confirmations; missing historical execution is never imputed',
    horizonBars:Math.max(1,Number(horizonBars)||24),
    summary:summarizeStructure(events),
    events
  };
}

module.exports={VERSION,executionEvidence,alignIndex,forwardExcursion,evaluateStructureTriggers,summarizeStructure,buildCoverageReport};

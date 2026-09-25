'use strict';

const crypto=require('crypto');
const Replay=require('./setup-event-replay.js');
const {buildPerformanceReport}=require('./performance-report.js');
const Coverage=require('./setup-execution-coverage.js');

const VERSION='SETUP_VALIDATION_HARNESS_r0.1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function fingerprintConfig(v){return crypto.createHash('sha256').update(JSON.stringify(v||{})).digest('hex')}
function q(values,p){const a=values.map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const z=(a.length-1)*p,i=Math.floor(z),j=Math.ceil(z);return i===j?a[i]:a[i]+(a[j]-a[i])*(z-i)}
function dist(values){const a=values.map(Number).filter(Number.isFinite);if(!a.length)return{count:0,mean:null,p10:null,p25:null,p50:null,p75:null,p90:null};return{count:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p10:q(a,.1),p25:q(a,.25),p50:q(a,.5),p75:q(a,.75),p90:q(a,.9)}}
function scaleConfig(config={},m=1){
  const mult=Number(m)||1,out={...config};
  for(const k of ['commissionRate','slippageRate'])if(Number.isFinite(Number(config[k])))out[k]=Number(config[k])*mult;
  return out;
}
function splitTransitions(transitions=[],split){
  const s=finite(split?.startTs),e=finite(split?.endTs);
  return(transitions||[]).filter(x=>{
    const t=finite(x?.candleCloseTime??x?.decisionTime);
    return t!=null&&(s==null||t>=s)&&(e==null||t<=e);
  });
}
function signalsWithRisk(transitions=[]){
  return Replay.signalsFromSetupTransitions(transitions).filter(x=>x.stopPrice!=null&&x.targetPrice!=null);
}
function setupLatency(transitions=[],setupType){
  const rows=(transitions||[]).filter(x=>x.setupType===setupType).slice().sort((a,b)=>(a.decisionTime||0)-(b.decisionTime||0));
  const watchState=setupType==='BOTTOM_REVERSAL'?'WATCH_BOTTOM':'WATCH_BREAKOUT';
  const confirmState=setupType==='BOTTOM_REVERSAL'?'BOTTOM_CONFIRMED':'BREAKOUT_CONFIRMED';
  const vals=[];let watchAt=null;
  for(const x of rows){
    if(x.toState===watchState)watchAt=finite(x.decisionTime);
    if(x.toState===confirmState&&watchAt!=null){
      const t=finite(x.decisionTime);if(t!=null&&t>=watchAt)vals.push((t-watchAt)/60000);
      watchAt=null;
    }
    if(x.toState==='FAILED_SETUP'||x.toState==='EXPIRED')watchAt=null;
  }
  return dist(vals);
}
function tradeClass(t){
  const r=String(t?.exitReason||'');
  if(r==='TAKE_PROFIT'||r==='TARGET_GAP')return'success';
  if(r==='STOP_LOSS'||r==='STOP_GAP')return'false_trigger';
  return'other';
}
function metricsFromReplay(replay,transitions){
  const trades=replay?.closedTrades||[],success=trades.filter(t=>tradeClass(t)==='success'),falseTriggers=trades.filter(t=>tradeClass(t)==='false_trigger');
  const byType={};
  for(const type of ['BOTTOM_REVERSAL','PREBREAKOUT']){
    const tt=trades.filter(t=>t.setupType===type),succ=tt.filter(t=>tradeClass(t)==='success'),fail=tt.filter(t=>tradeClass(t)==='false_trigger');
    byType[type]={
      tradeCount:tt.length,
      precision:tt.length?succ.length/tt.length:null,
      falseTriggerRate:tt.length?fail.length/tt.length:null,
      realizedR:dist(tt.map(t=>finite(t.realizedR))),
      latencyMinutes:setupLatency(transitions,type)
    };
  }
  return{
    tradeCount:trades.length,
    precision:trades.length?success.length/trades.length:null,
    falseTriggerRate:trades.length?falseTriggers.length/trades.length:null,
    realizedR:dist(trades.map(t=>finite(t.realizedR))),
    byType
  };
}
function runStress({rows,transitions,config={},multipliers=[1,1.5,2]}={}){
  const signals=signalsWithRisk(transitions),out={};
  for(const m of multipliers){
    const replay=signals.length?Replay.runEventReplay({rows,signals,config:scaleConfig(config,m)}):{closedTrades:[],summary:{closedTradeCount:0},events:[]};
    const trades=(replay.closedTrades||[]).map(t=>({
      status:'filled',entryIndex:t.entryIndex,exitIndex:t.exitIndex,entryTime:t.entryTime,exitTime:t.exitTime,
      entryPrice:t.entryPrice,exitPrice:t.exitPrice,netReturnPct:finite(t.returnFraction)==null?null:finite(t.returnFraction)*100,holdingBars:t.exitIndex-t.entryIndex+1,
      costs:{roundTripPct:null},exitReason:t.exitReason,netPnl:t.netPnl
    }));
    out[String(m)+'x']={multiplier:m,replay,performance:buildPerformanceReport(trades),setupMetrics:metricsFromReplay(replay,transitions)};
  }
  return out;
}
function assertLockedSplit(splits={}){
  for(const k of ['development','walkForward','lockedOos'])if(!splits?.[k])throw new Error(k+' split required');
  const d=splits.development,w=splits.walkForward,o=splits.lockedOos;
  const vals=[d.startTs,d.endTs,w.startTs,w.endTs,o.startTs,o.endTs].map(finite);
  if(vals.some(v=>v==null))throw new Error('all split timestamps required');
  if(!(d.startTs<=d.endTs&&d.endTs<w.startTs&&w.startTs<=w.endTs&&w.endTs<o.startTs&&o.startTs<=o.endTs))throw new Error('splits must be ordered and non-overlapping');
  return true;
}
function rollingWalkForward({rows=[],transitions=[],window={},config={},costMultipliers=[1,1.5,2],foldMs=30*86400000}={}){
  const start=finite(window?.startTs),end=finite(window?.endTs),step=Math.max(60000,finite(foldMs)??30*86400000);
  if(start==null||end==null||end<start)return{folds:[],summary:{foldCount:0}};
  const folds=[];let n=0;
  for(let s=start;s<=end;s+=step){
    const e=Math.min(end,s+step-1),tr=splitTransitions(transitions,{startTs:s,endTs:e}),stress=runStress({rows,transitions:tr,config,multipliers:costMultipliers});
    folds.push({fold:++n,startTs:s,endTs:e,transitionCount:tr.length,confirmedCount:tr.filter(x=>x.toState==='BOTTOM_CONFIRMED'||x.toState==='BREAKOUT_CONFIRMED').length,stress});
  }
  const base=folds.map(x=>x.stress['1x']?.setupMetrics).filter(Boolean),vals=k=>base.map(x=>finite(x[k])).filter(Number.isFinite);
  return{
    folds,
    summary:{
      foldCount:folds.length,
      activeFoldCount:base.filter(x=>(x.tradeCount||0)>0).length,
      tradeCount:base.reduce((s,x)=>s+(x.tradeCount||0),0),
      precision:dist(vals('precision')),
      falseTriggerRate:dist(vals('falseTriggerRate')),
      realizedRMedian:dist(base.map(x=>finite(x.realizedR?.p50)))
    }
  };
}
function validateSetupResearch({rows=[],transitions=[],splits,config={},costMultipliers=[1,1.5,2],lockedConfigFingerprint=null,structureHorizonBars=24}={}){
  assertLockedSplit(splits);
  const names=['development','walkForward','lockedOos'],results={};
  const configFingerprint=lockedConfigFingerprint||fingerprintConfig({config,costMultipliers});
  for(const name of names){
    const tr=splitTransitions(transitions,splits[name]);
    results[name]={
      window:splits[name],
      transitionCount:tr.length,
      confirmedCount:tr.filter(x=>x.toState==='BOTTOM_CONFIRMED'||x.toState==='BREAKOUT_CONFIRMED').length,
      structureCoverage:Coverage.buildCoverageReport({rows,transitions:tr,horizonBars:structureHorizonBars}),
      stress:runStress({rows,transitions:tr,config,multipliers:costMultipliers})
    };
  }
  return{
    version:VERSION,
    configFingerprint,
    validationLanes:{structure:'trigger-level forward excursion without imputed execution',execution:'confirmed-state next-open replay only when execution gate was passed'},
    walkForwardFolds:rollingWalkForward({rows,transitions,window:splits.walkForward,config,costMultipliers,foldMs:splits.walkForward.foldMs}),
    splits:results,
    lockedOosPolicy:{
      mutable:false,
      configFingerprint,
      note:'locked OOS is evaluation-only; parameter selection must be completed before this window'
    },
    summary:{
      developmentTrades:results.development.stress['1x']?.setupMetrics?.tradeCount??0,
      walkForwardTrades:results.walkForward.stress['1x']?.setupMetrics?.tradeCount??0,
      lockedOosTrades:results.lockedOos.stress['1x']?.setupMetrics?.tradeCount??0
    }
  };
}

module.exports={VERSION,fingerprintConfig,dist,scaleConfig,splitTransitions,signalsWithRisk,setupLatency,metricsFromReplay,runStress,rollingWalkForward,assertLockedSplit,validateSetupResearch};

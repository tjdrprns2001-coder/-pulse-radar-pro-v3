'use strict';
// Qlib/vectorbt-inspired research protocol, not a direct dependency or a trading engine.
// All profile selection uses train/validation ONLY. One selected configuration may unlock test.
const {evaluateBowlWalkForward}=require('./bowl-walk-forward.js');
const {toClosedCandles}=require('../coin-scan/pattern-evidence.js');
const {summarizeWalkForwardCohort}=require('./bowl-portfolio-summary.js');
const DAY=86400000;
const DEFAULT_GRID=Object.freeze([
 {id:'V12-B12-D10',minVolumeRatio:1.2,maxBaseWidth:.12,minDecline:.10},
 {id:'V15-B12-D10',minVolumeRatio:1.5,maxBaseWidth:.12,minDecline:.10},
 {id:'V12-B22-D10',minVolumeRatio:1.2,maxBaseWidth:.22,minDecline:.10},
 {id:'V15-B22-D10',minVolumeRatio:1.5,maxBaseWidth:.22,minDecline:.10},
 {id:'V12-B12-D18',minVolumeRatio:1.2,maxBaseWidth:.12,minDecline:.18},
 {id:'V15-B12-D18',minVolumeRatio:1.5,maxBaseWidth:.12,minDecline:.18},
 {id:'V12-B22-D18',minVolumeRatio:1.2,maxBaseWidth:.22,minDecline:.18},
 {id:'V15-B22-D18',minVolumeRatio:1.5,maxBaseWidth:.22,minDecline:.18}
]);
const ALLOWED=new Set(['minVolumeRatio','maxBaseWidth','minDecline','minSymmetry','maxSymmetry','breakoutBuffer','minBaseBars','minDeclineBars']);
const validSymbol=x=>/^[A-Z0-9]{2,25}USDT$/.test(String(x||'').toUpperCase());
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function wilson(success,n,z=1.96){
 if(!(n>0)||success<0||success>n)return {lower:null,upper:null};
 const p=success/n,d=1+z*z/n,mid=(p+z*z/(2*n))/d,half=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;
 return{lower:Math.max(0,mid-half),upper:Math.min(1,mid+half)};
}
function splitTotals(reports,split){
 const count=(key)=>reports.reduce((n,r)=>n+(r.bySplit?.[split]?.[key]?.count||0),0);
 const hits=(key)=>reports.reduce((n,r)=>n+(r.bySplit?.[split]?.[key]?.hit72h10Count||0),0);
 const events=reports.flatMap(r=>(r.events?.[split]||[]).map(e=>({symbol:r.symbol,day:new Date(e.at).toISOString().slice(0,10)})));
 const dates=new Set(events.map(x=>x.day));
 const signals=count('signals'),controls=count('controls'),wins=hits('signals'),baseline=hits('controls');
 return{signals,wins,hitRate:signals?wins/signals:null,
   controls,controlWins:baseline,controlHitRate:controls?baseline/controls:null,
   uniqueEventDays:dates.size,unlistedEvents:Math.max(0,signals-events.length),
   confidence:wilson(wins,signals),controlConfidence:wilson(baseline,controls)};
}
function makeCutoffs(datasets,asOf){
 const starts=datasets.map(x=>toClosedCandles(x.rows,asOf)[0]?.closeTime);
 if(starts.some(x=>!finite(x)))return null;
 const start=Math.max(...starts),span=asOf-start;
 if(!(span>120*DAY))return null;
 const trainEnd=Math.floor((start+span*.6)/DAY)*DAY,validationEnd=Math.floor((start+span*.8)/DAY)*DAY;
 return trainEnd>start&&validationEnd>trainEnd&&asOf-validationEnd>=8*DAY?{trainEnd,validationEnd}:null;
}
function validateGrid(grid){
 if(!Array.isArray(grid)||!grid.length||grid.length>12)return false;
 if(new Set(grid.map(x=>x.id)).size!==grid.length)return false;
 return grid.every(g=>g&&/^[A-Za-z0-9-]{2,48}$/.test(g.id)&&
   Object.keys(g).every(k=>k==='id'||ALLOWED.has(k))&&
   (Object.entries(g).filter(([k])=>k!=='id').every(([k,v])=>finite(v)&&v>0&&v<=(k==='maxBaseWidth'?1:k==='minDecline'?1:k==='minVolumeRatio'?10:k==='maxSymmetry'?10:k==='minSymmetry'?10:k==='breakoutBuffer'?1:1000)))&&
   (g.minBaseBars==null||Number.isInteger(g.minBaseBars))&&(g.minDeclineBars==null||Number.isInteger(g.minDeclineBars)));
}
function runBowlParameterGrid({
 datasets=[],asOf,timeframe='1d',grid=DEFAULT_GRID,calendarSplits=null,
 thresholds={},evaluate=evaluateBowlWalkForward
}={}){
 const info={version:'BOWL_PARAMETER_GRID_v1',shadowOnly:true,
   method:'chronological common UTC cutoff; purged 7 days; train+validation selection; winner-only test',
   optimizer:'pre-registered grid, confidence-conservative validation score; not ML training',
   testLeakagePolicy:'test outcomes NEVER computed for candidate comparison'};
 const t=Number(asOf),tf=String(timeframe).toLowerCase();
 if(!Number.isFinite(t)||t<=0||!['1d','4h'].includes(tf)||!validateGrid(grid)||
   !Array.isArray(datasets)||datasets.length<1||datasets.length>30||
   datasets.some(d=>!validSymbol(d?.symbol)||!Array.isArray(d?.rows)||d.source!=='BINANCE_FUTURES')||
   new Set(datasets.map(x=>String(x.symbol).toUpperCase())).size!==datasets.length)
   return{...info,status:'INVALID_INPUT',reason:'Time, Binance futures OHLCV, 1d/4h, <=30 distinct symbols, <=12 safe presets required'};
 const bounds=calendarSplits||makeCutoffs(datasets,t);
 if(!bounds||!finite(bounds.trainEnd)||!finite(bounds.validationEnd)||
   !(0<bounds.trainEnd&&bounds.trainEnd<bounds.validationEnd&&bounds.validationEnd<t))
   return{...info,status:'INSUFFICIENT_CALENDAR_HISTORY'};
 const lowerLimits={trainSignals:Math.max(5,Math.floor(Number(thresholds.trainSignals)||8)),
   validationSignals:Math.max(5,Math.floor(Number(thresholds.validationSignals)||8)),
   validationDates:Math.max(4,Math.floor(Number(thresholds.validationDates)||5)),
   baselineControls:Math.max(10,Math.floor(Number(thresholds.baselineControls)||20))};
 const results=[];
 for(const profile of grid){
   const options={...Object.fromEntries(Object.entries(profile).filter(([k])=>k!=='id')),
      calendarSplits:bounds,evaluationSplits:['train','validation']};
   const reports=datasets.map(d=>evaluate({symbol:d.symbol,rows:d.rows,asOf:t,timeframe:tf,
      source:'BINANCE_FUTURES',options}));
   const train=splitTotals(reports,'train'),validation=splitTotals(reports,'validation');
   const usable=reports.every(x=>x.status==='READY')&&
      train.signals>=lowerLimits.trainSignals&&validation.signals>=lowerLimits.validationSignals&&
      validation.uniqueEventDays>=lowerLimits.validationDates&&validation.controls>=lowerLimits.baselineControls&&
      validation.unlistedEvents===0;
   const score=usable?validation.confidence.lower-validation.controlConfidence.upper:null;
   results.push({id:profile.id,parameters:Object.fromEntries(Object.entries(profile).filter(([k])=>k!=='id')),
     eligible:usable,score,train,validation,sourceCoverage:reports.filter(r=>r.status==='READY').length,
     symbols:reports.length});
 }
 const ordered=results.filter(x=>x.eligible).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const winner=ordered[0]||null;
 const shell={...info,status:winner?'SELECTED':'INSUFFICIENT_VALIDATION',
   asOf:t,timeframe:tf,calendarSplits:bounds,minimums:lowerLimits,
   testedUniverse:datasets.map(d=>d.symbol),presetsTested:grid.length,
   validationLeaderboard:results.slice().sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity)||a.id.localeCompare(b.id)),
   selectedProfile:winner?{id:winner.id,parameters:winner.parameters,score:winner.score}:null};
 if(!winner)return{...shell,holdout:{status:'LOCKED',reason:'No configuration met sample-size/independent-day requirements'}};
 const options={...winner.parameters,calendarSplits:bounds,evaluationSplits:['train','validation','test']};
 const holdoutReports=datasets.map(d=>evaluate({symbol:d.symbol,rows:d.rows,asOf:t,timeframe:tf,
    source:'BINANCE_FUTURES',options}));
 const test=splitTotals(holdoutReports,'test');
 return{...shell,holdout:{status:holdoutReports.every(x=>x.status==='READY')&&test.signals>0?'REPORTED':'UNAVAILABLE',
   profileId:winner.id,test,cohort:summarizeWalkForwardCohort(holdoutReports).bySplit.test,
   caution:'Unseen during configuration selection; still a small, correlated observational sample. Never auto-promote'}};
}
module.exports={DEFAULT_GRID,wilson,splitTotals,makeCutoffs,validateGrid,runBowlParameterGrid};

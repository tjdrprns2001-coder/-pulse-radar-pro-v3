'use strict';
const {evaluatePreset}=require('./dante-presets.js');
const {simulateSignals}=require('./execution-simulator.js');
const {buildPerformanceReport}=require('./performance-report.js');

function generateSignals({rows,presetId,params={},minBars=230,startIndex=0,endIndex=null}={}){
  if(!Array.isArray(rows))throw new Error('rows required');
  const end=endIndex==null?rows.length-2:Math.min(rows.length-2,Math.trunc(endIndex)),start=Math.max(Math.trunc(startIndex),Math.max(2,minBars-1)),out=[];
  for(let i=start;i<=end;i++){
    const result=evaluatePreset(presetId,rows.slice(0,i+1),params);
    if(result.pass)out.push({index:i,presetId,engineId:result.id,score:result.score,evidence:result.evidence,params:result.params});
  }
  return out;
}
function scaleCosts(base={},m=1){
  const mult=Number(m)||1,out={...base};
  for(const k of ['feeBps','spreadBps','slippageBps'])if(Number.isFinite(Number(base[k])))out[k]=Number(base[k])*mult;
  return out;
}
function runPresetBacktest({rows,presetId,params={},marketType='spot',costAssumptions={},exitPolicy={},startIndex=0,endIndex=null,costMultipliers=[1,1.5,2]}={}){
  const signals=generateSignals({rows,presetId,params,startIndex,endIndex});
  const stress={};
  for(const mult of costMultipliers){
    const trades=simulateSignals({rows,signals,marketType,costAssumptions:scaleCosts(costAssumptions,mult),exitPolicy});
    stress[String(mult)+'x']={multiplier:mult,trades,report:buildPerformanceReport(trades)};
  }
  return{presetId,params,signalCount:signals.length,signals,stress,executionPolicy:'NEXT_ELIGIBLE_BAR',lookaheadSafe:true};
}
function cartesian(grid={}){
  const keys=Object.keys(grid),out=[];function walk(i,x){if(i===keys.length){out.push({...x});return}const k=keys[i],vals=Array.isArray(grid[k])?grid[k]:[grid[k]];for(const v of vals){x[k]=v;walk(i+1,x)}}walk(0,{});return out;
}
function objective(report,metric='profitFactor'){
  const v=Number(report?.[metric]);return Number.isFinite(v)?v:-Infinity;
}
function walkForward({rows,presetId,paramGrid={},marketType='spot',costAssumptions={},exitPolicy={},trainBars=365,validationBars=120,stepBars=120,objectiveMetric='profitFactor'}={}){
  if(!Array.isArray(rows)||rows.length<trainBars+validationBars) return{presetId,folds:[],summary:{foldCount:0,reason:'insufficient-history'}};
  const paramsList=cartesian(paramGrid);if(!paramsList.length)paramsList.push({});
  const folds=[];let fold=0;
  for(let trainStart=0;trainStart+trainBars+validationBars<=rows.length;trainStart+=stepBars){
    const trainEnd=trainStart+trainBars-1,valStart=trainEnd+1,valEnd=Math.min(rows.length-1,valStart+validationBars-1);
    const ranked=paramsList.map(params=>{
      const bt=runPresetBacktest({rows,presetId,params,marketType,costAssumptions,exitPolicy,startIndex:trainStart,endIndex:trainEnd-1,costMultipliers:[1]});
      return{params,score:objective(bt.stress['1x'].report,objectiveMetric),report:bt.stress['1x'].report};
    }).sort((a,b)=>b.score-a.score);
    const selected=ranked[0];
    const validation=runPresetBacktest({rows,presetId,params:selected.params,marketType,costAssumptions,exitPolicy,startIndex:valStart,endIndex:valEnd-1,costMultipliers:[1,1.5,2]});
    folds.push({fold:++fold,train:{startIndex:trainStart,endIndex:trainEnd},validation:{startIndex:valStart,endIndex:valEnd},selectedParams:selected.params,trainObjective:selected.score,trainReport:selected.report,validationReport:validation.stress['1x'].report,costStress:Object.fromEntries(Object.entries(validation.stress).map(([k,v])=>[k,v.report])),validationTrades:validation.stress['1x'].trades});
  }
  const valid=folds.map(x=>x.validationReport).filter(x=>x.sampleCount>0);
  const avg=k=>valid.length?valid.map(x=>Number(x[k])).filter(Number.isFinite).reduce((a,b,_,arr)=>a+b/arr.length,0):null;
  return{presetId,objectiveMetric,trainBars,validationBars,stepBars,folds,summary:{foldCount:folds.length,evaluatedFolds:valid.length,meanProfitFactor:avg('profitFactor'),meanNetReturnPct:avg('meanNetReturnPct'),meanMaxDrawdownPct:avg('maxDrawdownPct'),lookaheadSafe:true}};
}
module.exports={generateSignals,scaleCosts,runPresetBacktest,cartesian,walkForward};

'use strict';

const SetupPit=require('./setup-point-in-time-replay.js');
const SetupValidation=require('./setup-validation-harness.js');
const {classifyRegime}=require('./baselines.js');

const VERSION='SETUP_BATCH_REGIME_VALIDATION_r0.1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function mean(a=[]){const x=a.map(Number).filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function q(a=[],p=.5){const x=a.map(Number).filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return null;const z=(x.length-1)*p,i=Math.floor(z),j=Math.ceil(z);return i===j?x[i]:x[i]+(x[j]-x[i])*(z-i)}
function tradeClass(t){
  const r=String(t?.exitReason||'');
  if(r==='TAKE_PROFIT'||r==='TARGET_GAP')return'success';
  if(r==='STOP_LOSS'||r==='STOP_GAP')return'false_trigger';
  return'other';
}
function emptyCell(){return{tradeCount:0,successCount:0,falseTriggerCount:0,precision:null,falseTriggerRate:null,meanRealizedR:null,medianRealizedR:null,meanReturnPct:null}}
function summarizeTrades(trades=[]){
  const t=(trades||[]),success=t.filter(x=>tradeClass(x)==='success'),fail=t.filter(x=>tradeClass(x)==='false_trigger');
  return{
    tradeCount:t.length,successCount:success.length,falseTriggerCount:fail.length,
    precision:t.length?success.length/t.length:null,falseTriggerRate:t.length?fail.length/t.length:null,
    meanRealizedR:mean(t.map(x=>finite(x.realizedR))),medianRealizedR:q(t.map(x=>finite(x.realizedR)),.5),
    meanReturnPct:mean(t.map(x=>finite(x.returnFraction)).filter(Number.isFinite).map(x=>x*100))
  };
}
function aggregateRegimes(cases=[],splitName='lockedOos',costKey='1x'){
  const buckets={};
  for(const c of cases){
    const rows=c.rows||[],replay=c.validation?.splits?.[splitName]?.stress?.[costKey]?.replay,trades=replay?.closedTrades||[];
    for(const t of trades){
      const regime=classifyRegime(rows,t.entryIndex),type=String(t.setupType||'UNKNOWN');
      for(const key of [
        'ALL|'+regime,
        type+'|'+regime,
        'ALL|ALL',
        type+'|ALL'
      ]){
        if(!buckets[key])buckets[key]=[];
        buckets[key].push(t);
      }
    }
  }
  const out={};
  for(const [key,trades] of Object.entries(buckets)){
    const [setupType,regime]=key.split('|');
    out[key]={setupType,regime,...summarizeTrades(trades)};
  }
  if(!out['ALL|ALL'])out['ALL|ALL']={setupType:'ALL',regime:'ALL',...emptyCell()};
  return out;
}
function runCase(input={}){
  const symbol=cleanSymbol(input.symbol);if(!symbol)throw new Error('case symbol required');
  const frames=input.frames||{},tf=String(input.signalTimeframe||'15m').toLowerCase(),rows=Array.isArray(input.rows)?input.rows:(Array.isArray(frames[tf])?frames[tf]:[]);
  if(!rows.length)throw new Error(symbol+': signal timeframe rows required');
  let transitions=Array.isArray(input.transitions)?input.transitions:null,pit=null;
  if(!transitions){
    pit=SetupPit.replayPointInTime({
      symbol,frames,signalTimeframe:tf,startTs:input.startTs,endTs:input.endTs,
      contextTimeline:Array.isArray(input.contextTimeline)?input.contextTimeline:[],
      defaultDataState:String(input.defaultDataState||'live'),includeSnapshots:false
    });
    transitions=pit.transitions;
  }
  const validation=SetupValidation.validateSetupResearch({
    rows,transitions,splits:input.splits,config:input.executionConfig||{},
    costMultipliers:Array.isArray(input.costMultipliers)?input.costMultipliers:[1,1.5,2],
    lockedConfigFingerprint:input.lockedConfigFingerprint||null
  });
  return{
    symbol,signalTimeframe:tf,rows,transitionCount:transitions.length,
    confirmedCount:transitions.filter(x=>x.toState==='BOTTOM_CONFIRMED'||x.toState==='BREAKOUT_CONFIRMED').length,
    pitSummary:pit?{version:pit.version,decisionCount:pit.decisionCount,transitionCount:pit.transitions.length,confirmedCount:pit.confirmedTransitions.length}:null,
    validation
  };
}
function runBatchValidation({cases=[],costKeys=['1x','1.5x','2x']}={}){
  const results=[],errors=[];
  for(const item of Array.isArray(cases)?cases:[]){
    try{results.push(runCase(item))}
    catch(e){errors.push({symbol:cleanSymbol(item?.symbol),error:String(e?.message||e)})}
  }
  const regimeAggregates={};
  for(const split of ['development','walkForward','lockedOos']){
    regimeAggregates[split]={};
    for(const costKey of costKeys)regimeAggregates[split][costKey]=aggregateRegimes(results,split,costKey);
  }
  const symbolSummary=results.map(x=>({
    symbol:x.symbol,transitionCount:x.transitionCount,confirmedCount:x.confirmedCount,
    developmentTrades:x.validation.summary.developmentTrades,
    walkForwardTrades:x.validation.summary.walkForwardTrades,
    lockedOosTrades:x.validation.summary.lockedOosTrades,
    lockedOosPrecision:x.validation.splits.lockedOos.stress['1x']?.setupMetrics?.precision??null,
    lockedOosFalseTriggerRate:x.validation.splits.lockedOos.stress['1x']?.setupMetrics?.falseTriggerRate??null,
    lockedOosMedianR:x.validation.splits.lockedOos.stress['1x']?.setupMetrics?.realizedR?.p50??null
  }));
  return{
    version:VERSION,
    caseCount:results.length,errorCount:errors.length,results,errors,symbolSummary,regimeAggregates,
    aggregateLockedOos:regimeAggregates.lockedOos?.['1x']?.['ALL|ALL']||null
  };
}
module.exports={VERSION,tradeClass,summarizeTrades,aggregateRegimes,runCase,runBatchValidation};

'use strict';

const crypto=require('crypto');
const SetupBatch=require('./setup-batch-validation.js');
const Report=require('./setup-validation-report.js');

const VERSION='SETUP_VALIDATION_CAMPAIGN_r0.1';
const DEFAULT_SYMBOLS=Object.freeze([
  'BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT',
  'DOGEUSDT','LINKUSDT','SUIUSDT','ONDOUSDT',
  'FETUSDT','PEPEUSDT','BONKUSDT','WIFUSDT'
]);

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function uniq(a=[]){return [...new Set((a||[]).map(cleanSymbol).filter(Boolean))]}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}
function firstUsableContext(timeline=[]){
  for(const x of timeline||[]){
    const spot=Array.isArray(x?.spot15m)?x.spot15m:[];
    if(spot.length>=21)return finite(x.availableAt);
  }
  return null;
}
function firstFullDerivativesContext(timeline=[]){
  for(const x of timeline||[]){
    const p=x?.derivativesProfile||{},h=x?.historicalCoverage||{};
    const oi=finite(p.oi4hPct),t15=Array.isArray(p.taker15m)?p.taker15m.length:0,t1=Array.isArray(p.taker1h)?p.taker1h.length:0;
    if(h.oi&&h.taker1h&&h.taker15m&&h.funding&&oi!=null&&t15>=4&&t1>=2)return finite(x.availableAt);
  }
  return null;
}
function splitWindow(startTs,endTs,{development=.4,walkForward=.3,lockedOos=.3,walkForwardFoldMs=2*86400000}={}){
  const s=finite(startTs),e=finite(endTs);if(s==null||e==null||e<=s)throw new Error('invalid campaign window');
  const total=e-s+1,d=Math.max(1,development),w=Math.max(1,walkForward),o=Math.max(1,lockedOos),sum=d+w+o;
  const devMs=Math.floor(total*d/sum),wfMs=Math.floor(total*w/sum);
  const devEnd=s+devMs-1,wfStart=devEnd+1,wfEnd=wfStart+wfMs-1,oosStart=wfEnd+1;
  if(!(s<=devEnd&&devEnd<wfStart&&wfStart<=wfEnd&&wfEnd<oosStart&&oosStart<=e))throw new Error('campaign split too short');
  return{
    development:{startTs:s,endTs:devEnd},
    walkForward:{startTs:wfStart,endTs:wfEnd,foldMs:Math.max(3600000,Number(walkForwardFoldMs)||2*86400000)},
    lockedOos:{startTs:oosStart,endTs:e}
  };
}
function buildLock({symbols,startTime,endTime,splits,signalTimeframe,executionConfig,costMultipliers,intervals}={}){
  const payload={
    version:VERSION,
    symbols:uniq(symbols).sort(),startTime,endTime,splits,
    signalTimeframe:String(signalTimeframe||'15m'),
    executionConfig:executionConfig||{},costMultipliers:costMultipliers||[1,1.5,2],
    intervals:intervals||['1w','3d','1d','12h','4h','1h','15m','5m']
  };
  return{lockId:'setup-campaign-'+hash(payload).slice(0,24),fingerprint:hash(payload),payload};
}
function contextCoverageSummary(context={}){
  const timeline=Array.isArray(context?.timeline)?context.timeline:[],first=firstUsableContext(timeline),full=firstFullDerivativesContext(timeline);
  return{
    firstUsableAt:first,
    firstFullDerivativesAt:full,
    lastAvailableAt:finite(timeline.at(-1)?.availableAt),
    timelineCount:timeline.length,
    coverage:context?.coverage||null,
    pages:context?.pages||null
  };
}
async function prepareCase(provider,symbol,{requestedStart,endTime,signalTimeframe,intervals,warmupBars,maxBarsPerFrame,contextStepMs,contextWarmupHours}={}){
  const hist=await provider.getHistoricalFramesRange(symbol,{startTime:requestedStart,endTime,intervals,warmupBars,maxBarsPerFrame});
  const context=await provider.buildHistoricalContextTimeline(symbol,{startTime:requestedStart,endTime,stepMs:contextStepMs,warmupHours:contextWarmupHours});
  return{
    symbol,
    hist,
    context,
    coverage:contextCoverageSummary(context),
    rows:Array.isArray(hist.frames?.[signalTimeframe])?hist.frames[signalTimeframe]:[]
  };
}
async function runCampaign({
  provider,symbols=DEFAULT_SYMBOLS,requestedStart,endTime,
  signalTimeframe='15m',intervals=['1w','3d','1d','12h','4h','1h','15m','5m'],
  warmupBars=240,maxBarsPerFrame=250000,contextStepMs=900000,contextWarmupHours=30,
  executionConfig={},costMultipliers=[1,1.5,2],splitRatios=null,minimumUsableSymbols=4
}={}){
  if(!provider||typeof provider.getHistoricalFramesRange!=='function'||typeof provider.buildHistoricalContextTimeline!=='function')throw new Error('historical research provider required');
  const syms=uniq(symbols),start=finite(requestedStart),end=finite(endTime);
  if(!syms.length||start==null||end==null||end<=start)throw new Error('symbols/requestedStart/endTime required');

  const prepared=[],errors=[];
  for(const symbol of syms){
    try{prepared.push(await prepareCase(provider,symbol,{requestedStart:start,endTime:end,signalTimeframe,intervals,warmupBars,maxBarsPerFrame,contextStepMs,contextWarmupHours}))}
    catch(e){errors.push({symbol,error:String(e?.message||e)})}
  }
  const usable=prepared.filter(x=>x.coverage.firstUsableAt!=null&&x.rows.length>0);
  if(usable.length<Math.max(1,Number(minimumUsableSymbols)||4)){
    const err=new Error('insufficient symbols with causal structural/spot historical coverage');
    err.diagnostics={
      requestedSymbols:syms,
      minimumUsableSymbols:Math.max(1,Number(minimumUsableSymbols)||4),
      usableSymbols:usable.map(x=>x.symbol),
      preparationErrors:errors,
      coverage:prepared.map(x=>({symbol:x.symbol,...x.coverage,signalRows:x.rows.length,frameMeta:x.hist?.meta||null}))
    };
    throw err;
  }
  const commonStart=Math.max(start,...usable.map(x=>x.coverage.firstUsableAt));
  if(commonStart>=end)throw new Error('no common historical derivatives window');
  const splits=splitWindow(commonStart,end,splitRatios||{});
  const lock=buildLock({symbols:usable.map(x=>x.symbol),startTime:commonStart,endTime:end,splits,signalTimeframe,executionConfig,costMultipliers,intervals});

  const cases=usable.map(x=>({
    symbol:x.symbol,frames:x.hist.frames,rows:x.rows,signalTimeframe,
    startTs:commonStart,endTs:end,
    contextTimeline:x.context.timeline,
    contextCoverage:x.context.coverage,
    splits,executionConfig,costMultipliers,
    lockedConfigFingerprint:lock.fingerprint
  }));
  const batch=SetupBatch.runBatchValidation({cases,costKeys:costMultipliers.map(x=>String(x)+'x')});
  batch.errors=[...(batch.errors||[]),...errors];
  batch.errorCount=(batch.errors||[]).length;
  const report=Report.buildReport(batch,{generatedAt:Date.now(),sourceReportId:lock.lockId});
  return{
    version:VERSION,
    lock,
    requested:{startTime:start,endTime:end,symbols:syms},
    effective:{startTime:commonStart,endTime:end,symbols:usable.map(x=>x.symbol),splits},
    coverage:prepared.map(x=>({symbol:x.symbol,...x.coverage,frameMeta:x.hist.meta})),
    derivativesCoverage:{fullSymbols:usable.filter(x=>x.coverage.firstFullDerivativesAt!=null).map(x=>x.symbol),partialOrMissingSymbols:usable.filter(x=>x.coverage.firstFullDerivativesAt==null).map(x=>x.symbol)},
    preparationErrors:errors,
    batch,
    report
  };
}

module.exports={VERSION,DEFAULT_SYMBOLS,firstUsableContext,firstFullDerivativesContext,splitWindow,buildLock,contextCoverageSummary,prepareCase,runCampaign};

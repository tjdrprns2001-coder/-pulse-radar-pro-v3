'use strict';
const Rice=require('../../ui/dante/rice-bowl-engine.js');
const D256=require('../../ui/dante/dante-256-engine.js');
const C=require('../../ui/dante/dante-contract.js');
const {splitForTimestamp}=require('../research-backtest-v2/contracts.js');

const DEFAULT_HORIZONS=Object.freeze([5,10,20,40]);
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function pct(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?((a/b)-1)*100:null}
function median(a){const x=a.filter(Number.isFinite).slice().sort((p,q)=>p-q);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function mean(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function std(a){const x=a.filter(Number.isFinite);if(x.length<2)return null;const m=mean(x);return Math.sqrt(x.reduce((s,v)=>s+(v-m)*(v-m),0)/(x.length-1))}
function ema(values,p){const out=[];if(!values.length)return out;const a=2/(p+1);let x=Number(values[0]);out[0]=x;for(let i=1;i<values.length;i++){x=Number(values[i])*a+x*(1-a);out[i]=x}return out}
function classifyRegime(candles,i){
  const closes=candles.slice(0,i+1).map(x=>Number(x.close)),e20=ema(closes,20),e60=ema(closes,60),c=closes[i];
  if(!Number.isFinite(e60[i]))return'UNKNOWN';
  if(c>e20[i]&&e20[i]>e60[i])return'BULL';
  if(c<e20[i]&&e20[i]<e60[i])return'BEAR';
  return'MIXED';
}
function eventOutcome(candles,signalIndex,{horizons=DEFAULT_HORIZONS,frictionPct=.2}={}){
  const entryIndex=signalIndex+1;if(entryIndex>=candles.length)return null;
  const entry=finite(candles[entryIndex].open);if(entry==null||entry<=0)return null;
  const out={entryIndex,entryTime:candles[entryIndex].openTime??candles[entryIndex].time,entryPrice:entry,horizons:{}};
  for(const h of horizons){
    const end=entryIndex+h-1;if(end>=candles.length){out.horizons[String(h)]={status:'PENDING'};continue}
    const segment=candles.slice(entryIndex,end+1),exit=finite(candles[end].close),high=Math.max(...segment.map(x=>Number(x.high))),low=Math.min(...segment.map(x=>Number(x.low)));
    out.horizons[String(h)]={
      status:'EVALUATED',exitIndex:end,exitTime:candles[end].closeTime??candles[end].time,
      grossReturnPct:pct(exit,entry),netReturnPct:pct(exit,entry)-Number(frictionPct||0),
      mfePct:pct(high,entry),maePct:pct(low,entry)
    };
  }
  return out;
}
function pushIfNew(events,keySet,e){if(keySet.has(e.eventKey))return;keySet.add(e.eventKey);events.push(e)}
function eventFromSignal({symbol,strategy,signalIndex,state,sequenceId=null,paramsHash=null,candles,frictionPct,horizons}){
  const signalTime=Number(candles[signalIndex].closeTime??candles[signalIndex].time),outcome=eventOutcome(candles,signalIndex,{horizons,frictionPct});if(!outcome)return null;
  return{eventKey:symbol+':'+strategy+':'+signalTime,symbol,strategy,signalIndex,signalTime,state,sequenceId,regime:classifyRegime(candles,signalIndex),datasetSplit:splitForTimestamp(signalTime),paramsHash,outcome};
}
function runCausalWalkForward({symbol='UNKNOWN',candles=[],analysisStartTs=null,analysisEndTs=null,riceParams={},d256Params={},frictionPct=.2,horizons=DEFAULT_HORIZONS,strategies=['RICE_BOWL','DANTE_256']}={}){
  if(!Array.isArray(candles)||!candles.length)throw new Error('candles required');
  const finalAsOf=Number(candles.at(-1).closeTime??candles.at(-1).time);C.assertClosedCandles(candles,finalAsOf);
  const start=finite(analysisStartTs)??Number(candles[0].openTime??candles[0].time),end=finite(analysisEndTs)??finalAsOf,events=[],keys=new Set();
  let riceResult=null,d256Candidates=[];
  if(strategies.includes('RICE_BOWL')){
    riceResult=Rice.analyze({symbol,candles,analysisAsOf:finalAsOf,params:riceParams});
    for(const tr of riceResult.transitionPath||[]){
      if(tr.to!=='PHASE_3_CONFIRMED')continue;
      const i=Number(tr.transitionBarIndex),ts=Number(tr.transitionAt);if(!Number.isInteger(i)||ts<start||ts>end)continue;
      const e=eventFromSignal({symbol,strategy:'RICE_BOWL',signalIndex:i,state:tr.to,sequenceId:tr.sequenceId,paramsHash:tr.paramsHash,candles,frictionPct,horizons});if(e)pushIfNew(events,keys,e);
    }
  }
  if(strategies.includes('DANTE_256')){
    d256Candidates=D256.scanCandidates({candles,analysisAsOf:finalAsOf,params:d256Params});
    for(const x of d256Candidates){const ts=Number(x.time);if(ts<start||ts>end)continue;const e=eventFromSignal({symbol,strategy:'DANTE_256',signalIndex:x.index,state:x.state,paramsHash:x.paramsHash,candles,frictionPct,horizons});if(e)pushIfNew(events,keys,e)}
  }
  events.sort((a,b)=>a.signalTime-b.signalTime||a.strategy.localeCompare(b.strategy));
  return{version:'DANTE_WALK_FORWARD_v1',replayMode:'CAUSAL_SINGLE_PASS',symbol,frictionPct,horizons:[...horizons],analysisStartTs:start,analysisEndTs:end,eventCount:events.length,events,diagnostics:{riceTransitionCount:riceResult?.transitionPath?.length||0,d256CandidateCount:d256Candidates.length}};
}
function runPrefixWalkForward({symbol='UNKNOWN',candles=[],analysisStartTs=null,analysisEndTs=null,riceParams={},d256Params={},frictionPct=.2,horizons=DEFAULT_HORIZONS,strategies=['RICE_BOWL','DANTE_256'],riceAnalyze=Rice.analyze,d256Analyze=D256.analyze}={}){
  if(!Array.isArray(candles)||!candles.length)throw new Error('candles required');
  C.assertClosedCandles(candles,candles.at(-1).closeTime??candles.at(-1).time);
  const start=finite(analysisStartTs)??Number(candles[0].openTime??candles[0].time),end=finite(analysisEndTs)??Number(candles.at(-1).closeTime??candles.at(-1).time);
  const minSeed=Math.max(Number(riceParams?.emaSeed?.seedBars)||C.DEFAULT_PARAMS.emaSeed.seedBars,Number(d256Params?.emaSeedBars)||224);
  const events=[],keys=new Set();let previousRice=null,prev256='NOT_CONFIRMED';
  for(let i=Math.max(2,minSeed);i<candles.length-1;i++){
    const signalTs=Number(candles[i].closeTime??candles[i].time);if(signalTs<start||signalTs>end)continue;
    const prefix=candles.slice(0,i+1);
    if(strategies.includes('RICE_BOWL')){
      const r=riceAnalyze({symbol,candles:prefix,analysisAsOf:signalTs,params:riceParams}),entered=r.riceBowlState==='PHASE_3_CONFIRMED'&&previousRice?.riceBowlState!=='PHASE_3_CONFIRMED';
      if(entered){const e=eventFromSignal({symbol,strategy:'RICE_BOWL',signalIndex:i,state:r.riceBowlState,sequenceId:r.sequenceId,paramsHash:r.paramsHash,candles,frictionPct,horizons});if(e)pushIfNew(events,keys,e)}
      previousRice=r;
    }
    if(strategies.includes('DANTE_256')){
      const d=d256Analyze({candles:prefix,analysisAsOf:signalTs,params:d256Params}),entered=d.status==='CANDIDATE'&&prev256!=='CANDIDATE';
      if(entered){const e=eventFromSignal({symbol,strategy:'DANTE_256',signalIndex:i,state:d.state,paramsHash:d.paramsHash,candles,frictionPct,horizons});if(e)pushIfNew(events,keys,e)}
      prev256=d.status;
    }
  }
  return{version:'DANTE_WALK_FORWARD_v1',replayMode:'PREFIX_REFERENCE',symbol,frictionPct,horizons:[...horizons],analysisStartTs:start,analysisEndTs:end,eventCount:events.length,events};
}
function assertSignalPrefixParity({symbol='UNKNOWN',candles=[],causalResult,riceParams={},d256Params={}}={}){
  const mismatches=[];
  for(const e of causalResult?.events||[]){
    const prefix=candles.slice(0,e.signalIndex+1),asOf=Number(prefix.at(-1).closeTime??prefix.at(-1).time);
    if(e.strategy==='RICE_BOWL'){const r=Rice.analyze({symbol,candles:prefix,analysisAsOf:asOf,params:riceParams});if(r.riceBowlState!=='PHASE_3_CONFIRMED')mismatches.push({eventKey:e.eventKey,expected:'PHASE_3_CONFIRMED',actual:r.riceBowlState})}
    if(e.strategy==='DANTE_256'){const d=D256.analyze({candles:prefix,analysisAsOf:asOf,params:d256Params});if(d.status!=='CANDIDATE')mismatches.push({eventKey:e.eventKey,expected:'CANDIDATE',actual:d.status})}
  }
  if(mismatches.length)throw new Error('Dante causal/prefix parity failed: '+JSON.stringify(mismatches.slice(0,5)));
  return{checked:(causalResult?.events||[]).length,mismatches:0};
}
function runWalkForward(args={}){return args.replayMode==='PREFIX_REFERENCE'?runPrefixWalkForward(args):runCausalWalkForward(args)}
function metric(values){const a=values.filter(Number.isFinite),m=mean(a),s=std(a);return{n:a.length,mean:m,median:median(a),positiveRate:a.length?a.filter(x=>x>0).length/a.length:null,min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null,tradeSharpe:s&&s>0?m/s:null}}
function summarize(events=[],horizons=DEFAULT_HORIZONS){
  const out={total:events.length,byStrategy:{},bySplit:{},byRegime:{}};
  for(const e of events){(out.byStrategy[e.strategy]??=[]).push(e);(out.bySplit[e.datasetSplit]??=[]).push(e);(out.byRegime[e.regime]??=[]).push(e)}
  const pack=rows=>{const r={n:rows.length,horizons:{}};for(const h of horizons){const hs=rows.map(x=>x.outcome?.horizons?.[String(h)]).filter(x=>x?.status==='EVALUATED');r.horizons[String(h)]={netReturnPct:metric(hs.map(x=>x.netReturnPct)),mfePct:metric(hs.map(x=>x.mfePct)),maePct:metric(hs.map(x=>x.maePct))}}return r};
  out.overall=pack(events);for(const k of Object.keys(out.byStrategy))out.byStrategy[k]=pack(out.byStrategy[k]);for(const k of Object.keys(out.bySplit))out.bySplit[k]=pack(out.bySplit[k]);for(const k of Object.keys(out.byRegime))out.byRegime[k]=pack(out.byRegime[k]);return out;
}
module.exports={DEFAULT_HORIZONS,finite,pct,median,mean,std,ema,classifyRegime,eventOutcome,eventFromSignal,runCausalWalkForward,runPrefixWalkForward,assertSignalPrefixParity,runWalkForward,metric,summarize};

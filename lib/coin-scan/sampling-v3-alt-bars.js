'use strict';

const VERSION='SAMPLING_V3_ALT_BARS_v2';
const CONFIG=Object.freeze({
  warmupTrades:50,
  thresholdLookback:200,
  tickTargetTrades:50,
  volumeTargetTrades:50,
  dollarTargetTrades:50,
  imbalanceTargetTrades:18,
  minRunTrades:6,
  minThresholdUsd:1000,
  minVolumeThreshold:1e-8,
  calibrationFraction:.35,
  minCalibrationTrades:50,
  thresholdMode:'FROZEN_CALIBRATION',
  overshootPolicy:'INCLUDE_FULL_TRADE'
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function median(xs=[]){const a=xs.map(finite).filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function normalizeAggTrades(rows=[]){
  const seen=new Set(),out=[];
  for(const x of Array.isArray(rows)?rows:[]){
    const id=finite(x?.a??x?.id),price=finite(x?.p??x?.price),qty=finite(x?.q??x?.qty),time=finite(x?.T??x?.time),buyerMaker=Boolean(x?.m??x?.buyerIsMaker??x?.buyerMaker);
    if(!(price>0&&qty>0&&time!=null))continue;
    const key=id!=null?'id:'+id:'t:'+time+':p:'+price+':q:'+qty;
    if(seen.has(key))continue;
    seen.add(key);
    out.push({id,price,qty,time,buyerMaker,aggressor:buyerMaker?-1:1,notional:price*qty});
  }
  out.sort((a,b)=>a.time-b.time||(a.id??0)-(b.id??0));
  return out;
}
function dynamicThreshold(values=[],targetTrades=50,minValue=0){
  const m=median(values);return Math.max(minValue,(m||0)*targetTrades);
}
function finalizeBar(trades=[],extra={}){
  if(!trades.length)return null;
  const qty=trades.reduce((s,x)=>s+x.qty,0),dollar=trades.reduce((s,x)=>s+x.notional,0);
  return{
    startTime:trades[0].time,endTime:trades.at(-1).time,open:trades[0].price,high:Math.max(...trades.map(x=>x.price)),
    low:Math.min(...trades.map(x=>x.price)),close:trades.at(-1).price,volume:qty,dollarVolume:dollar,tradeCount:trades.length,
    buyDollar:trades.filter(x=>x.aggressor>0).reduce((s,x)=>s+x.notional,0),
    sellDollar:trades.filter(x=>x.aggressor<0).reduce((s,x)=>s+x.notional,0),
    ...extra
  };
}
function splitCalibration(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),n=trades.length;
  if(n<cfg.minCalibrationTrades+2)return{status:'INSUFFICIENT_TRADES',trades,calibration:[],evaluation:[]};
  const requested=Math.floor(n*Math.min(.8,Math.max(.1,Number(cfg.calibrationFraction)||CONFIG.calibrationFraction)));
  const count=Math.min(n-1,Math.max(cfg.minCalibrationTrades,requested));
  const calibration=trades.slice(0,count),evaluation=trades.slice(count);
  return{status:evaluation.length?'READY':'INSUFFICIENT_EVALUATION',trades,calibration,evaluation};
}
function calibrateThresholds(rows=[],opts={}){
  const cfg={...CONFIG,...opts},split=splitCalibration(rows,cfg),cal=split.calibration;
  if(split.status!=='READY'||!cal.length)return{version:VERSION,status:split.status,calibrationTradeCount:cal.length,evaluationTradeCount:split.evaluation.length};
  const medianQty=median(cal.map(x=>x.qty))||0,medianNotional=median(cal.map(x=>x.notional))||0;
  return{
    version:VERSION,status:'READY',mode:'FROZEN_CALIBRATION',
    calibrationTradeCount:cal.length,evaluationTradeCount:split.evaluation.length,
    calibrationStartTime:cal[0].time,calibrationEndTime:cal.at(-1).time,evaluationStartTime:split.evaluation[0]?.time??null,
    thresholds:{
      tickTrades:Math.max(1,Math.floor(cfg.tickTargetTrades||CONFIG.tickTargetTrades)),
      volumeQty:Math.max(cfg.minVolumeThreshold,medianQty*(cfg.volumeTargetTrades||CONFIG.volumeTargetTrades)),
      dollarUsd:Math.max(cfg.minThresholdUsd,medianNotional*(cfg.dollarTargetTrades||CONFIG.dollarTargetTrades)),
      imbalanceUsd:Math.max(cfg.minThresholdUsd,medianNotional*(cfg.imbalanceTargetTrades||CONFIG.imbalanceTargetTrades)),
      runUsd:Math.max(cfg.minThresholdUsd,medianNotional*(cfg.minRunTrades||CONFIG.minRunTrades))
    },
    medians:{qty:medianQty,notionalUsd:medianNotional},
    overshootPolicy:cfg.overshootPolicy
  };
}
function buildTickBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),n=Math.max(1,Math.floor(finite(cfg.tickTargetTrades)??CONFIG.tickTargetTrades)),bars=[];
  for(let i=0;i+n<=trades.length;i+=n){
    const bucket=trades.slice(i,i+n);
    bars.push(finalizeBar(bucket,{barType:'TICK',thresholdTrades:n,overshootPolicy:'NOT_APPLICABLE'}));
  }
  return bars;
}
function buildVolumeBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),recent=[],bars=[];let bucket=[],sum=0;
  for(const t of trades){
    if(finite(cfg.volumeThresholdQty)==null&&recent.length<cfg.warmupTrades){recent.push(t.qty);continue}
    const threshold=finite(cfg.volumeThresholdQty)??dynamicThreshold(recent.slice(-cfg.thresholdLookback),cfg.volumeTargetTrades,cfg.minVolumeThreshold);
    bucket.push(t);sum+=t.qty;
    recent.push(t.qty);if(recent.length>cfg.thresholdLookback)recent.shift();
    if(sum>=threshold){
      bars.push(finalizeBar(bucket,{barType:'VOLUME',thresholdQty:threshold,overshootVolume:Math.max(0,sum-threshold),overshootPolicy:cfg.overshootPolicy}));
      bucket=[];sum=0;
    }
  }
  return bars;
}
function buildDollarBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),recent=[],bars=[];let bucket=[],sum=0;
  for(const t of trades){
    if(finite(cfg.thresholdUsd)==null&&recent.length<cfg.warmupTrades){recent.push(t.notional);continue}
    const threshold=finite(cfg.thresholdUsd)??dynamicThreshold(recent.slice(-cfg.thresholdLookback),cfg.dollarTargetTrades,cfg.minThresholdUsd);
    bucket.push(t);sum+=t.notional;
    recent.push(t.notional);if(recent.length>cfg.thresholdLookback)recent.shift();
    if(sum>=threshold){
      bars.push(finalizeBar(bucket,{barType:'DOLLAR',thresholdUsd:threshold,overshootUsd:Math.max(0,sum-threshold),overshootPolicy:cfg.overshootPolicy}));
      bucket=[];sum=0;
    }
  }
  return bars;
}
function buildImbalanceBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),recent=[],bars=[];let bucket=[],imbalance=0;
  for(const t of trades){
    if(finite(cfg.imbalanceThresholdUsd)==null&&recent.length<cfg.warmupTrades){recent.push(t.notional);continue}
    const threshold=finite(cfg.imbalanceThresholdUsd)??dynamicThreshold(recent.slice(-cfg.thresholdLookback),cfg.imbalanceTargetTrades,cfg.minThresholdUsd);
    bucket.push(t);imbalance+=t.aggressor*t.notional;
    recent.push(t.notional);if(recent.length>cfg.thresholdLookback)recent.shift();
    if(Math.abs(imbalance)>=threshold){
      bars.push(finalizeBar(bucket,{barType:'IMBALANCE',signedImbalanceUsd:imbalance,thresholdUsd:threshold,overshootUsd:Math.max(0,Math.abs(imbalance)-threshold),overshootPolicy:cfg.overshootPolicy,direction:imbalance>0?'BUY':'SELL'}));
      bucket=[];imbalance=0;
    }
  }
  return bars;
}
function buildRunBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),recent=[],bars=[];let run=[],side=null;
  function threshold(){return finite(cfg.runThresholdUsd)??dynamicThreshold(recent.slice(-cfg.thresholdLookback),cfg.minRunTrades,cfg.minThresholdUsd)}
  function maybeFlush(force=false){
    if(!run.length)return;
    const th=threshold(),dollar=run.reduce((s,x)=>s+x.notional,0);
    if(run.length>=cfg.minRunTrades&&dollar>=th){
      bars.push(finalizeBar(run,{barType:'RUN',direction:side>0?'BUY':'SELL',thresholdUsd:th,overshootUsd:Math.max(0,dollar-th),overshootPolicy:cfg.overshootPolicy,runTrades:run.length}));
      run=[];
    }else if(force)run=[];
  }
  for(const t of trades){
    if(finite(cfg.runThresholdUsd)==null&&recent.length<cfg.warmupTrades){recent.push(t.notional);continue}
    if(side==null){side=t.aggressor;run=[t]}
    else if(t.aggressor===side)run.push(t);
    else{maybeFlush(true);side=t.aggressor;run=[t]}
    recent.push(t.notional);if(recent.length>cfg.thresholdLookback)recent.shift();
    maybeFlush(false);
  }
  maybeFlush(true);
  return bars;
}
function buildWithFrozenThresholds(rows=[],calibration={},opts={}){
  const t=calibration.thresholds||{},cfg={...CONFIG,...opts};
  return{
    tick:buildTickBars(rows,{...cfg,tickTargetTrades:t.tickTrades}),
    volume:buildVolumeBars(rows,{...cfg,volumeThresholdQty:t.volumeQty}),
    dollar:buildDollarBars(rows,{...cfg,thresholdUsd:t.dollarUsd}),
    imbalance:buildImbalanceBars(rows,{...cfg,imbalanceThresholdUsd:t.imbalanceUsd}),
    run:buildRunBars(rows,{...cfg,runThresholdUsd:t.runUsd})
  };
}
function counts(bars={}){
  return{tickCount:bars.tick?.length||0,volumeCount:bars.volume?.length||0,dollarCount:bars.dollar?.length||0,imbalanceCount:bars.imbalance?.length||0,runCount:bars.run?.length||0};
}
function summarize(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),last=x=>x?.length?x.at(-1):null,mode=String(cfg.thresholdMode||CONFIG.thresholdMode).toUpperCase();
  let evaluation=trades,calibration=null,bars;
  if(mode==='FROZEN_CALIBRATION'){
    const split=splitCalibration(trades,cfg);
    calibration=calibrateThresholds(trades,cfg);
    if(calibration.status==='READY'){
      evaluation=split.evaluation;
      bars=buildWithFrozenThresholds(evaluation,calibration,cfg);
    }
  }
  if(!bars){
    bars={
      tick:buildTickBars(trades,cfg),
      volume:buildVolumeBars(trades,cfg),
      dollar:buildDollarBars(trades,cfg),
      imbalance:buildImbalanceBars(trades,cfg),
      run:buildRunBars(trades,cfg)
    };
  }
  const c=counts(bars),rollingShadow=mode==='FROZEN_CALIBRATION'?counts({
    tick:buildTickBars(trades,cfg),
    volume:buildVolumeBars(trades,{...cfg,volumeThresholdQty:null}),
    dollar:buildDollarBars(trades,{...cfg,thresholdUsd:null}),
    imbalance:buildImbalanceBars(trades,{...cfg,imbalanceThresholdUsd:null}),
    run:buildRunBars(trades,{...cfg,runThresholdUsd:null})
  }):null;
  return{
    version:VERSION,revision:'3.2',status:trades.length>=CONFIG.minCalibrationTrades?'READY':'INSUFFICIENT_TRADES',tradeCount:trades.length,evaluationTradeCount:evaluation.length,
    source:'BINANCE_FUTURES_AGGTRADES',
    policy:{thresholdMode:mode,overshootPolicy:cfg.overshootPolicy,partialBarPolicy:'DROP_INCOMPLETE_TAIL'},
    calibration,
    bars:c,
    latest:{tick:last(bars.tick),volume:last(bars.volume),dollar:last(bars.dollar),imbalance:last(bars.imbalance),run:last(bars.run)},
    rollingShadow,
    diagnostics:{
      buyShare:trades.length?trades.filter(x=>x.aggressor>0).length/trades.length:null,
      notionalUsd:trades.reduce((s,x)=>s+x.notional,0),
      duplicateSafe:true,causalThresholds:true,frozenEvaluation:mode==='FROZEN_CALIBRATION',
      futureDataUsedForThresholds:false
    }
  };
}
module.exports={VERSION,CONFIG,normalizeAggTrades,dynamicThreshold,splitCalibration,calibrateThresholds,finalizeBar,buildTickBars,buildVolumeBars,buildDollarBars,buildImbalanceBars,buildRunBars,buildWithFrozenThresholds,summarize};

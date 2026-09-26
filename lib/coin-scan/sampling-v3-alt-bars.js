'use strict';

const VERSION='SAMPLING_V3_ALT_BARS_v1';
const CONFIG=Object.freeze({
  warmupTrades:50,
  thresholdLookback:200,
  dollarTargetTrades:50,
  imbalanceTargetTrades:18,
  minRunTrades:6,
  minThresholdUsd:1000
});
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function median(xs=[]){const a=xs.map(finite).filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function normalizeAggTrades(rows=[]){
  const map=new Map(),out=[];
  for(const x of Array.isArray(rows)?rows:[]){
    const id=finite(x?.a??x?.id),price=finite(x?.p??x?.price),qty=finite(x?.q??x?.qty),time=finite(x?.T??x?.time),buyerMaker=Boolean(x?.m??x?.buyerIsMaker);
    if(!(price>0&&qty>0&&time!=null))continue;
    const key=id!=null?'id:'+id:'t:'+time+':p:'+price+':q:'+qty;
    if(map.has(key))continue;
    map.set(key,true);
    out.push({id,price,qty,time,buyerMaker,aggressor:buyerMaker?-1:1,notional:price*qty});
  }
  out.sort((a,b)=>a.time-b.time||(a.id??0)-(b.id??0));
  return out;
}
function dynamicThreshold(recentNotionals=[],targetTrades=50,minUsd=1000){
  const m=median(recentNotionals);return Math.max(minUsd,(m||0)*targetTrades);
}
function finalizeBar(trades=[],extra={}){
  if(!trades.length)return null;
  const notionals=trades.map(x=>x.notional),qty=trades.reduce((s,x)=>s+x.qty,0),dollar=notionals.reduce((s,x)=>s+x,0);
  return{
    startTime:trades[0].time,endTime:trades.at(-1).time,open:trades[0].price,high:Math.max(...trades.map(x=>x.price)),
    low:Math.min(...trades.map(x=>x.price)),close:trades.at(-1).price,volume:qty,dollarVolume:dollar,tradeCount:trades.length,
    buyDollar:trades.filter(x=>x.aggressor>0).reduce((s,x)=>s+x.notional,0),
    sellDollar:trades.filter(x=>x.aggressor<0).reduce((s,x)=>s+x.notional,0),
    ...extra
  };
}
function buildDollarBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),recent=[],bars=[];let bucket=[],sum=0;
  for(const t of trades){
    if(recent.length<cfg.warmupTrades){recent.push(t.notional);continue}
    const threshold=finite(cfg.thresholdUsd)??dynamicThreshold(recent.slice(-cfg.thresholdLookback),cfg.dollarTargetTrades,cfg.minThresholdUsd);
    bucket.push(t);sum+=t.notional;
    recent.push(t.notional);if(recent.length>cfg.thresholdLookback)recent.shift();
    if(sum>=threshold){
      bars.push(finalizeBar(bucket,{barType:'DOLLAR',thresholdUsd:threshold}));
      bucket=[];sum=0;
    }
  }
  return bars;
}
function buildImbalanceBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),recent=[],bars=[];let bucket=[],imbalance=0;
  for(const t of trades){
    if(recent.length<cfg.warmupTrades){recent.push(t.notional);continue}
    const threshold=finite(cfg.imbalanceThresholdUsd)??dynamicThreshold(recent.slice(-cfg.thresholdLookback),cfg.imbalanceTargetTrades,cfg.minThresholdUsd);
    bucket.push(t);imbalance+=t.aggressor*t.notional;
    recent.push(t.notional);if(recent.length>cfg.thresholdLookback)recent.shift();
    if(Math.abs(imbalance)>=threshold){
      bars.push(finalizeBar(bucket,{barType:'IMBALANCE',signedImbalanceUsd:imbalance,thresholdUsd:threshold,direction:imbalance>0?'BUY':'SELL'}));
      bucket=[];imbalance=0;
    }
  }
  return bars;
}
function buildRunBars(rows=[],opts={}){
  const cfg={...CONFIG,...opts},trades=normalizeAggTrades(rows),recent=[],bars=[];let run=[],side=null;
  function maybeFlush(force=false){
    if(!run.length)return;
    const threshold=dynamicThreshold(recent.slice(-cfg.thresholdLookback),cfg.minRunTrades,cfg.minThresholdUsd);
    const dollar=run.reduce((s,x)=>s+x.notional,0);
    if(run.length>=cfg.minRunTrades&&dollar>=threshold){
      bars.push(finalizeBar(run,{barType:'RUN',direction:side>0?'BUY':'SELL',thresholdUsd:threshold,runTrades:run.length}));
      run=[];
    }else if(force)run=[];
  }
  for(const t of trades){
    if(recent.length<cfg.warmupTrades){recent.push(t.notional);continue}
    if(side==null){side=t.aggressor;run=[t]}
    else if(t.aggressor===side)run.push(t);
    else{maybeFlush(true);side=t.aggressor;run=[t]}
    recent.push(t.notional);if(recent.length>cfg.thresholdLookback)recent.shift();
    maybeFlush(false);
  }
  maybeFlush(true);
  return bars;
}
function summarize(rows=[],opts={}){
  const trades=normalizeAggTrades(rows),dollar=buildDollarBars(trades,opts),imbalance=buildImbalanceBars(trades,opts),run=buildRunBars(trades,opts);
  const last=x=>x.length?x.at(-1):null;
  return{
    version:VERSION,status:trades.length>=CONFIG.warmupTrades?'READY':'INSUFFICIENT_TRADES',tradeCount:trades.length,
    source:'BINANCE_FUTURES_AGGTRADES',
    bars:{dollarCount:dollar.length,imbalanceCount:imbalance.length,runCount:run.length},
    latest:{dollar:last(dollar),imbalance:last(imbalance),run:last(run)},
    diagnostics:{
      buyShare:trades.length?trades.filter(x=>x.aggressor>0).length/trades.length:null,
      notionalUsd:trades.reduce((s,x)=>s+x.notional,0),
      duplicateSafe:true,causalThresholds:true
    }
  };
}
module.exports={VERSION,CONFIG,normalizeAggTrades,dynamicThreshold,finalizeBar,buildDollarBars,buildImbalanceBars,buildRunBars,summarize};

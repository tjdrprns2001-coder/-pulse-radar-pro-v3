'use strict';

const T=require('./telemetry.js');
const {createPersistence}=require('./persistence.js');
const {createLiveHub}=require('./live-hub.js');

let singleton=null;
function cleanSymbol(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function createChartRuntime({provider,persistence=null,WebSocketCtor=null,now=()=>Date.now()}={}){
  if(!provider)throw new Error('provider required');
  const store=persistence||createPersistence({});
  const hub=createLiveHub({WebSocketCtor,persistence:store,now});
  let initialized=false;
  async function init(){if(initialized)return true;initialized=true;try{await store.init?.()}catch{}return true}
  async function bootstrapTrades(symbol,{market='spot',limit=1000}={}){
    const s=cleanSymbol(symbol),fn=String(market).toLowerCase()==='perpetual'?provider.getFuturesAggTrades:provider.getSpotAggTrades;
    if(typeof fn!=='function')return[];
    try{
      const rows=await fn.call(provider,s,{limit:Math.max(50,Math.min(1000,Number(limit)||1000))});
      return(Array.isArray(rows)?rows:[]).map(x=>T.normalizeTrade(x,String(market).toLowerCase()==='perpetual'?'BINANCE_FUTURES_REST':'BINANCE_SPOT_REST')).filter(Boolean)
    }catch{return[]}
  }
  async function telemetry(symbol,{market='spot',profileBins=100,tradeWindowMs=48*3600000}={}){
    await init();const s=cleanSymbol(symbol);hub.connect(s);let snap=hub.snapshot(s,{profileBins,tradeWindowMs});
    if(!snap.trade_profile?.available||snap.trade_profile.trade_count<100){
      const rest=await bootstrapTrades(s,{market,limit:1000});
      if(rest.length){
        const end=now(),start=Math.min(rest[0].time,end-tradeWindowMs),p=T.tradeVolumeProfile(rest,{bins:profileBins,startTime:start,endTime:end});
        snap={...snap,trade_profile:{...p,precision:p.coverage?.complete?'trade_exact_window':'trade_exact_partial',bootstrap:'rest_aggTrades'}}
      }
    }
    if((snap.liquidations?.series||[]).length===0&&store.listEvents){
      try{
        const rows=await store.listEvents({symbol:s,type:'liquidation',limit:500,since:now()-24*3600000});
        if(rows.length)snap.liquidations={status:'available',series:rows,summary_1h:T.liquidationSummary(rows,3600000,now()),summary_4h:T.liquidationSummary(rows,4*3600000,now())}
      }catch{}
    }
    return snap
  }
  async function persistAnalysisData(analysis){
    await init();const symbol=cleanSymbol(analysis?.symbol),tf=String(analysis?.tf||'4h'),bars=analysis?.bars||[],lastClosed=analysis?.dataQuality?.last_closed_candle||bars.at(-1)?.ct||bars.at(-1)?.t||now(),results={candles:0,oi:0,funding:0,snapshot:false,event:false};
    if(store.upsertCandles&&bars.length){const rows=bars.slice(-2000).map(x=>({open_time:x.t,close_time:x.ct??x.t,open:x.o,high:x.h,low:x.l,close:x.c,volume_base:x.v,volume_quote:x.q,source:(analysis?.source?.sources||[]).join('|')||'market',data_status:'valid'}));try{results.candles=await store.upsertCandles({symbol,timeframe:tf,rows})}catch{}}
    if(store.appendDerivative){const oi=(analysis?.oiSeries||[]).map(x=>({event_time:x.time,value:x.open_interest,source:x.source||'unknown',open_interest:x.open_interest})),funding=(analysis?.fundingSeries||[]).map(x=>({event_time:x.time,value:x.funding_rate_pct,source:x.source||'unknown',funding_rate_pct:x.funding_rate_pct}));try{results.oi=await store.appendDerivative({symbol,series_type:'open_interest',rows:oi})}catch{}try{results.funding=await store.appendDerivative({symbol,series_type:'funding',rows:funding})}catch{}}
    const snapshot={symbol,snapshot_type:'analysis',timeframe:tf,observed_at:Number(analysis?.stamp)||now(),as_of:lastClosed,current_price:analysis?.currentPrice,market_structure:{trend:analysis?.structure?.trend,last_bos:analysis?.structure?.lastBos,last_choch:analysis?.structure?.lastChoch,range:analysis?.structure?.range,htf_trend:analysis?.htfTrend},zones:(analysis?.zones||[]).slice(0,50),breakout:analysis?.breakout,smart_money:analysis?.smartMoney,data_quality:analysis?.dataQuality,algorithm_version:'CHART_API_v1.0.0',parameter_version:'2026-10-08.chart-v1'};
    try{if(store.putSnapshot){await store.putSnapshot('analysis:'+symbol+':'+tf,snapshot);results.snapshot=true}}catch{}
    try{if(store.appendEvent){results.event=await store.appendEvent({event_id:'analysis:'+symbol+':'+tf+':'+String(lastClosed),event_type:'analysis_snapshot',symbol,event_time:Number(lastClosed)||now(),payload:snapshot})}}catch{}
    return results
  }
  async function observeAnalysis(analysis){
    await init();const alerts=T.alertCandidates(analysis),saved=[];for(const a of alerts){try{if(await store.putAlert(a))saved.push(a)}catch{}}
    const persistence=await persistAnalysisData(analysis).catch(()=>({}));
    return{candidates:alerts,saved,persistence}
  }
  async function alerts({symbol=null,limit=100}={}){await init();return store.listAlerts?store.listAlerts({symbol,limit}):[]}
  async function health(){await init();let persistenceHealth={kind:store.kind||'unknown',durable:Boolean(store.durable)};try{if(store.health)persistenceHealth=await store.health()}catch(e){persistenceHealth={...persistenceHealth,status:'unavailable',error:String(e?.message||e)}}return{persistence:persistenceHealth,live:hub.health()}}
  return{store,hub,init,telemetry,persistAnalysisData,observeAnalysis,alerts,health,bootstrapTrades}
}
function defaultChartRuntime({provider}={}){
  if(!singleton){if(!provider)throw new Error('provider required for first runtime initialization');singleton=createChartRuntime({provider})}
  return singleton
}
module.exports={createChartRuntime,defaultChartRuntime};

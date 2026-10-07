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
  async function observeAnalysis(analysis){
    await init();const alerts=T.alertCandidates(analysis),saved=[];for(const a of alerts){try{if(await store.putAlert(a))saved.push(a)}catch{}}
    return{candidates:alerts,saved}
  }
  async function alerts({symbol=null,limit=100}={}){await init();return store.listAlerts?store.listAlerts({symbol,limit}):[]}
  async function health(){await init();let persistenceHealth={kind:store.kind||'unknown',durable:Boolean(store.durable)};try{if(store.health)persistenceHealth=await store.health()}catch(e){persistenceHealth={...persistenceHealth,status:'unavailable',error:String(e?.message||e)}}return{persistence:persistenceHealth,live:hub.health()}}
  return{store,hub,init,telemetry,observeAnalysis,alerts,health,bootstrapTrades}
}
function defaultChartRuntime({provider}={}){
  if(!singleton){if(!provider)throw new Error('provider required for first runtime initialization');singleton=createChartRuntime({provider})}
  return singleton
}
module.exports={createChartRuntime,defaultChartRuntime};

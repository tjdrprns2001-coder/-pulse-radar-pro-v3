'use strict';

const {createBinanceProvider}=require('../coin-scan/binance-provider.js');

const DEFAULT_SPOT_BASES=['https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com'];
const DEFAULT_FUTURES_BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com','https://fapi3.binance.com'];

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function cleanMarketType(v){const x=String(v||'spot').toLowerCase();return ['perpetual','futures','future'].includes(x)?'perpetual':'spot'}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function bpsToPct(v){const n=finite(v);return n==null?0:n/100}
function round(v,d=10){const p=10**d;return Math.round(Number(v)*p)/p}

async function fetchJson(fetchImpl,bases,path){
  let last=null,status=null;
  for(const base of bases){
    try{
      const r=await fetchImpl(base+path);
      if(!r||!r.ok){status=Number(r&&r.status)||null;last=new Error('HTTP '+(r&&r.status||'ERR'));continue}
      return{data:await r.json(),base,status:Number(r.status)||200};
    }catch(e){last=e}
  }
  const err=last||new Error('crypto market request failed');err.statusCode=status||503;throw err;
}

function normalizeExchangeInfo(info,{marketType='spot',quoteAsset='USDT',exchange='BINANCE'}={}){
  const mt=cleanMarketType(marketType),quote=String(quoteAsset||'USDT').toUpperCase();
  return (Array.isArray(info?.symbols)?info.symbols:[])
    .filter(x=>String(x?.quoteAsset||'').toUpperCase()===quote)
    .filter(x=>String(x?.status||'').toUpperCase()==='TRADING')
    .filter(x=>mt!=='spot'||x?.isSpotTradingAllowed!==false)
    .filter(x=>mt!=='perpetual'||!x?.contractType||String(x.contractType).toUpperCase()==='PERPETUAL')
    .map(x=>({
      symbol:cleanSymbol(x.symbol),baseAsset:String(x.baseAsset||'').toUpperCase(),quoteAsset:quote,
      exchange:String(exchange).toUpperCase(),marketType:mt,
      listedAt:finite(x.listedAt??x.onboardDate),delistedAt:finite(x.delistedAt??x.deliveryDate),
      status:String(x.status||'TRADING'),contractType:x.contractType?String(x.contractType):null
    })).filter(x=>x.symbol);
}

function executionCostModel(input={}){
  const marketType=cleanMarketType(input.marketType),notional=Math.max(0,finite(input.notional)??0);
  const feePct=bpsToPct(input.feeBps??(marketType==='perpetual'?5:10));
  const spreadPct=bpsToPct(input.spreadBps??2),slippagePct=bpsToPct(input.slippageBps??5);
  const fundingRatePct=marketType==='perpetual'?(finite(input.fundingRatePct)??0):0;
  const oneWayPct=feePct+spreadPct/2+slippagePct;
  const roundTripPct=oneWayPct*2+Math.abs(fundingRatePct);
  return{
    marketType,notional,
    assumptions:{feeBps:round(feePct*100),spreadBps:round(spreadPct*100),slippageBps:round(slippagePct*100),fundingRatePct},
    oneWayPct:round(oneWayPct),roundTripPct:round(roundTripPct),
    oneWayCost:notional?round(notional*oneWayPct/100):null,
    roundTripCost:notional?round(notional*roundTripPct/100):null
  };
}

function createCryptoResearchDataEngine({
  fetchImpl=globalThis.fetch,now=()=>Date.now(),exchange='BINANCE',marketType='spot',quoteAsset='USDT',
  spotBases=DEFAULT_SPOT_BASES,futuresBases=DEFAULT_FUTURES_BASES
}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const mt=cleanMarketType(marketType),quote=String(quoteAsset||'USDT').toUpperCase(),ex=String(exchange||'BINANCE').toUpperCase();
  const historical=createBinanceProvider({fetchImpl,now,bases:spotBases,futuresBases});
  let lastUniverseMeta=null;

  async function getUniverse(){
    const path=mt==='perpetual'?'/fapi/v1/exchangeInfo':'/api/v3/exchangeInfo';
    const bases=mt==='perpetual'?futuresBases:spotBases;
    try{
      const out=await fetchJson(fetchImpl,bases,path);
      lastUniverseMeta={exchange:ex,marketType:mt,quoteAsset:quote,sourceBase:out.base,observedAt:now(),fallback:false};
      return{symbols:normalizeExchangeInfo(out.data,{marketType:mt,quoteAsset:quote,exchange:ex})};
    }catch(e){
      if(mt!=='perpetual')throw e;
      const out=await fetchJson(fetchImpl,spotBases,'/api/v3/exchangeInfo');
      lastUniverseMeta={exchange:ex,marketType:'spot-fallback',quoteAsset:quote,sourceBase:out.base,observedAt:now(),fallback:true,reason:String(e?.message||e)};
      return{symbols:normalizeExchangeInfo(out.data,{marketType:'spot',quoteAsset:quote,exchange:ex})};
    }
  }

  const TF_MS=Object.freeze({'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'8h':28800000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000});
  function rowOpenTime(r){return finite(Array.isArray(r)?r[0]:r?.openTime??r?.time)}
  function rowCloseTime(r){return finite(Array.isArray(r)?r[6]:r?.closeTime)}
  async function getKlinesRange(symbol,interval,{startTime,endTime,maxBars=250000,pageSize=1500}={}){
    const s=cleanSymbol(symbol),tf=String(interval||'15m').toLowerCase(),start=finite(startTime),end=finite(endTime);
    if(!s||start==null||end==null||end<start)throw new Error('symbol/startTime/endTime required');
    const limit=Math.max(50,Math.min(1500,Number(pageSize)||1500)),cap=Math.max(limit,Math.min(1000000,Number(maxBars)||250000));
    const seen=new Map();let cursor=end,pages=0,done=false;
    while(!done&&seen.size<cap){
      const batch=await historical.getKlinesAt(s,tf,{endTime:cursor,rows:limit});
      pages++;
      const rows=Array.isArray(batch)?batch:[];
      if(!rows.length)break;
      let oldest=null;
      for(const r of rows){
        const ot=rowOpenTime(r),ct=rowCloseTime(r);
        if(ot==null||ct==null)continue;
        if(ct<=end&&ct>=start)seen.set(String(ot),r);
        if(oldest==null||ot<oldest)oldest=ot;
      }
      if(oldest==null||oldest<=start)done=true;
      else{
        const next=oldest-1;
        if(next>=cursor)break;
        cursor=next;
      }
      if(rows.length<limit)done=true;
    }
    const result=[...seen.values()].sort((a,b)=>(rowOpenTime(a)||0)-(rowOpenTime(b)||0)).slice(-cap);
    return{symbol:s,interval:tf,startTime:start,endTime:end,pages,rowCount:result.length,truncated:seen.size>=cap,rows:result};
  }
  async function getHistoricalFramesRange(symbol,{startTime,endTime,intervals=['1w','3d','1d','12h','4h','1h','15m','5m'],warmupBars=240,maxBarsPerFrame=250000}={}){
    const start=finite(startTime),end=finite(endTime);if(start==null||end==null)throw new Error('startTime/endTime required');
    const frames={},meta={};
    for(const tf of intervals){
      const step=TF_MS[String(tf)]||0,from=step?Math.max(0,start-step*Math.max(0,Number(warmupBars)||0)):start;
      const out=await getKlinesRange(symbol,tf,{startTime:from,endTime:end,maxBars:maxBarsPerFrame});
      frames[tf]=out.rows;meta[tf]={pages:out.pages,rowCount:out.rowCount,truncated:out.truncated,requestedStart:from};
    }
    return{frames,meta,startTime:start,endTime:end,warmupBars:Number(warmupBars)||0};
  }
  async function getHistoricalFrames(symbol,args={}){
    const frames=await historical.getHistoricalFrames(cleanSymbol(symbol),args);
    return frames;
  }
  async function getKlinesAt(symbol,interval,args={}){return historical.getKlinesAt(cleanSymbol(symbol),interval,args)}
  async function getDerivativesContext(symbol){
    if(mt!=='perpetual')return{available:false,marketType:mt,fundingPct:null,oiChangePct:null,takerRatio:null,reason:'spot-market'};
    try{return{available:true,marketType:mt,...await historical.getDerivativesContext(cleanSymbol(symbol))}}
    catch(e){return{available:false,marketType:mt,fundingPct:null,oiChangePct:null,takerRatio:null,reason:String(e?.message||e)}}
  }
  function provenance(){
    const sourceState=typeof historical.getSourceState==='function'?historical.getSourceState():null;
    return{
      engineVersion:'CRYPTO_RESEARCH_DATA_v1',exchange:ex,marketType:mt,quoteAsset:quote,
      session:'24x7',sessionAnchor:'UTC 00:00',observedAt:now(),
      universe:lastUniverseMeta,marketSource:sourceState?.marketSource||mt,
      futuresBlockedUntil:sourceState?.futuresBlockedUntil||null,
      missingPolicy:'N/A_NO_ESTIMATION'
    };
  }
  return{
    engineVersion:'CRYPTO_RESEARCH_DATA_v1',exchange:ex,marketType:mt,quoteAsset:quote,
    getUniverse,getHistoricalFrames,getHistoricalFramesRange,getKlinesAt,getKlinesRange,getDerivativesContext,provenance,
    estimateExecutionCost:executionCostModel,
    lineagePolicy:Object.freeze({events:['LIST','DELIST','SYMBOL_CHANGE','TOKEN_SWAP','REDENOMINATION'],unknown:'FLAG_AND_EXCLUDE_FROM_POINT_IN_TIME_TEST'}),
    sessionPolicy:Object.freeze({continuous:true,label:'24x7',anchor:'UTC 00:00',kstViewAnchor:'KST 09:00'})
  };
}

module.exports={
  DEFAULT_SPOT_BASES,DEFAULT_FUTURES_BASES,cleanMarketType,normalizeExchangeInfo,executionCostModel,createCryptoResearchDataEngine
};

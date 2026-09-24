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
    getUniverse,getHistoricalFrames,getKlinesAt,getDerivativesContext,provenance,
    estimateExecutionCost:executionCostModel,
    lineagePolicy:Object.freeze({events:['LIST','DELIST','SYMBOL_CHANGE','TOKEN_SWAP','REDENOMINATION'],unknown:'FLAG_AND_EXCLUDE_FROM_POINT_IN_TIME_TEST'}),
    sessionPolicy:Object.freeze({continuous:true,label:'24x7',anchor:'UTC 00:00',kstViewAnchor:'KST 09:00'})
  };
}

module.exports={
  DEFAULT_SPOT_BASES,DEFAULT_FUTURES_BASES,cleanMarketType,normalizeExchangeInfo,executionCostModel,createCryptoResearchDataEngine
};

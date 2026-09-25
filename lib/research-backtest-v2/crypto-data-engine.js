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
    const limit=Math.max(2,Math.min(1500,Number(pageSize)||1500)),cap=Math.max(limit,Math.min(1000000,Number(maxBars)||250000));
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
  async function fetchFuturesRange(pathBuilder,{startTime,endTime,pageSize=500,maxRows=200000}={}){
    const start=finite(startTime),end=finite(endTime);if(start==null||end==null||end<start)throw new Error('startTime/endTime required');
    const limit=Math.max(2,Math.min(1000,Number(pageSize)||500)),cap=Math.max(limit,Math.min(500000,Number(maxRows)||200000));
    const seen=new Map();let cursor=end,pages=0;
    while(seen.size<cap){
      const path=pathBuilder({startTime:start,endTime:cursor,limit});
      const out=await fetchJson(fetchImpl,futuresBases,path);pages++;
      const rows=Array.isArray(out.data)?out.data:[];
      if(!rows.length)break;
      let oldest=null;
      for(const x of rows){
        const ts=finite(x?.timestamp??x?.time??x?.fundingTime);
        if(ts==null)continue;
        if(ts>=start&&ts<=end)seen.set(String(ts),x);
        if(oldest==null||ts<oldest)oldest=ts;
      }
      if(oldest==null||oldest<=start||rows.length<limit)break;
      const next=oldest-1;if(next>=cursor)break;cursor=next;
    }
    return{rows:[...seen.values()].sort((a,b)=>(finite(a?.timestamp??a?.time??a?.fundingTime)||0)-(finite(b?.timestamp??b?.time??b?.fundingTime)||0)),pages,truncated:seen.size>=cap};
  }
  async function getHistoricalOiRange(symbol,{period='1h',startTime,endTime,pageSize=500,maxRows=200000}={}){
    const s=cleanSymbol(symbol),p=String(period||'1h');
    return fetchFuturesRange(({startTime,endTime,limit})=>'/futures/data/openInterestHist?symbol='+encodeURIComponent(s)+'&period='+encodeURIComponent(p)+'&startTime='+Math.floor(startTime)+'&endTime='+Math.floor(endTime)+'&limit='+limit,{startTime,endTime,pageSize,maxRows});
  }
  async function getHistoricalTakerRange(symbol,{period='15m',startTime,endTime,pageSize=500,maxRows=200000}={}){
    const s=cleanSymbol(symbol),p=String(period||'15m');
    return fetchFuturesRange(({startTime,endTime,limit})=>'/futures/data/takerlongshortRatio?symbol='+encodeURIComponent(s)+'&period='+encodeURIComponent(p)+'&startTime='+Math.floor(startTime)+'&endTime='+Math.floor(endTime)+'&limit='+limit,{startTime,endTime,pageSize,maxRows});
  }
  async function getHistoricalFundingRange(symbol,{startTime,endTime,pageSize=1000,maxRows=200000}={}){
    const s=cleanSymbol(symbol);
    return fetchFuturesRange(({startTime,endTime,limit})=>'/fapi/v1/fundingRate?symbol='+encodeURIComponent(s)+'&startTime='+Math.floor(startTime)+'&endTime='+Math.floor(endTime)+'&limit='+limit,{startTime,endTime,pageSize,maxRows});
  }
  function pctFromSeries(rows,cutoff,hours){
    const a=(rows||[]).filter(x=>(finite(x?.timestamp)||0)<=cutoff),last=a.at(-1),target=cutoff-hours*3600000;
    if(!last)return null;
    let prior=null;for(const x of a){if((finite(x?.timestamp)||0)<=target)prior=x;else break}
    const lv=finite(last?.sumOpenInterest),pv=finite(prior?.sumOpenInterest);return lv!=null&&pv>0?((lv/pv)-1)*100:null;
  }
  function latestAt(rows,cutoff,field='timestamp'){
    let best=null;for(const x of rows||[]){const t=finite(x?.[field]);if(t!=null&&t<=cutoff)best=x;else if(t!=null&&t>cutoff)break}return best;
  }
  async function buildHistoricalContextTimeline(symbol,{startTime,endTime,stepMs=900000,warmupHours=30}={}){
    const s=cleanSymbol(symbol),start=finite(startTime),end=finite(endTime);if(!s||start==null||end==null)throw new Error('symbol/startTime/endTime required');
    const from=Math.max(0,start-Math.max(24,Number(warmupHours)||30)*3600000);
    const [oi,t1,t15,funding,spot]=await Promise.all([
      getHistoricalOiRange(s,{period:'1h',startTime:from,endTime:end}),
      getHistoricalTakerRange(s,{period:'1h',startTime:from,endTime:end}),
      getHistoricalTakerRange(s,{period:'15m',startTime:from,endTime:end}),
      getHistoricalFundingRange(s,{startTime:from,endTime:end}),
      getKlinesRange(s,'15m',{startTime:from,endTime:end})
    ]);
    const oiRows=oi.rows||[],t1Rows=t1.rows||[],t15Rows=t15.rows||[],fundRows=funding.rows||[],spotRows=spot.rows||[];
    const timeline=[];
    for(let cutoff=start;cutoff<=end;cutoff+=Math.max(60000,Number(stepMs)||900000)){
      const latestFunding=latestAt(fundRows,cutoff,'fundingTime');
      const taker1h=t1Rows.filter(x=>(finite(x?.timestamp)||0)<=cutoff).slice(-12).map(x=>({timestamp:finite(x.timestamp),ratio:finite(x.buySellRatio)??(finite(x.sellVol)>0?finite(x.buyVol)/finite(x.sellVol):null),buyVol:finite(x.buyVol),sellVol:finite(x.sellVol)}));
      const taker15m=t15Rows.filter(x=>(finite(x?.timestamp)||0)<=cutoff).slice(-20).map(x=>({timestamp:finite(x.timestamp),ratio:finite(x.buySellRatio)??(finite(x.sellVol)>0?finite(x.buyVol)/finite(x.sellVol):null),buyVol:finite(x.buyVol),sellVol:finite(x.sellVol)}));
      const profile={oi1hPct:pctFromSeries(oiRows,cutoff,1),oi4hPct:pctFromSeries(oiRows,cutoff,4),oi8hPct:pctFromSeries(oiRows,cutoff,8),oi12hPct:pctFromSeries(oiRows,cutoff,12),oi24hPct:pctFromSeries(oiRows,cutoff,24),taker1h,taker15m,fundingRate:finite(latestFunding?.fundingRate)!=null?finite(latestFunding.fundingRate)*100:null,trueTakerSource:'Binance historical futures/data/takerlongshortRatio'};
      timeline.push({availableAt:cutoff,derivativesProfile:profile,spot15m:spotRows.filter(r=>(finite(Array.isArray(r)?r[6]:r?.closeTime)||Infinity)<=cutoff).slice(-64),execution:null,intelligence:null,eventRisk:null,data:{stale:false},historicalCoverage:{oi:true,taker1h:true,taker15m:true,funding:true,spotVolume:true,execution:false}});
    }
    return{symbol:s,startTime:start,endTime:end,timeline,coverage:{oiRows:oiRows.length,taker1hRows:t1Rows.length,taker15mRows:t15Rows.length,fundingRows:fundRows.length,spot15mRows:spotRows.length,executionHistorical:false},pages:{oi:oi.pages,taker1h:t1.pages,taker15m:t15.pages,funding:funding.pages,spot:spot.pages}};
  }
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
    getUniverse,getHistoricalFrames,getHistoricalFramesRange,getKlinesAt,getKlinesRange,getHistoricalOiRange,getHistoricalTakerRange,getHistoricalFundingRange,buildHistoricalContextTimeline,getDerivativesContext,provenance,
    estimateExecutionCost:executionCostModel,
    lineagePolicy:Object.freeze({events:['LIST','DELIST','SYMBOL_CHANGE','TOKEN_SWAP','REDENOMINATION'],unknown:'FLAG_AND_EXCLUDE_FROM_POINT_IN_TIME_TEST'}),
    sessionPolicy:Object.freeze({continuous:true,label:'24x7',anchor:'UTC 00:00',kstViewAnchor:'KST 09:00'})
  };
}

module.exports={
  DEFAULT_SPOT_BASES,DEFAULT_FUTURES_BASES,cleanMarketType,normalizeExchangeInfo,executionCostModel,createCryptoResearchDataEngine
};

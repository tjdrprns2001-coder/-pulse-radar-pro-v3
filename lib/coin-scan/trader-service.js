'use strict';
const Engine=require('./trader-engine.js');
const {createBinanceProvider}=require('./binance-provider.js');
const bad=message=>Object.assign(new Error(message),{statusCode:400});
function createTraderService({provider,now=()=>Date.now()}={}){
  // No spot or cross-exchange substitution: futures identity stays explicit.
  provider=provider||createBinanceProvider({now,concurrency:2,intervalConcurrency:2,disableSpotRest:true,disableFuturesFallback:true,futuresBases:['https://fapi.binance.com','https://www.binance.com','https://fapi1.binance.com','https://fapi2.binance.com','https://fapi3.binance.com','https://fapi4.binance.com'],
    // Keep the canonical fapi host first, then fall through to the official www gateway
    // and alternate fapi hosts when a serverless egress location receives HTTP 451.
    fetchImpl:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(7000)})});
  const cache=new Map(),inflight=new Map();const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function memo(key,ttl,fn){
    const hit=cache.get(key);if(hit&&now()-hit.at<ttl)return hit.value;
    if(inflight.has(key))return inflight.get(key);
    const p=Promise.resolve().then(fn).then(value=>{if(cache.size>256)cache.delete(cache.keys().next().value);cache.set(key,{at:now(),value});return value}).finally(()=>inflight.delete(key));
    inflight.set(key,p);return p;
  }
  async function pool(items,fn){let index=0;const out=new Array(items.length);await Promise.all(Array.from({length:Math.min(2,items.length)},async()=>{while(index<items.length){const i=index++;out[i]=await fn(items[i])}}));return out}
  const clean=s=>String(s||'').toUpperCase();
  async function market(){return memo('market',30000,async()=>{
    const [info,tickers]=await Promise.all([provider.getFuturesUniverse(),provider.getFuturesTickers()]);
    if(!Array.isArray(info?.symbols)||!Array.isArray(tickers))throw new Error('Invalid Binance futures response');
    const universe=info.symbols.filter(x=>x.status==='TRADING'&&x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT');
    const tickerMap=new Map(tickers.map(x=>[x.symbol,x]));
    const benchmarks={};
    await pool(['BTCUSDT','ETHUSDT'],async s=>{try{benchmarks[s]=await provider.getFuturesKlines(s,'4h',160)}catch{benchmarks[s]=[]}});
    return{universe,tickerMap,regime:Engine.regimeFromFrames(benchmarks,now()),asOf:now()};
  })}
  function filterReason(symbol,ticker){
    if(!ticker||Engine.num(ticker.quoteVolume)==null||Engine.num(ticker.priceChangePercent)==null||Engine.num(ticker.closeTime)==null||now()-ticker.closeTime>120000||ticker.closeTime>now()+60000)return 'DATA_GAP';
    if(Number(ticker.quoteVolume)<Engine.RULES.minQuoteVolume)return 'ILLIQUID';
    if(Math.abs(Number(ticker.priceChangePercent))>8)return 'EXTENDED';
    return null;
  }
  async function summary(){
    const m=await market(),excluded={},scanRows=[];let eligibleCount=0;
    for(const row of m.universe){
      const t=m.tickerMap.get(row.symbol),reason=filterReason(row.symbol,t);
      if(reason)excluded[reason]=(excluded[reason]||0)+1;else eligibleCount++;
      scanRows.push({symbol:row.symbol,price:Engine.num(t?.lastPrice),change24h:Engine.num(t?.priceChangePercent),
        quoteVolume24h:Engine.num(t?.quoteVolume),prefilterReason:reason});
    }
    scanRows.sort((a,b)=>(b.quoteVolume24h||0)-(a.quoteVolume24h||0)||a.symbol.localeCompare(b.symbol));
    return{status:'ok',version:Engine.VERSION,asOf:m.asOf,source:'Binance USDT perpetual futures',regime:m.regime,
      universeCount:m.universe.length,eligibleCount,excludedCount:m.universe.length-eligibleCount,excluded,
      candidates:scanRows,lightLimit:0,deepLimit:scanRows.length,fullUniverseScan:true,timeframes:Object.keys(Engine.TF_MS),rules:Engine.RULES,
      coverageNote:'Binance USDT 무기한 TRADING 전 종목을 24H 사전분류하고, 거래대금·과진행 필터 통과 종목은 1W·1D·4H·1H·15m·5m 6TF 정밀검사. 조건 미달도 제외 사유를 보존'};
  }
  async function validate(symbol,m){if(!/^[A-Z0-9]{2,30}USDT$/.test(symbol)||!m.universe.some(x=>x.symbol===symbol))throw bad('Symbol is not in Binance USDT perpetual universe')}
  async function light(symbols){
    if(!Array.isArray(symbols)||symbols.length===0||symbols.length>4)throw bad('Supply one to four symbols');
    const m=await market(),list=[...new Set(symbols.map(clean))];
    for(const s of list)await validate(s,m);
    const items=await pool(list,async symbol=>{
      const excluded=filterReason(symbol,m.tickerMap.get(symbol));if(excluded)return{symbol,eligible:false,reason:excluded,score:0};
      return memo('light:'+symbol,45000,async()=>{
        const frames={};await pool(['4h','1h'],async tf=>{try{frames[tf]=await provider.getFuturesKlines(symbol,tf,160)}catch{frames[tf]=[]}});
        const h=Engine.frameStats(frames['1h'],'1h',now()),q=Engine.frameStats(frames['4h'],'4h',now());
        const available=h.available&&q.available,held=q.trend!=='DOWN';
        const distance=h.atr>0?Math.abs(h.close-h.ema20)/h.atr:null;
        const score=(q.trend==='UP'?30:0)+(h.trend==='UP'?20:0)+(h.compression<=3.5?20:0)+(distance!=null&&distance<=1.5?20:0)+(h.obvUp?10:0);
        return{symbol,eligible:available&&held,score,reason:!available?'DATA_GAP':!held?'HTF_DOWN':null,trend4h:q.trend,trend1h:h.trend};
      });
    });
    return{status:'ok',items,asOf:now()};
  }
  async function deep(symbol){
    symbol=clean(symbol);const m=await market();await validate(symbol,m);
    return memo('deep:'+symbol,20000,async()=>{
      const ticker=m.tickerMap.get(symbol)||{},prefilter=filterReason(symbol,ticker);
      if(prefilter){
        const blocker=prefilter==='ILLIQUID'?'24H 거래대금 1천만 USDT 미만':prefilter==='EXTENDED'?'24H ±8% 범위 이탈':'사전 데이터 부족';
        const item={version:Engine.VERSION,symbol,state:prefilter==='DATA_GAP'?'DATA_GAP':'EXCLUDED',score:0,setup:{type:'NONE',label:'사전 필터 제외',valid:false},price:Engine.num(ticker.lastPrice),change24h:Engine.num(ticker.priceChangePercent),quoteVolume24h:Engine.num(ticker.quoteVolume),asOf:now(),stats:{},flow:{oi4hPct:null,takerRatio:null,takerBuy:false,funding8hPct:null},regime:m.regime?.state||'UNKNOWN',plan:null,reasons:[],missing:prefilter==='DATA_GAP'?['현재 선물 시세 누락·지연']:[],blockers:prefilter==='DATA_GAP'?[]:[blocker],waiting:[],chart:[],researchOnly:true,prefilterReason:prefilter};
        return{status:'ok',item,errors:[],source:'Binance futures',asOf:item.asOf};
      }
      const frames={},errors=[];
      for(const tf of Object.keys(Engine.TF_MS)){try{frames[tf]=await provider.getFuturesKlines(symbol,tf,160)}catch(e){frames[tf]=[];errors.push(tf+': '+String(e.message||e))}await sleep(90)}
      let d={status:'rejected',reason:null},e={status:'rejected',reason:null},f={status:'rejected',reason:null};
      try{d={status:'fulfilled',value:await provider.getV2DerivativesProfile(symbol)}}catch(err){d={status:'rejected',reason:err}}await sleep(90);
      try{e={status:'fulfilled',value:await provider.getFuturesExecution(symbol)}}catch(err){e={status:'rejected',reason:err}}await sleep(90);
      try{f={status:'fulfilled',value:await memo('funding-info',60000,()=>provider.getFundingInfoMap({strict:true}))}}catch(err){f={status:'rejected',reason:err}};
      // Binance fundingInfo lists adjusted intervals; successfully absent means the standard 8h.
      const interval=f.status==='fulfilled'?(f.value.has(symbol)?f.value.get(symbol):8):null;
      const item=Engine.evaluate({symbol,frames,ticker:m.tickerMap.get(symbol)||{},regime:m.regime,
        derivatives:d.status==='fulfilled'?d.value:{},execution:e.status==='fulfilled'?e.value:{},fundingIntervalHours:interval,now:now()});
      return{status:'ok',item,errors,source:'Binance futures',asOf:item.asOf};
    });
  }
  async function deepBatch(symbols){
    if(!Array.isArray(symbols)||symbols.length===0||symbols.length>4)throw bad('Supply one to four symbols');
    const list=[...new Set(symbols.map(clean))];
    const rows=[];for(const symbol of list){const row=await (async()=>{
      try{
        const out=await deep(symbol);
        return{symbol,ok:true,item:out.item,errors:out.errors||[]};
      }catch(e){
        const message=String(e?.message||e);
        return{symbol,ok:false,error:message,item:{symbol,state:'DATA_GAP',score:0,asOf:now(),reasons:[],waiting:[],blockers:[],missing:['정밀 데이터 조회 실패: '+message]}};
      }
    })();rows.push(row);await sleep(120)}
    return{status:'ok',items:rows.map(x=>x.item),errors:rows.filter(x=>!x.ok).map(x=>({symbol:x.symbol,error:x.error})),
      source:'Binance futures',asOf:now()};
  }
  return{summary,light,deep,deepBatch};
}
let singleton;
function defaultTraderService(){return singleton||(singleton=createTraderService())}
module.exports={createTraderService,defaultTraderService};

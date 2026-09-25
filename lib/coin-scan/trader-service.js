'use strict';
const Engine=require('./trader-engine.js');
const {createBinanceProvider}=require('./binance-provider.js');
const bad=message=>Object.assign(new Error(message),{statusCode:400});
function createTraderService({provider,now=()=>Date.now()}={}){
  // No spot or cross-exchange substitution: futures identity stays explicit.
  provider=provider||createBinanceProvider({now,concurrency:2,intervalConcurrency:2,disableSpotRest:true,
    // Keep the canonical fapi host first, then fall through to the official www gateway
    // and alternate fapi hosts when a serverless egress location receives HTTP 451.
    fetchImpl:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(7000)})});
  const cache=new Map(),inflight=new Map();
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
    if(['BTCUSDT','ETHUSDT'].includes(symbol))return 'BENCHMARK';
    if(!ticker||Engine.num(ticker.quoteVolume)==null||Engine.num(ticker.priceChangePercent)==null||Engine.num(ticker.closeTime)==null||now()-ticker.closeTime>120000||ticker.closeTime>now()+60000)return 'DATA_GAP';
    if(Number(ticker.quoteVolume)<Engine.RULES.minQuoteVolume)return 'ILLIQUID';
    if(Math.abs(Number(ticker.priceChangePercent))>8)return 'EXTENDED';
    return null;
  }
  async function summary(){
    const m=await market(),excluded={},eligible=[];
    for(const row of m.universe){const t=m.tickerMap.get(row.symbol),reason=filterReason(row.symbol,t);if(reason){excluded[reason]=(excluded[reason]||0)+1;continue}
      eligible.push({symbol:row.symbol,price:Engine.num(t.lastPrice),change24h:Engine.num(t.priceChangePercent),quoteVolume24h:Engine.num(t.quoteVolume)});
    }
    eligible.sort((a,b)=>b.quoteVolume24h-a.quoteVolume24h||a.symbol.localeCompare(b.symbol));
    // Preserve liquid leaders while rotating the tail, avoiding an immutable top-cap list.
    const head=eligible.slice(0,24),tail=eligible.slice(24),offset=tail.length?(Math.floor(now()/600000)*24)%tail.length:0;
    const rotated=tail.slice(offset).concat(tail.slice(0,offset)).slice(0,24);
    return{status:'ok',version:Engine.VERSION,asOf:m.asOf,source:'Binance USDT perpetual futures',regime:m.regime,
      universeCount:m.universe.length,eligibleCount:eligible.length,excludedCount:m.universe.length-eligible.length,excluded,
      candidates:[...head,...rotated],lightLimit:48,deepLimit:18,rules:Engine.RULES,
      coverageNote:'전체 선물 시세 필터 → 유동성 상위 24 + 순환 24개 예비검사 → 상위 최대 18개 6TF 정밀검사'};
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
      const frames={},errors=[];
      await pool(Object.keys(Engine.TF_MS),async tf=>{try{frames[tf]=await provider.getFuturesKlines(symbol,tf,160)}catch(e){frames[tf]=[];errors.push(tf+': '+String(e.message||e))}});
      const [d,e,f]=await Promise.allSettled([provider.getV2DerivativesProfile(symbol),provider.getFuturesExecution(symbol),memo('funding-info',60000,()=>provider.getFundingInfoMap({strict:true}))]);
      // Binance fundingInfo lists adjusted intervals; successfully absent means the standard 8h.
      const interval=f.status==='fulfilled'?(f.value.has(symbol)?f.value.get(symbol):8):null;
      const item=Engine.evaluate({symbol,frames,ticker:m.tickerMap.get(symbol)||{},regime:m.regime,
        derivatives:d.status==='fulfilled'?d.value:{},execution:e.status==='fulfilled'?e.value:{},fundingIntervalHours:interval,now:now()});
      return{status:'ok',item,errors,source:'Binance futures',asOf:item.asOf};
    });
  }
  return{summary,light,deep};
}
let singleton;
function defaultTraderService(){return singleton||(singleton=createTraderService())}
module.exports={createTraderService,defaultTraderService};

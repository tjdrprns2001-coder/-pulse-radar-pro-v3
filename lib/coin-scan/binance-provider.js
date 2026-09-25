'use strict';
const {createTtlCache}=require('./cache.js');
const Sample=require('./sample-engine.js');
const CrossOi=require('./cross-oi-provider.js');
const MarketIntel=require('./market-intelligence-provider.js');
const MacroCalendar=require('./macro-calendar-provider.js');
const VerifiedNews=require('./verified-news-provider.js');
const Resilience=require('./source-resilience.js');
const CrossIndicators=require('./cross-indicator-provider.js');
const DEFAULT_BASES=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com','https://api4.binance.com'];
const DEFAULT_FUTURES_BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com','https://fapi3.binance.com','https://fapi4.binance.com'];
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function createBinanceProvider({fetchImpl=globalThis.fetch,now=()=>Date.now(),concurrency=4,cache=createTtlCache({now}),bases=DEFAULT_BASES,futuresBase=DEFAULT_FUTURES_BASES[0],futuresBases=null,crossOiProvider=null,env=process.env,disableSpotRest=false}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const limit=Math.max(1,Math.floor(Number(concurrency)||4));
  const xoi=crossOiProvider||CrossOi.createCrossOiProvider({fetchImpl,cache});
  const marketIntel=MarketIntel.createMarketIntelligenceProvider({fetchImpl,cache,now});
  const macroCalendar=MacroCalendar.createMacroCalendarProvider({fetchImpl,cache,now});
  const verifiedNews=VerifiedNews.createVerifiedNewsProvider({fetchImpl,env,now,cache});
  const crossIndicators=CrossIndicators.createCrossIndicatorProvider({fetchImpl,cache});
  const fapiBases=Array.isArray(futuresBases)&&futuresBases.length?futuresBases:(futuresBase&&futuresBase!==DEFAULT_FUTURES_BASES[0]?[futuresBase]:DEFAULT_FUTURES_BASES);
  let futuresBlockedUntil=0,lastFuturesError=null,marketFallbackUsed=false;
  async function request(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;let lastError;for(const base of bases){try{const res=await fetchImpl(base+path);if(!res||!res.ok){lastError=new Error(`HTTP ${res&&res.status||'ERR'}`);continue}const data=await res.json();cache.set(key,data,ttlMs);return data}catch(e){lastError=e}}throw lastError||new Error('Binance request failed')}
  async function futuresRequest(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;if(now()<futuresBlockedUntil)throw lastFuturesError||new Error('Binance Futures temporarily blocked');let lastError=null,lastStatus=null;for(const base of fapiBases){try{const res=await fetchImpl(base+path);if(!res||!res.ok){lastStatus=Number(res&&res.status)||null;lastError=new Error(`Futures HTTP ${res&&res.status||'ERR'}`);continue}const data=await res.json();cache.set(key,data,ttlMs);lastFuturesError=null;futuresBlockedUntil=0;return data}catch(e){lastError=e}}if([403,451].includes(lastStatus)){lastFuturesError=lastError||new Error('Binance Futures blocked');futuresBlockedUntil=now()+300000}throw lastError||new Error('Binance Futures request failed')}
  async function futuresOrSpot(futuresPath,spotPath,ttlMs,key){try{return await futuresRequest(futuresPath,ttlMs,'futures:'+key)}catch(e){marketFallbackUsed=true;return request(spotPath,ttlMs,'spot-fallback:'+key)}}
  async function getSpotUniverse(){return disableSpotRest?{timezone:'UTC',serverTime:now(),symbols:[]}:request('/api/v3/exchangeInfo',300000,'spot:exchangeInfo')}
  async function getFuturesUniverse(){return futuresRequest('/fapi/v1/exchangeInfo',300000,'futures:exchangeInfo')}
  async function getSpotTickers(){return disableSpotRest?[]:request('/api/v3/ticker/24hr',30000,'spot:ticker24hr')}
  async function getFuturesTickers(){return futuresRequest('/fapi/v1/ticker/24hr',30000,'futures:ticker24hr')}
  async function getUniverse(){return futuresOrSpot('/fapi/v1/exchangeInfo','/api/v3/exchangeInfo',300000,'exchangeInfo')}
  async function getTickers(){return futuresOrSpot('/fapi/v1/ticker/24hr','/api/v3/ticker/24hr',30000,'ticker24hr')}
  async function getSpotKlines(symbol,interval,rows=120){if(disableSpotRest)throw new Error('Spot REST disabled');const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1500,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;return request('/api/v3/klines'+qs,ttl,`spot:klines:${s}:${tf}:${n}`)}
  async function getFuturesKlines(symbol,interval,rows=120){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1500,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;return futuresRequest('/fapi/v1/klines'+qs,ttl,`futures:klines:${s}:${tf}:${n}`)}
  async function getKlines(symbol,interval,rows=120){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1500,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;return futuresOrSpot('/fapi/v1/klines'+qs,'/api/v3/klines'+qs,ttl,`klines:${s}:${tf}:${n}`)}
  async function getKlinesAt(symbol,interval,{endTime,rows=120}={}){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),end=finite(endTime),n=Math.max(2,Math.min(1500,Number(rows)||120));if(!s||end==null)throw new Error('historical symbol and endTime required');const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}&endTime=${Math.floor(end)}`;return futuresOrSpot('/fapi/v1/klines'+qs,'/api/v3/klines'+qs,300000,`hist:${s}:${tf}:${n}:${Math.floor(end)}`)}
  function deepRowsForInterval(tf){return tf==='1d'?1500:tf==='5m'?300:420}
  async function getHistoricalFrames(symbol,{simulatedTs}={}){const end=finite(simulatedTs);if(end==null)throw new Error('simulatedTs required');const intervals=['1w','3d','1d','12h','4h','1h','15m','5m'];const frames={};for(const tf of intervals)frames[tf]=await getKlinesAt(symbol,tf,{endTime:end+1,rows:deepRowsForInterval(tf)});return frames}
  async function getFundingMap(){const rows=await futuresRequest('/fapi/v1/premiumIndex',60000,'futures:premiumIndex');const map=new Map();for(const x of Array.isArray(rows)?rows:[rows])if(x&&x.symbol){const rate=finite(x.lastFundingRate);if(rate!=null)map.set(String(x.symbol).toUpperCase(),rate*100)}return map}
  async function getFundingInfoMap(){try{const rows=await futuresRequest('/fapi/v1/fundingInfo',300000,'futures:fundingInfo');const map=new Map();for(const x of Array.isArray(rows)?rows:[])if(x&&x.symbol)map.set(String(x.symbol).toUpperCase(),finite(x.fundingIntervalHours));return map}catch{return new Map()}}
  async function getOiChange(symbol){const s=String(symbol||'').toUpperCase();try{const rows=await futuresRequest(`/futures/data/openInterestHist?symbol=${encodeURIComponent(s)}&period=5m&limit=13`,45000,`futures:oi:${s}`);if(!Array.isArray(rows)||rows.length<2)return null;const first=finite(rows[0].sumOpenInterest),last=finite(rows[rows.length-1].sumOpenInterest);return first&&last!=null?((last/first)-1)*100:null}catch{return null}}
  async function getOiProfile(symbol){const s=String(symbol||'').toUpperCase();try{const rows=await futuresRequest(`/futures/data/openInterestHist?symbol=${encodeURIComponent(s)}&period=15m&limit=32`,45000,`futures:oi15:${s}`);return Sample.deriveOiProfile(Array.isArray(rows)?rows:[])}catch{return Sample.deriveOiProfile([])}}
  async function getTakerProfile(symbol){const s=String(symbol||'').toUpperCase();try{const rows=await futuresRequest(`/futures/data/takerlongshortRatio?symbol=${encodeURIComponent(s)}&period=15m&limit=32`,45000,`futures:taker15:${s}`);return Sample.deriveTakerProfile(Array.isArray(rows)?rows:[])}catch{return Sample.deriveTakerProfile([])}}
  async function getCrossOiProfile(symbol){try{return await xoi.getProfile(String(symbol||'').toUpperCase())}catch{return Sample.normalizeXoiProfile({})}}
  async function getV2OiProfile(symbol){
    const s=String(symbol||'').toUpperCase();
    try{
      const rows=await futuresRequest('/futures/data/openInterestHist?symbol='+encodeURIComponent(s)+'&period=1h&limit=25',45000,'futures:v2:oi1h:'+s);
      const a=Array.isArray(rows)?rows:[];const val=x=>finite(x&&x.sumOpenInterest);const pct=n=>a.length>=n+1&&val(a[a.length-1-n])?((val(a[a.length-1])/val(a[a.length-1-n]))-1)*100:null;
      const values=a.map(val).filter(Number.isFinite);let dd=null;if(values.length){const peak=Math.max(...values),last=values[values.length-1];dd=peak?((last/peak)-1)*100:null}
      return{rows:a,oi1hPct:pct(1),oi4hPct:pct(4),oi8hPct:pct(8),oi12hPct:pct(12),oi24hPct:pct(24),oiDrawdownPct:dd};
    }catch{return{rows:[],oi1hPct:null,oi4hPct:null,oi8hPct:null,oi12hPct:null,oi24hPct:null,oiDrawdownPct:null}}
  }
  async function getV2TakerSeries(symbol,period='1h',limitRows=12){
    const s=String(symbol||'').toUpperCase();
    try{const rows=await futuresRequest('/futures/data/takerlongshortRatio?symbol='+encodeURIComponent(s)+'&period='+encodeURIComponent(period)+'&limit='+Math.max(3,Math.min(100,Number(limitRows)||12)),45000,'futures:v2:taker:'+s+':'+period+':'+limitRows);return(Array.isArray(rows)?rows:[]).map(x=>{const buyVol=finite(x.buyVol),sellVol=finite(x.sellVol),ratio=buyVol!=null&&sellVol>0?buyVol/sellVol:finite(x.buySellRatio);return{timestamp:finite(x.timestamp),ratio,buyVol,sellVol,ratioSource:buyVol!=null&&sellVol>0?'buyVol/sellVol':'buySellRatio'}})}catch{return[]}
  }
  async function getV2DerivativesProfile(symbol,fundingMap){
    const s=String(symbol||'').toUpperCase();let map=fundingMap;try{if(!map)map=await getFundingMap()}catch{map=new Map()}
    const [oi,taker1h,taker15m]=await Promise.all([getV2OiProfile(s),getV2TakerSeries(s,'1h',12),getV2TakerSeries(s,'15m',20)]);
    return{...oi,taker1h,taker15m,fundingRate:map.get(s)??null,trueTakerSource:'Binance futures/data/takerlongshortRatio · buyVol/sellVol'};
  }
  function executionFromBook(book={},depth={},notionals=[1000,10000,50000]){
    const bid=finite(book.bidPrice),ask=finite(book.askPrice),mid=bid!=null&&ask!=null?(bid+ask)/2:null,spreadBps=mid&&ask>=bid?((ask-bid)/mid)*10000:null;
    function sideDepth(rows,side,bps){
      if(mid==null)return null;const limit=side==='ask'?mid*(1+bps/10000):mid*(1-bps/10000);let usd=0;
      for(const r of Array.isArray(rows)?rows:[]){const p=finite(r?.[0]),q=finite(r?.[1]);if(p==null||q==null)continue;if(side==='ask'&&p>limit)break;if(side==='bid'&&p<limit)break;usd+=p*q}
      return usd;
    }
    function simulate(rows,side,notional){
      let left=Number(notional)||0,cost=0,qty=0;if(!left||mid==null)return null;
      for(const r of Array.isArray(rows)?rows:[]){const p=finite(r?.[0]),q=finite(r?.[1]);if(p==null||q==null||p<=0||q<=0)continue;const cap=p*q,take=Math.min(left,cap);cost+=take;qty+=take/p;left-=take;if(left<=1e-9)break}
      if(left>1e-6||qty<=0)return null;const avg=cost/qty,slip=side==='buy'?((avg/mid)-1)*10000:((mid/avg)-1)*10000;return{notional:Number(notional),avgPrice:avg,slippageBps:slip}
    }
    return{available:mid!=null,observedAt:now(),bid,ask,mid,spreadBps,depthUsd:{bid10bps:sideDepth(depth.bids,'bid',10),ask10bps:sideDepth(depth.asks,'ask',10),bid25bps:sideDepth(depth.bids,'bid',25),ask25bps:sideDepth(depth.asks,'ask',25)},slippage:{buy:notionals.map(n=>simulate(depth.asks,'buy',n)),sell:notionals.map(n=>simulate(depth.bids,'sell',n))}};
  }
  async function getSpotExecution(symbol){
    if(disableSpotRest)return{marketType:'spot',available:false,observedAt:now(),reason:'SPOT_REST_DISABLED'};
    const s=String(symbol||'').toUpperCase();try{const [book,depth]=await Promise.all([request('/api/v3/ticker/bookTicker?symbol='+encodeURIComponent(s),10000,'spot:book:'+s),request('/api/v3/depth?symbol='+encodeURIComponent(s)+'&limit=100',10000,'spot:depth:'+s)]);return{marketType:'spot',...executionFromBook(book,depth)}}catch(e){return{marketType:'spot',available:false,observedAt:now(),error:String(e?.message||e)}}
  }
  async function getFuturesExecution(symbol){
    const s=String(symbol||'').toUpperCase();try{const [book,depth]=await Promise.all([futuresRequest('/fapi/v1/ticker/bookTicker?symbol='+encodeURIComponent(s),10000,'futures:book:'+s),futuresRequest('/fapi/v1/depth?symbol='+encodeURIComponent(s)+'&limit=100',10000,'futures:depth:'+s)]);return{marketType:'futures',...executionFromBook(book,depth)}}catch(e){return{marketType:'futures',available:false,observedAt:now(),error:String(e?.message||e)}}
  }
  async function getExecutionContext(symbol,{spotListed=true,futuresListed=true}={}){
    const jobs=[];if(spotListed)jobs.push(getSpotExecution(symbol));if(futuresListed)jobs.push(getFuturesExecution(symbol));const rows=await Promise.all(jobs);return{version:'EXECUTION_CONTEXT_v1',updatedAt:now(),spot:rows.find(x=>x.marketType==='spot')||{marketType:'spot',available:false,reason:'NOT_LISTED'},futures:rows.find(x=>x.marketType==='futures')||{marketType:'futures',available:false,reason:'NOT_LISTED'}};
  }
  async function getFastMarketIntelligence(symbol,{spotTicker=null,futuresTicker=null}={}){
    try{return await marketIntel.getCexCrossCheck(symbol,{binanceSpotTicker:spotTicker,binanceFuturesTicker:futuresTicker})}
    catch(e){return{available:false,sources:[],exchangeCount:0,marketCount:0,error:String(e?.message||e)}}
  }
  async function getDetailedMarketIntelligence(symbol,{spotTicker=null,futuresTicker=null}={}){
    const spotListed=Boolean(spotTicker),futuresListed=Boolean(futuresTicker);
    const [cex,indicators,dex,news,events,wallets,execution,macro,verified]=await Promise.all([
      getFastMarketIntelligence(symbol,{spotTicker,futuresTicker}),
      crossIndicators.get(symbol).catch(e=>({available:false,error:String(e?.message||e),sources:[],timeframes:{}})),
      marketIntel.dex(symbol),
      marketIntel.news(symbol),
      marketIntel.scheduledEvents(symbol),
      marketIntel.walletMovements(symbol),
      getExecutionContext(symbol,{spotListed,futuresListed}),
      macroCalendar.get(),
      verifiedNews.get(symbol)
    ]);
    const mergedNews={available:Boolean(verified?.available||news?.available),provider:'Verified News Stack + CryptoCompare',items:[...(verified?.items||[]),...(news?.items||[]).map(x=>({...x,retrievedAt:x.retrievedAt??now(),verification_status:x.verification_status||'SINGLE_SOURCE',source_tier:x.source_tier||5}))],verifiedSources:verified?.sources||null,status:verified?.status||null,error:verified?.status==='DEGRADED'?'VERIFIED_NEWS_DEGRADED':news?.error||null};
    const newsEvents=marketIntel.deriveNewsEvents(mergedNews),walletVerification=marketIntel.walletVerification(wallets,dex),stamp=now();
    const sourceRows=[
      {name:'cex',status:cex?.available?(cex?.maxPriceDispersionPct!=null&&cex.maxPriceDispersionPct>.35?'CONFLICTED':'FRESH'):'STALE'},
      {name:'execution',status:(execution?.spot?.available||execution?.futures?.available)?'FRESH':'STALE'},
      {name:'macroCalendar',status:macro?.available?'FRESH':'UNKNOWN'}
    ];
    if(mergedNews?.error)sourceRows.push({name:'news',status:'DEGRADED',reason:mergedNews.error});
    if(wallets?.reason||wallets?.error)sourceRows.push({name:'wallets',status:'DEGRADED',reason:wallets.reason||wallets.error});
    const sourceHealth=Resilience.aggregateHealth(sourceRows.map(x=>({...x,blocking:['cex','execution','macroCalendar'].includes(x.name)&&['STALE','UNKNOWN','CONFLICTED'].includes(x.status)})));
    return{symbol:String(symbol||'').toUpperCase(),updatedAt:stamp,cex,indicators,dex,news:mergedNews,events:{...events,newsDerived:newsEvents},macroCalendar:macro,wallets,walletVerification,execution,sourceHealth,coverage:{cex:Boolean(cex?.available),indicators:Boolean(indicators?.available),dex:Boolean(dex?.available),news:Boolean(mergedNews?.available),scheduledEvents:Boolean(events?.available),macroCalendar:Boolean(macro?.available),wallets:Boolean(wallets?.available),execution:Boolean(execution?.spot?.available||execution?.futures?.available)}};
  }
  async function getDerivativesContext(symbol,fundingMap){
    const s=String(symbol||'').toUpperCase();let map=fundingMap;
    try{if(!map)map=await getFundingMap()}catch{map=new Map()}
    const fundingPct=map.get(s)??null;
    const [oiChangePct,oiProfile,takerProfile,xoiProfile,v2Profile]=await Promise.all([getOiChange(s),getOiProfile(s),getTakerProfile(s),getCrossOiProfile(s),getV2DerivativesProfile(s,map)]);
    return{oiChangePct,fundingPct,derivativesProfile:{oiProfile,takerProfile,xoiProfile,v2Profile},v2Profile};
  }
  async function mapLimit(items,worker){const src=Array.from(items||[]),out=new Array(src.length);let next=0;async function run(){while(true){const i=next++;if(i>=src.length)return;out[i]=await worker(src[i],i)}}await Promise.all(Array.from({length:Math.min(limit,src.length||1)},run));return out}
  async function scanDeepCandidates(symbols,intervals=['1w','1d','4h','1h','15m','5m'],marketBySymbol={},tickerBySymbol={}){const results={},errors=[],contexts={};let fundingMap=new Map();try{fundingMap=await getFundingMap()}catch{}await mapLimit(symbols,async symbol=>{const frames={},scope=String(marketBySymbol?.[symbol]||'futures');for(const interval of intervals){try{frames[interval]=scope==='spot'?await getSpotKlines(symbol,interval,deepRowsForInterval(interval)):await getKlines(symbol,interval,deepRowsForInterval(interval))}catch(e){errors.push({symbol,interval,error:String(e&&e.message||e)})}}if(Object.keys(frames).length){results[symbol]=frames;const tick=tickerBySymbol?.[symbol]||{},marketIntelligence=await getFastMarketIntelligence(symbol,{spotTicker:tick.spotTicker||null,futuresTicker:tick.futuresTicker||null});if(scope==='spot'){const xoiProfile=await getCrossOiProfile(symbol);const v2Profile={rows:[],oi1hPct:null,oi4hPct:null,oi8hPct:null,oi12hPct:null,oi24hPct:null,oiDrawdownPct:null,taker1h:[],taker15m:[],fundingRate:null};contexts[symbol]={oiChangePct:null,fundingPct:null,derivativesProfile:{oiProfile:Sample.deriveOiProfile([]),takerProfile:Sample.deriveTakerProfile([]),xoiProfile,v2Profile},v2Profile,marketScope:'spot',marketIntelligence}}else contexts[symbol]={...(await getDerivativesContext(symbol,fundingMap)),marketScope:scope,marketIntelligence}}});return{results,errors,contexts}}
  function resetSourceState(){marketFallbackUsed=false}
  function getSourceState(){return{marketSource:marketFallbackUsed?'spot-fallback':'futures',futuresBlockedUntil:futuresBlockedUntil||null,lastFuturesError:lastFuturesError?String(lastFuturesError.message||lastFuturesError):null}}
  return{getUniverse,getTickers,getSpotUniverse,getFuturesUniverse,getSpotTickers,getFuturesTickers,getSpotKlines,getFuturesKlines,getKlines,getKlinesAt,deepRowsForInterval,getHistoricalFrames,getFundingMap,getFundingInfoMap,getOiChange,getOiProfile,getTakerProfile,getCrossOiProfile,getV2OiProfile,getV2TakerSeries,getV2DerivativesProfile,getDerivativesContext,getSpotExecution,getFuturesExecution,getExecutionContext,getFastMarketIntelligence,getDetailedMarketIntelligence,mapLimit,scanDeepCandidates,resetSourceState,getSourceState,cache,concurrency:limit};
}
module.exports={DEFAULT_BASES,DEFAULT_FUTURES_BASES,createBinanceProvider};

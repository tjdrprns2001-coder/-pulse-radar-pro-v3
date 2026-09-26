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
function createBinanceProvider({fetchImpl=globalThis.fetch,now=()=>Date.now(),concurrency=4,intervalConcurrency=2,cache=createTtlCache({now}),bases=DEFAULT_BASES,futuresBase=DEFAULT_FUTURES_BASES[0],futuresBases=null,crossOiProvider=null,env=process.env,disableSpotRest=false,disableFuturesFallback=false}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const limit=Math.max(1,Math.floor(Number(concurrency)||4)),intervalLimit=Math.max(1,Math.min(4,Math.floor(Number(intervalConcurrency)||2)));
  const xoi=crossOiProvider||CrossOi.createCrossOiProvider({fetchImpl,cache});
  const marketIntel=MarketIntel.createMarketIntelligenceProvider({fetchImpl,cache,now});
  const macroCalendar=MacroCalendar.createMacroCalendarProvider({fetchImpl,cache,now});
  const verifiedNews=VerifiedNews.createVerifiedNewsProvider({fetchImpl,env,now,cache});
  const crossIndicators=CrossIndicators.createCrossIndicatorProvider({fetchImpl,cache});
  const fapiBases=Array.isArray(futuresBases)&&futuresBases.length?futuresBases:(futuresBase&&futuresBase!==DEFAULT_FUTURES_BASES[0]?[futuresBase]:DEFAULT_FUTURES_BASES);
  let futuresBlockedUntil=0,lastFuturesError=null,marketFallbackUsed=false,futuresFallbackUsed=false;const futuresBaseBlockedUntil=new Map(),inflight=new Map();
  const BYBIT_BASE='https://api.bybit.com';
  async function bybitRequest(path,ttlMs,key){
    const cacheKey='bybit:'+key,cached=cache.get(cacheKey);if(cached!=null)return cached;
    const flightKey='bybit:'+key;if(inflight.has(flightKey))return inflight.get(flightKey);
    const task=(async()=>{const signal=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(8000):undefined;const res=await fetchImpl(BYBIT_BASE+path,{headers:{accept:'application/json','user-agent':'PulseRadar-Pro-v5'},signal});if(!res?.ok)throw new Error('Bybit HTTP '+(res?.status||'ERR'));const body=await res.json();if(Number(body?.retCode)!==0)throw new Error('Bybit '+String(body?.retMsg||body?.retCode||'error'));cache.set(cacheKey,body,ttlMs);futuresFallbackUsed=true;return body})().finally(()=>{if(inflight.get(flightKey)===task)inflight.delete(flightKey)});inflight.set(flightKey,task);return task;
  }
  function tfMs(tf){return({'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000})[String(tf||'').toLowerCase()]||3600000}
  function bybitInterval(tf){return({'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','1d':'D','3d':'D','1w':'W'})[String(tf||'').toLowerCase()]||'60'}
  async function getBybitUniverse(){
    const body=await bybitRequest('/v5/market/instruments-info?category=linear&limit=1000',300000,'linear:instruments');
    const list=body?.result?.list||[];
    return{timezone:'UTC',serverTime:now(),symbols:list.filter(x=>String(x?.quoteCoin)==='USDT'&&String(x?.status)==='Trading'&&/Perpetual/i.test(String(x?.contractType||''))).map(x=>({symbol:String(x.symbol||'').toUpperCase(),status:'TRADING',contractType:'PERPETUAL',baseAsset:String(x.baseCoin||''),quoteAsset:'USDT'})),_fallbackSource:'BYBIT_LINEAR'};
  }
  async function getBybitTickers(){
    const body=await bybitRequest('/v5/market/tickers?category=linear',30000,'linear:tickers');
    return(body?.result?.list||[]).filter(x=>String(x?.symbol||'').endsWith('USDT')).map(x=>({symbol:String(x.symbol||'').toUpperCase(),lastPrice:x.lastPrice,priceChangePercent:finite(x.price24hPcnt)!=null?finite(x.price24hPcnt)*100:null,quoteVolume:x.turnover24h,closeTime:now(),lastFundingRate:x.fundingRate,_fallbackSource:'BYBIT_LINEAR'}));
  }
  async function getBybitKlines(symbol,interval,rows=120){
    const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h').toLowerCase(),iv=bybitInterval(tf),n=Math.max(2,Math.min(1000,Number(rows)||120));
    const body=await bybitRequest('/v5/market/kline?category=linear&symbol='+encodeURIComponent(s)+'&interval='+encodeURIComponent(iv)+'&limit='+n,45000,'kline:'+s+':'+tf+':'+n);
    let list=(body?.result?.list||[]).slice().reverse();
    if(tf==='3d'&&list.length){
      const daily=list;const rolled=[];for(let i=0;i<daily.length;i+=3){const g=daily.slice(i,i+3);if(g.length<3)continue;const ot=Number(g[0][0]),ct=Number(g[g.length-1][0])+86400000-1;rolled.push([ot,g[0][1],Math.max(...g.map(x=>Number(x[2]))),Math.min(...g.map(x=>Number(x[3]))),g[g.length-1][4],g.reduce((a,x)=>a+Number(x[5]||0),0),ct,g.reduce((a,x)=>a+Number(x[6]||0),0),null,null,null])}list=rolled;
    }else list=list.map(x=>{const ot=Number(x[0]);return[ot,x[1],x[2],x[3],x[4],x[5],ot+tfMs(tf)-1,x[6],null,null,null]});
    return list;
  }
  async function getBybitOiProfile(symbol){
    const s=String(symbol||'').toUpperCase();const body=await bybitRequest('/v5/market/open-interest?category=linear&symbol='+encodeURIComponent(s)+'&intervalTime=1h&limit=25',45000,'oi1h:'+s);
    const rows=(body?.result?.list||[]).slice().reverse().map(x=>({symbol:s,sumOpenInterest:x.openInterest,timestamp:Number(x.timestamp),_fallbackSource:'BYBIT_LINEAR'}));
    const val=x=>finite(x?.sumOpenInterest),pct=n=>rows.length>=n+1&&val(rows[rows.length-1-n])?((val(rows[rows.length-1])/val(rows[rows.length-1-n]))-1)*100:null,values=rows.map(val).filter(Number.isFinite);let dd=null;if(values.length){const peak=Math.max(...values),last=values[values.length-1];dd=peak?((last/peak)-1)*100:null}
    return{rows,oi1hPct:pct(1),oi4hPct:pct(4),oi8hPct:pct(8),oi12hPct:pct(12),oi24hPct:pct(24),oiDrawdownPct:dd,fallbackSource:'BYBIT_LINEAR'};
  }
  async function request(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;const flightKey='spot:'+key;if(inflight.has(flightKey))return inflight.get(flightKey);const task=(async()=>{let lastError;for(const base of bases){try{const res=await fetchImpl(base+path);if(!res||!res.ok){lastError=new Error(`HTTP ${res&&res.status||'ERR'}`);continue}const data=await res.json();cache.set(key,data,ttlMs);return data}catch(e){lastError=e}}throw lastError||new Error('Binance request failed')})().finally(()=>{if(inflight.get(flightKey)===task)inflight.delete(flightKey)});inflight.set(flightKey,task);return task}
  async function futuresRequest(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;const flightKey='futures:'+key;if(inflight.has(flightKey))return inflight.get(flightKey);const task=(async()=>{let lastError=null,lastStatus=null,tried=0,blocked=0;for(const base of fapiBases){const until=Number(futuresBaseBlockedUntil.get(base)||0);if(now()<until){blocked++;continue}tried++;try{const res=await fetchImpl(base+path);if(!res||!res.ok){lastStatus=Number(res&&res.status)||null;lastError=new Error(`Futures HTTP ${res&&res.status||'ERR'}`);if([403,418,429,451].includes(lastStatus)){const retryAfter=Number(res?.headers?.get?.('retry-after'));const cool=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(3600,retryAfter)*1000:(lastStatus===451?3600000:900000);futuresBaseBlockedUntil.set(base,now()+cool);lastFuturesError=lastError;continue}continue}const data=await res.json();cache.set(key,data,ttlMs);lastFuturesError=null;futuresBlockedUntil=0;futuresBaseBlockedUntil.delete(base);return data}catch(e){lastError=e}}const active=fapiBases.filter(base=>now()>=Number(futuresBaseBlockedUntil.get(base)||0));if(!active.length||(!tried&&blocked===fapiBases.length)){futuresBlockedUntil=Math.min(...fapiBases.map(base=>Number(futuresBaseBlockedUntil.get(base)||now()+60000)))}else futuresBlockedUntil=now()+30000;throw lastError||lastFuturesError||new Error('Binance Futures temporarily blocked')})().finally(()=>{if(inflight.get(flightKey)===task)inflight.delete(flightKey)});inflight.set(flightKey,task);return task}
  async function futuresOrSpot(futuresPath,spotPath,ttlMs,key){try{return await futuresRequest(futuresPath,ttlMs,'futures:'+key)}catch(e){if(disableSpotRest)throw e;marketFallbackUsed=true;return request(spotPath,ttlMs,'spot-fallback:'+key)}}
  async function getSpotUniverse(){return disableSpotRest?{timezone:'UTC',serverTime:now(),symbols:[]}:request('/api/v3/exchangeInfo',300000,'spot:exchangeInfo')}
  async function getFuturesUniverse(){try{return await futuresRequest('/fapi/v1/exchangeInfo',300000,'futures:exchangeInfo')}catch(e){if(disableFuturesFallback)throw e;return getBybitUniverse()}}
  async function getFuturesServerTime(){try{const x=await futuresRequest('/fapi/v1/time',5000,'futures:serverTime');return finite(x&&x.serverTime)??now()}catch{return now()}}
  async function getSpotTickers(){return disableSpotRest?[]:request('/api/v3/ticker/24hr',30000,'spot:ticker24hr')}
  async function getFuturesTickers(){try{return await futuresRequest('/fapi/v1/ticker/24hr',30000,'futures:ticker24hr')}catch(e){if(disableFuturesFallback)throw e;return getBybitTickers()}}
  async function getUniverse(){return futuresOrSpot('/fapi/v1/exchangeInfo','/api/v3/exchangeInfo',300000,'exchangeInfo')}
  async function getTickers(){return futuresOrSpot('/fapi/v1/ticker/24hr','/api/v3/ticker/24hr',30000,'ticker24hr')}
  async function getSpotKlines(symbol,interval,rows=120){if(disableSpotRest)throw new Error('Spot REST disabled');const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1500,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;return request('/api/v3/klines'+qs,ttl,`spot:klines:${s}:${tf}:${n}`)}
  async function getFuturesKlines(symbol,interval,rows=120){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1500,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;try{return await futuresRequest('/fapi/v1/klines'+qs,ttl,`futures:klines:${s}:${tf}:${n}`)}catch(e){if(disableFuturesFallback)throw e;return getBybitKlines(s,tf,n)}}
  async function getKlines(symbol,interval,rows=120){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1500,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;return futuresOrSpot('/fapi/v1/klines'+qs,'/api/v3/klines'+qs,ttl,`klines:${s}:${tf}:${n}`)}
  async function getKlinesAt(symbol,interval,{endTime,rows=120}={}){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),end=finite(endTime),n=Math.max(2,Math.min(1500,Number(rows)||120));if(!s||end==null)throw new Error('historical symbol and endTime required');const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}&endTime=${Math.floor(end)}`;return futuresOrSpot('/fapi/v1/klines'+qs,'/api/v3/klines'+qs,300000,`hist:${s}:${tf}:${n}:${Math.floor(end)}`)}
  function deepRowsForInterval(tf){return tf==='1d'?1500:tf==='5m'?300:420}
  async function getKlinesRange(symbol,interval,{startTime,endTime,minBars=0,maxRequests=20}={}){
    const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),start=finite(startTime),end=finite(endTime);
    if(!s||start==null||end==null||end<start)throw new Error('historical range requires symbol, startTime and endTime');
    const cap=Math.max(1,Math.min(500,Math.floor(Number(maxRequests)||20))),needed=Math.max(0,Math.floor(Number(minBars)||0));
    const byOpen=new Map();let cursor=Math.floor(start),requestCount=0,stopReason=null,previousFingerprint=null;
    while(cursor<=end&&requestCount<cap){
      const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=1000&startTime=${cursor}&endTime=${Math.floor(end)}`;
      const page=await request('/api/v3/klines'+qs,300000,`range:${s}:${tf}:${cursor}:${Math.floor(end)}`);
      requestCount++;
      if(!Array.isArray(page)||!page.length){stopReason='empty-page';break}
      const fingerprint=page.map(r=>Array.isArray(r)?r[0]:r?.openTime).join(',');
      if(fingerprint===previousFingerprint){stopReason='repeated-page';break}
      previousFingerprint=fingerprint;
      let maxOpen=null;
      for(const r of page){
        const o=finite(Array.isArray(r)?r[0]:r?.openTime),cl=finite(Array.isArray(r)?r[6]:r?.closeTime);
        if(o==null||cl==null||o<start||o>end||cl<start)continue;
        if(!byOpen.has(o))byOpen.set(o,r);
        if(maxOpen==null||o>maxOpen)maxOpen=o;
      }
      if(maxOpen==null){stopReason='out-of-range-page';break}
      const next=Math.floor(maxOpen)+1;
      if(next<=cursor){stopReason='repeated-page';break}
      cursor=next;
      if(page.length<1000&&cursor<=end){stopReason='short-page';break}
    }
    const rows=[...byOpen.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
    const first=rows[0],last=rows[rows.length-1],actualFirstOpenTime=first?finite(first[0]):null,actualLastCloseTime=last?finite(last[6]):null;
    const intervalMs={ '1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'8h':28800000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000 }[tf]||null;
    const gaps=[];if(intervalMs){for(let i=1;i<rows.length;i++){const prev=finite(rows[i-1][0]),cur=finite(rows[i][0]);if(prev!=null&&cur!=null&&cur-prev>intervalMs)gaps.push({afterOpenTime:prev,nextOpenTime:cur,missingApprox:Math.max(1,Math.round((cur-prev)/intervalMs)-1)})}}
    const coversStart=actualFirstOpenTime!=null&&actualFirstOpenTime<=start;
    const coversEnd=actualLastCloseTime!=null&&actualLastCloseTime>=end;
    const complete=coversStart&&coversEnd&&rows.length>=needed&&gaps.length===0;
    if(complete)stopReason='complete';else if(!stopReason)stopReason=requestCount>=cap?'max-requests':'incomplete';
    return{rows,coverage:{requestedStartTime:start,requestedEndTime:end,actualFirstOpenTime,actualLastCloseTime,rowCount:rows.length,requestCount,complete,gaps,stopReason}};
  }
  async function getHistoricalFrames(symbol,{simulatedTs}={}){const end=finite(simulatedTs);if(end==null)throw new Error('simulatedTs required');const intervals=['1w','3d','1d','12h','4h','1h','15m','5m'];const frames={};for(const tf of intervals)frames[tf]=await getKlinesAt(symbol,tf,{endTime:end+1,rows:deepRowsForInterval(tf)});return frames}
  async function getFundingMap(){const rows=await futuresRequest('/fapi/v1/premiumIndex',60000,'futures:premiumIndex');const map=new Map();for(const x of Array.isArray(rows)?rows:[rows])if(x&&x.symbol){const rate=finite(x.lastFundingRate);if(rate!=null)map.set(String(x.symbol).toUpperCase(),rate*100)}return map}
  async function getFundingInfoMap({strict=false}={}){try{const rows=await futuresRequest('/fapi/v1/fundingInfo',300000,'futures:fundingInfo');if(strict&&!Array.isArray(rows))throw new Error('Invalid funding interval response');const map=new Map();for(const x of Array.isArray(rows)?rows:[])if(x&&x.symbol)map.set(String(x.symbol).toUpperCase(),finite(x.fundingIntervalHours));return map}catch(e){if(strict)throw e;return new Map()}}
  async function getOiChange(symbol){const s=String(symbol||'').toUpperCase();try{const rows=await futuresRequest(`/futures/data/openInterestHist?symbol=${encodeURIComponent(s)}&period=5m&limit=13`,45000,`futures:oi:${s}`);if(!Array.isArray(rows)||rows.length<2)return null;const first=finite(rows[0].sumOpenInterest),last=finite(rows[rows.length-1].sumOpenInterest);return first&&last!=null?((last/first)-1)*100:null}catch{return null}}
  async function getOiProfile(symbol){const s=String(symbol||'').toUpperCase();try{const rows=await futuresRequest(`/futures/data/openInterestHist?symbol=${encodeURIComponent(s)}&period=15m&limit=32`,45000,`futures:oi15:${s}`);return Sample.deriveOiProfile(Array.isArray(rows)?rows:[])}catch{return Sample.deriveOiProfile([])}}
  async function getTakerProfile(symbol){const s=String(symbol||'').toUpperCase();try{return Sample.deriveTakerProfile(await getV2TakerSeries(s,'15m',32))}catch{return Sample.deriveTakerProfile([])}}
  async function getCrossOiProfile(symbol){try{return await xoi.getProfile(String(symbol||'').toUpperCase())}catch{return Sample.normalizeXoiProfile({})}}
  async function getV2OiProfile(symbol){
    const s=String(symbol||'').toUpperCase();
    try{
      const rows=await futuresRequest('/futures/data/openInterestHist?symbol='+encodeURIComponent(s)+'&period=1h&limit=25',45000,'futures:v2:oi1h:'+s);
      const a=Array.isArray(rows)?rows:[];const val=x=>finite(x&&x.sumOpenInterest);const pct=n=>a.length>=n+1&&val(a[a.length-1-n])?((val(a[a.length-1])/val(a[a.length-1-n]))-1)*100:null;
      const values=a.map(val).filter(Number.isFinite);let dd=null;if(values.length){const peak=Math.max(...values),last=values[values.length-1];dd=peak?((last/peak)-1)*100:null}
      return{rows:a,oi1hPct:pct(1),oi4hPct:pct(4),oi8hPct:pct(8),oi12hPct:pct(12),oi24hPct:pct(24),oiDrawdownPct:dd};
    }catch(e){if(disableFuturesFallback)return{rows:[],oi1hPct:null,oi4hPct:null,oi8hPct:null,oi12hPct:null,oi24hPct:null,oiDrawdownPct:null};try{return await getBybitOiProfile(s)}catch{return{rows:[],oi1hPct:null,oi4hPct:null,oi8hPct:null,oi12hPct:null,oi24hPct:null,oiDrawdownPct:null}}}
  }
  async function getV2TakerSeries(symbol,period='1h',limitRows=12){
    const s=String(symbol||'').toUpperCase();
    try{const rows=await futuresRequest('/futures/data/takerlongshortRatio?symbol='+encodeURIComponent(s)+'&period='+encodeURIComponent(period)+'&limit='+Math.max(3,Math.min(100,Number(limitRows)||12)),45000,'futures:v2:taker:'+s+':'+period+':'+limitRows);return(Array.isArray(rows)?rows:[]).map(x=>{const buyVol=finite(x.buyVol),sellVol=finite(x.sellVol),ratio=buyVol!=null&&sellVol>0?buyVol/sellVol:finite(x.buySellRatio);return{timestamp:finite(x.timestamp),ratio,buyVol,sellVol,ratioSource:buyVol!=null&&sellVol>0?'buyVol/sellVol':'buySellRatio'}})}catch{return[]}
  }
  async function getV2DerivativesProfile(symbol,fundingMap){
    const s=String(symbol||'').toUpperCase();let map=fundingMap;try{if(!map)map=await getFundingMap()}catch{map=new Map()}
    const [oi,taker1h,taker15mAll]=await Promise.all([getV2OiProfile(s),getV2TakerSeries(s,'1h',12),getV2TakerSeries(s,'15m',32)]),taker15m=taker15mAll.slice(-20);
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
    const s=String(symbol||'').toUpperCase();try{const [book,depth]=await Promise.all([futuresRequest('/fapi/v1/ticker/bookTicker?symbol='+encodeURIComponent(s),10000,'futures:book:'+s),futuresRequest('/fapi/v1/depth?symbol='+encodeURIComponent(s)+'&limit=100',10000,'futures:depth:'+s)]);return{marketType:'futures',venue:'BINANCE',...executionFromBook(book,depth)}}catch(e){return{marketType:'futures',venue:'BINANCE',available:false,observedAt:now(),error:String(e?.message||e)}}
  }
  async function getBybitFuturesExecution(symbol){
    const s=String(symbol||'').toUpperCase();
    try{
      const url='https://api.bybit.com/v5/market/orderbook?category=linear&symbol='+encodeURIComponent(s)+'&limit=200';
      const res=await fetchImpl(url,{signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(5000):undefined});
      if(!res||!res.ok)throw new Error('Bybit HTTP '+(res&&res.status||'ERR'));
      const body=await res.json(),x=body?.result||{};
      if(Number(body?.retCode)!==0||!Array.isArray(x?.b)||!Array.isArray(x?.a)||!x.b.length||!x.a.length)throw new Error('Bybit orderbook unavailable');
      const book={bidPrice:x.b[0]?.[0],askPrice:x.a[0]?.[0]};
      const out=executionFromBook(book,{bids:x.b,asks:x.a});
      return{marketType:'futures',venue:'BYBIT',source:'bybit-v5-linear-orderbook',sourceTimestamp:finite(x.ts),...out};
    }catch(e){
      return{marketType:'futures',venue:'BYBIT',available:false,observedAt:now(),error:String(e?.message||e)};
    }
  }
  async function getOkxFuturesExecution(symbol){
    const s=String(symbol||'').toUpperCase(),base=s.endsWith('USDT')?s.slice(0,-4):s,instId=base+'-USDT-SWAP';
    try{
      const signal=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(5000):undefined;
      const [bookRes,instRes]=await Promise.all([
        fetchImpl('https://www.okx.com/api/v5/market/books?instId='+encodeURIComponent(instId)+'&sz=200',{signal}),
        fetchImpl('https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId='+encodeURIComponent(instId),{signal})
      ]);
      if(!bookRes?.ok||!instRes?.ok)throw new Error('OKX HTTP '+(bookRes?.status||instRes?.status||'ERR'));
      const [bookBody,instBody]=await Promise.all([bookRes.json(),instRes.json()]);
      const x=bookBody?.data?.[0],inst=instBody?.data?.[0];
      if(String(bookBody?.code)!=='0'||String(instBody?.code)!=='0'||!x||!inst||!Array.isArray(x.bids)||!Array.isArray(x.asks)||!x.bids.length||!x.asks.length)throw new Error('OKX orderbook unavailable');
      const ctVal=finite(inst.ctVal),ctMult=finite(inst.ctMult)??1,ctValCcy=String(inst.ctValCcy||'').toUpperCase();
      if(!(ctVal>0&&ctMult>0))throw new Error('OKX contract metadata unavailable');
      const norm=rows=>(rows||[]).map(r=>{
        const p=finite(r?.[0]),contracts=finite(r?.[1]);if(!(p>0&&contracts>=0))return r;
        const unit=ctVal*ctMult;
        const baseQty=ctValCcy===base?contracts*unit:contracts*unit/p;
        return[String(p),String(baseQty)];
      });
      const bids=norm(x.bids),asks=norm(x.asks),book={bidPrice:bids[0]?.[0],askPrice:asks[0]?.[0]};
      const out=executionFromBook(book,{bids,asks});
      return{marketType:'futures',venue:'OKX',source:'okx-v5-swap-orderbook',sourceTimestamp:finite(x.ts),contract:{ctVal,ctMult,ctValCcy,instId},...out};
    }catch(e){
      return{marketType:'futures',venue:'OKX',available:false,observedAt:now(),error:String(e?.message||e)};
    }
  }
  async function getExecutionContext(symbol,{spotListed=true,futuresListed=true}={}){
    const jobs=[];if(spotListed)jobs.push(getSpotExecution(symbol));
    if(futuresListed)jobs.push((async()=>{
      const primary=await getFuturesExecution(symbol);if(primary?.available)return primary;
      const bybit=await getBybitFuturesExecution(symbol);if(bybit?.available)return{...bybit,primaryError:primary?.error||primary?.reason||null};
      const okx=await getOkxFuturesExecution(symbol);if(okx?.available)return{...okx,primaryError:primary?.error||primary?.reason||null,secondaryError:bybit?.error||bybit?.reason||null};
      return{...primary,fallbackErrors:{bybit:bybit?.error||bybit?.reason||null,okx:okx?.error||okx?.reason||null}};
    })());
    const rows=await Promise.all(jobs);
    return{version:'EXECUTION_CONTEXT_v1',updatedAt:now(),spot:rows.find(x=>x.marketType==='spot')||{marketType:'spot',available:false,reason:'NOT_LISTED'},futures:rows.find(x=>x.marketType==='futures')||{marketType:'futures',available:false,reason:'NOT_LISTED'}};
  }
  async function getFastMarketIntelligence(symbol,{spotTicker=null,futuresTicker=null}={}){
    try{return await marketIntel.getCexCrossCheck(symbol,{binanceSpotTicker:spotTicker,binanceFuturesTicker:futuresTicker})}
    catch(e){return{available:false,sources:[],exchangeCount:0,marketCount:0,error:String(e?.message||e)}}
  }
  async function getSetupValidationContext(symbol,{spotListed=true,futuresListed=true}={}){
    const s=String(symbol||'').toUpperCase();
    const [execution,spot15m]=await Promise.all([
      getExecutionContext(s,{spotListed,futuresListed}),
      spotListed?getSpotKlines(s,'15m',64).catch(()=>[]):Promise.resolve([])
    ]);
    return{version:'SETUP_VALIDATION_CONTEXT_r0.1',symbol:s,updatedAt:now(),execution,spot15m};
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
  async function mapLimitWith(items,maxWorkers,worker){const src=Array.from(items||[]),out=new Array(src.length);let next=0;async function run(){while(true){const i=next++;if(i>=src.length)return;out[i]=await worker(src[i],i)}}await Promise.all(Array.from({length:Math.min(Math.max(1,Number(maxWorkers)||1),src.length||1)},run));return out}
  async function mapLimit(items,worker){return mapLimitWith(items,limit,worker)}
  async function scanLightCandidates(symbols,intervals=['4h','1h'],rowsPerTf=150){const results={},errors=[];const src=Array.from(new Set((symbols||[]).map(s=>String(s||'').toUpperCase()).filter(Boolean)));await mapLimit(src,async symbol=>{const frames={};await mapLimitWith(intervals,intervalLimit,async interval=>{try{frames[interval]=await getFuturesKlines(symbol,interval,rowsPerTf)}catch(e){errors.push({symbol,interval,error:String(e&&e.message||e)})}});if(Object.keys(frames).length)results[symbol]=frames});return{results,errors,scanned:src.length,intervals:[...(intervals||[])]}}
  async function scanDeepCandidates(symbols,intervals=['1w','1d','4h','1h','15m','5m'],marketBySymbol={},tickerBySymbol={}){const results={},errors=[],contexts={};let fundingMap=new Map();try{fundingMap=await getFundingMap()}catch{}await mapLimit(symbols,async symbol=>{const frames={},scope=String(marketBySymbol?.[symbol]||'futures');await mapLimitWith(intervals,intervalLimit,async interval=>{try{frames[interval]=scope==='spot'?await getSpotKlines(symbol,interval,deepRowsForInterval(interval)):await getKlines(symbol,interval,deepRowsForInterval(interval))}catch(e){errors.push({symbol,interval,error:String(e&&e.message||e)})}});if(Object.keys(frames).length){results[symbol]=frames;const tick=tickerBySymbol?.[symbol]||{},marketPromise=getFastMarketIntelligence(symbol,{spotTicker:tick.spotTicker||null,futuresTicker:tick.futuresTicker||null});if(scope==='spot'){const [marketIntelligence,xoiProfile]=await Promise.all([marketPromise,getCrossOiProfile(symbol)]);const v2Profile={rows:[],oi1hPct:null,oi4hPct:null,oi8hPct:null,oi12hPct:null,oi24hPct:null,oiDrawdownPct:null,taker1h:[],taker15m:[],fundingRate:null};contexts[symbol]={oiChangePct:null,fundingPct:null,derivativesProfile:{oiProfile:Sample.deriveOiProfile([]),takerProfile:Sample.deriveTakerProfile([]),xoiProfile,v2Profile},v2Profile,marketScope:'spot',marketIntelligence}}else{const [marketIntelligence,derivatives]=await Promise.all([marketPromise,getDerivativesContext(symbol,fundingMap)]);contexts[symbol]={...derivatives,marketScope:scope,marketIntelligence}}}});return{results,errors,contexts}}
  function resetSourceState(){marketFallbackUsed=false;futuresFallbackUsed=false;futuresBlockedUntil=0;lastFuturesError=null}
  function getSourceState(){return{marketSource:futuresFallbackUsed?'bybit-futures-fallback':(marketFallbackUsed?'spot-fallback':'binance-futures'),futuresBlockedUntil:futuresBlockedUntil||null,lastFuturesError:lastFuturesError?String(lastFuturesError.message||lastFuturesError):null,futuresFallbackUsed,blockedFuturesBases:[...futuresBaseBlockedUntil.entries()].filter(([,until])=>now()<until).map(([base,until])=>({base,until}))}}
  return{getUniverse,getTickers,getSpotUniverse,getFuturesUniverse,getFuturesServerTime,getSpotTickers,getFuturesTickers,getSpotKlines,getFuturesKlines,getKlines,getKlinesAt,deepRowsForInterval,getHistoricalFrames,getFundingMap,getFundingInfoMap,getOiChange,getOiProfile,getTakerProfile,getCrossOiProfile,getV2OiProfile,getV2TakerSeries,getV2DerivativesProfile,getDerivativesContext,getSpotExecution,getFuturesExecution,getBybitFuturesExecution,getOkxFuturesExecution,getExecutionContext,getSetupValidationContext,getFastMarketIntelligence,getDetailedMarketIntelligence,mapLimit,mapLimitWith,scanLightCandidates,scanDeepCandidates,resetSourceState,getSourceState,cache,concurrency:limit,intervalConcurrency:intervalLimit};
}
module.exports={DEFAULT_BASES,DEFAULT_FUTURES_BASES,createBinanceProvider};

'use strict';
const {createTtlCache}=require('./cache.js');
const DEFAULT_BASES=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com','https://api4.binance.com'];
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function createBinanceProvider({fetchImpl=globalThis.fetch,now=()=>Date.now(),concurrency=4,cache=createTtlCache({now}),bases=DEFAULT_BASES,futuresBase='https://fapi.binance.com'}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const limit=Math.max(1,Math.floor(Number(concurrency)||4));
  async function request(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;let lastError;for(const base of bases){try{const res=await fetchImpl(base+path);if(!res||!res.ok){lastError=new Error(`HTTP ${res&&res.status||'ERR'}`);continue}const data=await res.json();cache.set(key,data,ttlMs);return data}catch(e){lastError=e}}throw lastError||new Error('Binance request failed')}
  async function futuresRequest(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;const res=await fetchImpl(futuresBase+path);if(!res||!res.ok)throw new Error(`Futures HTTP ${res&&res.status||'ERR'}`);const data=await res.json();cache.set(key,data,ttlMs);return data}
  async function getUniverse(){return request('/api/v3/exchangeInfo',300000,'exchangeInfo')}
  async function getTickers(){return request('/api/v3/ticker/24hr',30000,'ticker24hr')}
  async function getKlines(symbol,interval,rows=120){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1000,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;return request('/api/v3/klines'+qs,ttl,`klines:${s}:${tf}:${n}`)}
  async function getKlinesAt(symbol,interval,{endTime,rows=120}={}){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),end=finite(endTime),n=Math.max(2,Math.min(1000,Number(rows)||120));if(!s||end==null)throw new Error('historical symbol and endTime required');const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}&endTime=${Math.floor(end)}`;return request('/api/v3/klines'+qs,300000,`hist:${s}:${tf}:${n}:${Math.floor(end)}`)}
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
  async function getHistoricalFrames(symbol,{simulatedTs}={}){const end=finite(simulatedTs);if(end==null)throw new Error('simulatedTs required');const intervals=['1w','1d','4h','1h','15m','5m'];const frames={};for(const tf of intervals)frames[tf]=await getKlinesAt(symbol,tf,{endTime:end+1,rows:120});return frames}
  async function getFundingMap(){const rows=await futuresRequest('/fapi/v1/premiumIndex',60000,'futures:premiumIndex');const map=new Map();for(const x of Array.isArray(rows)?rows:[rows])if(x&&x.symbol){const rate=finite(x.lastFundingRate);if(rate!=null)map.set(String(x.symbol).toUpperCase(),rate*100)}return map}
  async function getOiChange(symbol){const s=String(symbol||'').toUpperCase();try{const rows=await futuresRequest(`/futures/data/openInterestHist?symbol=${encodeURIComponent(s)}&period=5m&limit=13`,45000,`futures:oi:${s}`);if(!Array.isArray(rows)||rows.length<2)return null;const first=finite(rows[0].sumOpenInterest),last=finite(rows[rows.length-1].sumOpenInterest);return first&&last!=null?((last/first)-1)*100:null}catch{return null}}
  async function getDerivativesContext(symbol,fundingMap){const s=String(symbol||'').toUpperCase();let map=fundingMap;try{if(!map)map=await getFundingMap()}catch{map=new Map()}const fundingPct=map.get(s)??null;const oiChangePct=await getOiChange(s);return{oiChangePct,fundingPct}}
  async function mapLimit(items,worker){const src=Array.from(items||[]),out=new Array(src.length);let next=0;async function run(){while(true){const i=next++;if(i>=src.length)return;out[i]=await worker(src[i],i)}}await Promise.all(Array.from({length:Math.min(limit,src.length||1)},run));return out}
  async function scanDeepCandidates(symbols,intervals=['1w','1d','4h','1h','15m','5m']){const results={},errors=[],contexts={};let fundingMap=new Map();try{fundingMap=await getFundingMap()}catch{}await mapLimit(symbols,async symbol=>{const frames={};for(const interval of intervals){try{frames[interval]=await getKlines(symbol,interval,120)}catch(e){errors.push({symbol,interval,error:String(e&&e.message||e)})}}if(Object.keys(frames).length){results[symbol]=frames;contexts[symbol]=await getDerivativesContext(symbol,fundingMap)}});return{results,errors,contexts}}
  return{getUniverse,getTickers,getKlines,getKlinesAt,getKlinesRange,getHistoricalFrames,getFundingMap,getOiChange,getDerivativesContext,mapLimit,scanDeepCandidates,cache,concurrency:limit};
}
module.exports={DEFAULT_BASES,createBinanceProvider};

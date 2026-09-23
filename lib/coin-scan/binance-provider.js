'use strict';
const {createTtlCache}=require('./cache.js');
const Sample=require('./sample-engine.js');
const CrossOi=require('./cross-oi-provider.js');
const DEFAULT_BASES=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com','https://api4.binance.com'];
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function createBinanceProvider({fetchImpl=globalThis.fetch,now=()=>Date.now(),concurrency=4,cache=createTtlCache({now}),bases=DEFAULT_BASES,futuresBase='https://fapi.binance.com',crossOiProvider=null}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  const limit=Math.max(1,Math.floor(Number(concurrency)||4));
  const xoi=crossOiProvider||CrossOi.createCrossOiProvider({fetchImpl,cache});
  async function request(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;let lastError;for(const base of bases){try{const res=await fetchImpl(base+path);if(!res||!res.ok){lastError=new Error(`HTTP ${res&&res.status||'ERR'}`);continue}const data=await res.json();cache.set(key,data,ttlMs);return data}catch(e){lastError=e}}throw lastError||new Error('Binance request failed')}
  async function futuresRequest(path,ttlMs,key){const cached=cache.get(key);if(cached!=null)return cached;const res=await fetchImpl(futuresBase+path);if(!res||!res.ok)throw new Error(`Futures HTTP ${res&&res.status||'ERR'}`);const data=await res.json();cache.set(key,data,ttlMs);return data}
  async function getUniverse(){return futuresRequest('/fapi/v1/exchangeInfo',300000,'futures:exchangeInfo')}
  async function getTickers(){return futuresRequest('/fapi/v1/ticker/24hr',30000,'futures:ticker24hr')}
  async function getKlines(symbol,interval,rows=120){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),n=Math.max(2,Math.min(1500,Number(rows)||120));const ttl=['5m','15m','1h'].includes(tf)?45000:120000;const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}`;return futuresRequest('/fapi/v1/klines'+qs,ttl,`futures:klines:${s}:${tf}:${n}`)}
  async function getKlinesAt(symbol,interval,{endTime,rows=120}={}){const s=String(symbol||'').toUpperCase(),tf=String(interval||'1h'),end=finite(endTime),n=Math.max(2,Math.min(1500,Number(rows)||120));if(!s||end==null)throw new Error('historical symbol and endTime required');const qs=`?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(tf)}&limit=${n}&endTime=${Math.floor(end)}`;return futuresRequest('/fapi/v1/klines'+qs,300000,`futures:hist:${s}:${tf}:${n}:${Math.floor(end)}`)}
  function deepRowsForInterval(tf){return tf==='1d'?1500:tf==='5m'?300:420}\n  async function getHistoricalFrames(symbol,{simulatedTs}={}){const end=finite(simulatedTs);if(end==null)throw new Error('simulatedTs required');const intervals=['1w','3d','1d','12h','4h','1h','15m','5m'];const frames={};for(const tf of intervals)frames[tf]=await getKlinesAt(symbol,tf,{endTime:end+1,rows:deepRowsForInterval(tf)});return frames}
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
  async function getDerivativesContext(symbol,fundingMap){
    const s=String(symbol||'').toUpperCase();let map=fundingMap;
    try{if(!map)map=await getFundingMap()}catch{map=new Map()}
    const fundingPct=map.get(s)??null;
    const [oiChangePct,oiProfile,takerProfile,xoiProfile,v2Profile]=await Promise.all([getOiChange(s),getOiProfile(s),getTakerProfile(s),getCrossOiProfile(s),getV2DerivativesProfile(s,map)]);
    return{oiChangePct,fundingPct,derivativesProfile:{oiProfile,takerProfile,xoiProfile,v2Profile},v2Profile};
  }
  async function mapLimit(items,worker){const src=Array.from(items||[]),out=new Array(src.length);let next=0;async function run(){while(true){const i=next++;if(i>=src.length)return;out[i]=await worker(src[i],i)}}await Promise.all(Array.from({length:Math.min(limit,src.length||1)},run));return out}
  async function scanDeepCandidates(symbols,intervals=['1w','1d','4h','1h','15m','5m']){const results={},errors=[],contexts={};let fundingMap=new Map();try{fundingMap=await getFundingMap()}catch{}await mapLimit(symbols,async symbol=>{const frames={};for(const interval of intervals){try{frames[interval]=await getKlines(symbol,interval,deepRowsForInterval(interval))}catch(e){errors.push({symbol,interval,error:String(e&&e.message||e)})}}if(Object.keys(frames).length){results[symbol]=frames;contexts[symbol]=await getDerivativesContext(symbol,fundingMap)}});return{results,errors,contexts}}
  return{getUniverse,getTickers,getKlines,getKlinesAt,deepRowsForInterval,getHistoricalFrames,getFundingMap,getFundingInfoMap,getOiChange,getOiProfile,getTakerProfile,getCrossOiProfile,getV2OiProfile,getV2TakerSeries,getV2DerivativesProfile,getDerivativesContext,mapLimit,scanDeepCandidates,cache,concurrency:limit};
}
module.exports={DEFAULT_BASES,createBinanceProvider};

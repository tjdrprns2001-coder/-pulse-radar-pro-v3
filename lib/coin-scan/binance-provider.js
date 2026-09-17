'use strict';
const {createTtlCache}=require('./cache.js');
const BASES=['https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com'];
function createBinanceProvider({fetchImpl=global.fetch,now=Date.now,concurrency=4,cache=createTtlCache({now})}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetchImpl required');
  const c=Math.max(1,Math.floor(concurrency||4));
  async function request(path){let last;for(const base of BASES){try{const r=await fetchImpl(base+path,{headers:{accept:'application/json'}});if(!r||!r.ok){last=new Error(`HTTP ${r?.status||'ERR'}`);continue}return await r.json()}catch(e){last=e}}throw last||new Error('Binance request failed')}
  async function getUniverse(){const key='exchangeInfo';const hit=cache.get(key);if(hit!==undefined)return hit;return cache.set(key,await request('/api/v3/exchangeInfo'),300000)}
  async function getTickers(){const key='ticker24';const hit=cache.get(key);if(hit!==undefined)return hit;return cache.set(key,await request('/api/v3/ticker/24hr'),30000)}
  async function getKlines(symbol,interval,limit=120){const key=`k:${symbol}:${interval}:${limit}`,hit=cache.get(key);if(hit!==undefined)return hit;const data=await request(`/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`);const ttl=['5m','15m','1h'].includes(interval)?45000:120000;return cache.set(key,data,ttl)}
  async function mapLimit(items,worker){const arr=Array.from(items||[]),out=new Array(arr.length);let i=0;async function lane(){while(true){const idx=i++;if(idx>=arr.length)return;out[idx]=await worker(arr[idx],idx)}}await Promise.all(Array.from({length:Math.min(c,arr.length||1)},lane));return out}
  async function scanDeepCandidates(symbols,intervals=['1w','1d','4h','1h','15m','5m']){const results={},errors=[];await mapLimit(symbols,async symbol=>{const frames={};for(const interval of intervals){try{frames[interval]=await getKlines(symbol,interval)}catch(e){errors.push({symbol,interval,error:String(e&&e.message||e)});return}}results[symbol]=frames});return{results,errors}}
  return{getUniverse,getTickers,getKlines,mapLimit,scanDeepCandidates};
}
module.exports={createBinanceProvider};

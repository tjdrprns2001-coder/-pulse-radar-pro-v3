'use strict';
function cleanBase(x){return String(x||'').toUpperCase().replace(/^1000(?=[A-Z0-9])/,'')}
function createMarketCapProvider({fetchImpl=globalThis.fetch,now=()=>Date.now(),ttlMs=30*60*1000,pages=4,perPage=250}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  let cache={at:0,map:new Map(),source:'coingecko'};
  async function load(){
    if(cache.map.size&&now()-cache.at<ttlMs)return cache.map;
    const next=new Map(),maxPages=Math.max(1,Math.min(4,Number(pages)||4)),limit=Math.max(1,Math.min(250,Number(perPage)||250));
    for(let page=1;page<=maxPages;page++){
      const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page='+limit+'&page='+page+'&sparkline=false';
      const res=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'PulseRadar-FullUniverse/1.0'}});
      if(!res?.ok){if(cache.map.size)return cache.map;throw new Error('CoinGecko HTTP '+(res?.status||'ERR'))}
      const rows=await res.json();if(!Array.isArray(rows)||!rows.length)break;
      for(const x of rows){const sym=cleanBase(x?.symbol),cap=Number(x?.market_cap);if(!sym||!Number.isFinite(cap)||cap<=0)continue;const prev=next.get(sym);if(prev==null||cap>prev)next.set(sym,cap)}
      if(rows.length<limit)break;
    }
    if(next.size)cache={at:now(),map:next,source:'coingecko'};return cache.map;
  }
  async function resolve(universe=[]){const m=await load(),out=new Map();for(const row of universe||[]){const cap=m.get(cleanBase(row.baseAsset));if(cap!=null)out.set(row.baseAsset,cap)}return out}
  return{load,resolve,get state(){return{updatedAt:cache.at,count:cache.map.size,source:cache.source}}};
}
module.exports={cleanBase,createMarketCapProvider};

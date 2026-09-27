'use strict';
function cleanBase(x){return String(x||'').toUpperCase().replace(/^(?:1000000|1000)(?=[A-Z0-9])/,'')}
function addCap(map,symbol,cap){
  const sym=cleanBase(symbol),n=Number(cap);if(!sym||!Number.isFinite(n)||n<=0)return;
  const prev=map.get(sym);if(prev==null||n>prev)map.set(sym,n);
}
function createMarketCapProvider({fetchImpl=globalThis.fetch,now=()=>Date.now(),ttlMs=30*60*1000,pages=4,perPage=250}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  let cache={at:0,map:new Map(),source:'none',errors:[]};
  async function coinGecko(){
    const out=new Map(),maxPages=Math.max(1,Math.min(4,Number(pages)||4)),limit=Math.max(1,Math.min(250,Number(perPage)||250));
    for(let page=1;page<=maxPages;page++){
      const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page='+limit+'&page='+page+'&sparkline=false';
      const res=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'PulseRadar-FullUniverse/1.1'}});
      if(!res?.ok)throw new Error('CoinGecko HTTP '+(res?.status||'ERR'));
      const rows=await res.json();if(!Array.isArray(rows)||!rows.length)break;
      for(const x of rows)addCap(out,x?.symbol,x?.market_cap);
      if(rows.length<limit)break;
    }
    if(!out.size)throw new Error('CoinGecko empty market-cap map');return out;
  }
  async function coinPaprika(){
    const res=await fetchImpl('https://api.coinpaprika.com/v1/tickers?quotes=USD',{headers:{accept:'application/json','user-agent':'PulseRadar-FullUniverse/1.1'}});
    if(!res?.ok)throw new Error('CoinPaprika HTTP '+(res?.status||'ERR'));
    const rows=await res.json(),out=new Map();
    for(const x of Array.isArray(rows)?rows:[])addCap(out,x?.symbol,x?.quotes?.USD?.market_cap);
    if(!out.size)throw new Error('CoinPaprika empty market-cap map');return out;
  }
  async function load(){
    if(cache.map.size&&now()-cache.at<ttlMs)return cache.map;
    const errors=[];
    try{const map=await coinGecko();cache={at:now(),map,source:'coingecko',errors};return map}catch(e){errors.push(String(e?.message||e))}
    try{const map=await coinPaprika();cache={at:now(),map,source:'coinpaprika',errors};return map}catch(e){errors.push(String(e?.message||e))}
    if(cache.map.size){cache={...cache,errors};return cache.map}
    throw new Error('market-cap providers unavailable: '+errors.join(' | '));
  }
  async function resolve(universe=[]){const m=await load(),out=new Map();for(const row of universe||[]){const cap=m.get(cleanBase(row.baseAsset));if(cap!=null)out.set(row.baseAsset,cap)}return out}
  return{load,resolve,get state(){return{updatedAt:cache.at,count:cache.map.size,source:cache.source,errors:[...(cache.errors||[])]}}};
}
module.exports={cleanBase,addCap,createMarketCapProvider};

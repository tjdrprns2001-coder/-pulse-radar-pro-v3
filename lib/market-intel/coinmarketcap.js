'use strict';
const BASE='https://pro-api.coinmarketcap.com';
const cleanBaseSymbol=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/(USDT|USDC|FDUSD|BUSD|USD)$/,'');
const num=v=>Number.isFinite(Number(v))?Number(v):null;
function normalize(x){if(!x)return null;const q=x.quote?.USD||{};return{source:'coinmarketcap',id:x.id??null,symbol:String(x.symbol||'').toUpperCase(),name:x.name||null,rank:num(x.cmc_rank),priceUsd:num(q.price),marketCapUsd:num(q.market_cap),volume24hUsd:num(q.volume_24h),circulatingSupply:num(x.circulating_supply),totalSupply:num(x.total_supply),lastUpdated:q.last_updated||x.last_updated||null}}
function createCoinMarketCapProvider({fetchImpl=global.fetch,apiKey=process.env.CMC_API_KEY||''}={}){
  const available=Boolean(apiKey&&fetchImpl);
  async function get(path){if(!available){const e=new Error('CoinMarketCap unavailable');e.code='CMC_UNAVAILABLE';throw e}const r=await fetchImpl(BASE+path,{headers:{accept:'application/json','X-CMC_PRO_API_KEY':apiKey}});if(!r.ok){const e=new Error(`CoinMarketCap HTTP ${r.status}`);e.statusCode=r.status;throw e}return r.json()}
  async function getLatestListings(limit=100){const n=Math.max(1,Math.min(100,Number(limit)||100));const d=await get('/v1/cryptocurrency/listings/latest?start=1&limit='+n+'&convert=USD');return(d?.data||[]).map(normalize).filter(Boolean)}
  async function getAssetBySymbol(symbol){const base=cleanBaseSymbol(symbol);if(!base){const e=new Error('invalid symbol');e.statusCode=400;throw e}const d=await get('/v2/cryptocurrency/quotes/latest?symbol='+encodeURIComponent(base)+'&convert=USD');const raw=d?.data?.[base];const x=Array.isArray(raw)?raw.slice().sort((a,b)=>(num(a.cmc_rank)??1e9)-(num(b.cmc_rank)??1e9))[0]:raw;const out=normalize(x);if(!out){const e=new Error('CoinMarketCap asset not found');e.statusCode=404;throw e}return out}
  return{available,getLatestListings,getAssetBySymbol};
}
module.exports={BASE,cleanBaseSymbol,normalize,createCoinMarketCapProvider};

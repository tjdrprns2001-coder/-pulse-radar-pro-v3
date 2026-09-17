'use strict';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const deltaPct=(a,b)=>{a=finite(a);b=finite(b);if(a==null||b==null||b===0)return null;return((a-b)/b)*100};
const deltas=(a,b)=>({priceDeltaPct:deltaPct(a?.priceUsd,b?.priceUsd),marketCapDeltaPct:deltaPct(a?.marketCapUsd,b?.marketCapUsd),volume24hDeltaPct:deltaPct(a?.volume24hUsd,b?.volume24hUsd)});
const globalDeltas=(a,b)=>({totalMarketCapDeltaPct:deltaPct(a?.totalMarketCapUsd,b?.totalMarketCapUsd),totalVolume24hDeltaPct:deltaPct(a?.totalVolume24hUsd,b?.totalVolume24hUsd),btcDominanceDeltaPct:deltaPct(a?.btcDominancePct,b?.btcDominancePct)});
function createMarketIntelService({coinGecko,coinMarketCap,coinGeckoMcp=null,coinMarketCapMcp=null,now=()=>Date.now(),cacheTtlMs=60000}={}){
  if(!coinGecko||!coinMarketCap)throw new Error('providers required');
  const cache=new Map();
  async function memo(key,fn){const t=now(),hit=cache.get(key);if(hit&&t-hit.ts<cacheTtlMs)return hit.value;const value=await fn();cache.set(key,{ts:t,value});return value}
  const healthBase=()=>({coinGecko:coinGecko.available?'idle':'unavailable',coinMarketCap:coinMarketCap.available?'idle':'unavailable',coinGeckoMcp:coinGeckoMcp?.available?'idle':'unavailable',coinMarketCapMcp:coinMarketCapMcp?.available?'idle':'unavailable'});
  async function getOverview(){return memo('overview',async()=>{const health=healthBase(),warnings=[];let cg=null,cmc=[],cgm=null,cmcm=null;
    if(coinGecko.available){try{cg=await coinGecko.getOverview();health.coinGecko='live'}catch(e){health.coinGecko='degraded';warnings.push(`CoinGecko: ${e.message}`)}}
    if(coinMarketCap.available){try{cmc=await coinMarketCap.getLatestListings(100);health.coinMarketCap='live'}catch(e){health.coinMarketCap='degraded';warnings.push(`CoinMarketCap: ${e.message}`)}}
    if(coinGeckoMcp?.available&&coinGeckoMcp.getOverview){try{cgm=await coinGeckoMcp.getOverview();health.coinGeckoMcp='live'}catch(e){health.coinGeckoMcp='degraded';warnings.push(`CoinGecko MCP: ${e.message}`)}}
    if(coinMarketCapMcp?.available&&coinMarketCapMcp.getOverview){try{cmcm=await coinMarketCapMcp.getOverview();health.coinMarketCapMcp='live'}catch(e){health.coinMarketCapMcp='degraded';warnings.push(`CoinMarketCap MCP: ${e.message}`)}}
    return{status:'ok',updatedAt:now(),health,global:cg?.global||null,trending:cg?.trending||[],categories:cg?.categories||[],listings:cmc,mcpSources:{coinGecko:cgm,coinMarketCap:cmcm},mcpCrosscheck:{coinGeckoRestVsMcp:globalDeltas(cg?.global,cgm?.global),coinGeckoRestVsCoinMarketCapMcp:globalDeltas(cg?.global,cmcm?.global),mcpVsMcp:globalDeltas(cgm?.global,cmcm?.global)},warnings}})}
  async function getAsset(symbol){const s=String(symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-Z0-9]{2,20}(USDT|USDC|FDUSD|BUSD|USD)$/.test(s)){const e=new Error('invalid symbol');e.statusCode=400;throw e}return memo('asset:'+s,async()=>{const health=healthBase(),warnings=[];let cg=null,cmc=null,cgm=null,cmcm=null;
    if(coinGecko.available){try{cg=await coinGecko.getAssetBySymbol(s);health.coinGecko='live'}catch(e){health.coinGecko='degraded';warnings.push(`CoinGecko: ${e.message}`)}}
    if(coinMarketCap.available){try{cmc=await coinMarketCap.getAssetBySymbol(s);health.coinMarketCap='live'}catch(e){health.coinMarketCap='degraded';warnings.push(`CoinMarketCap: ${e.message}`)}}
    if(coinGeckoMcp?.available&&coinGeckoMcp.getAssetBySymbol){try{cgm=await coinGeckoMcp.getAssetBySymbol(s);health.coinGeckoMcp='live'}catch(e){health.coinGeckoMcp='degraded';warnings.push(`CoinGecko MCP: ${e.message}`)}}
    if(coinMarketCapMcp?.available&&coinMarketCapMcp.getAssetBySymbol){try{cmcm=await coinMarketCapMcp.getAssetBySymbol(s);health.coinMarketCapMcp='live'}catch(e){health.coinMarketCapMcp='degraded';warnings.push(`CoinMarketCap MCP: ${e.message}`)}}
    return{status:'ok',symbol:s,updatedAt:now(),health,sources:{coinGecko:cg,coinMarketCap:cmc,coinGeckoMcp:cgm,coinMarketCapMcp:cmcm},crosscheck:deltas(cg,cmc),mcpCrosscheck:{coinGeckoRestVsMcp:deltas(cg,cgm),coinMarketCapRestVsMcp:deltas(cmc,cmcm),mcpVsMcp:deltas(cgm,cmcm)},warnings}})}
  async function getDexDiscovery(){return memo('dex',async()=>{const health=healthBase(),warnings=[];let pools=[];if(coinGecko.available){try{const d=await coinGecko.getDexDiscovery();pools=d?.pools||[];warnings.push(...(d?.warnings||[]));health.coinGecko='live'}catch(e){health.coinGecko='degraded';warnings.push(`GeckoTerminal: ${e.message}`)}}return{status:'ok',updatedAt:now(),health,pools,warnings}})}
  return{getOverview,getAsset,getDexDiscovery,_cache:cache};
}
module.exports={deltaPct,createMarketIntelService};

'use strict';
const CG_MCP_URL='https://mcp.api.coingecko.com/mcp';
const CMC_MCP_URL='https://mcp.coinmarketcap.com/mcp';
const cleanBaseSymbol=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/(USDT|USDC|FDUSD|BUSD|USD)$/,'');
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const arr=v=>Array.isArray(v)?v:[];

function parsePayloadText(text){
  const raw=String(text||'').trim();if(!raw)return null;
  try{return JSON.parse(raw)}catch{}
  const events=raw.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).filter(Boolean);
  for(let i=events.length-1;i>=0;i--){try{return JSON.parse(events[i])}catch{}}
  return null;
}
function decodeToolResult(result){
  if(result?.structuredContent&&typeof result.structuredContent==='object')return result.structuredContent;
  const texts=arr(result?.content).map(x=>typeof x?.text==='string'?x.text:'').filter(Boolean);
  for(const text of texts){try{return JSON.parse(text)}catch{}}
  return texts.length===1?texts[0]:texts;
}
function createMcpHttpClient({url,fetchImpl=global.fetch,headers={}}={}){
  const available=Boolean(url&&fetchImpl);let sessionId=null,initialized=false,seq=1,toolCache=null;
  async function rpc(method,params,notification=false){
    if(!available){const e=new Error('MCP unavailable');e.code='MCP_UNAVAILABLE';throw e}
    const body={jsonrpc:'2.0',method};if(params!==undefined)body.params=params;if(!notification)body.id=seq++;
    const h={'Content-Type':'application/json','Accept':'application/json, text/event-stream',...headers};if(sessionId)h['Mcp-Session-Id']=sessionId;
    const res=await fetchImpl(url,{method:'POST',headers:h,body:JSON.stringify(body)});
    const sid=res?.headers?.get?.('mcp-session-id')||res?.headers?.get?.('Mcp-Session-Id');if(sid)sessionId=sid;
    if(notification&&(res?.status===202||res?.status===204))return null;
    const text=typeof res?.text==='function'?await res.text():'';
    if(!res?.ok){const e=new Error(`MCP HTTP ${res?.status||'unknown'}`);e.statusCode=res?.status||502;throw e}
    if(notification)return null;
    const payload=parsePayloadText(text);if(!payload){const e=new Error('MCP response unavailable');e.statusCode=502;throw e}
    if(payload.error){const e=new Error(String(payload.error?.message||'MCP request failed'));e.statusCode=502;throw e}
    return payload.result;
  }
  async function ensureInitialized(){
    if(initialized)return;
    await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'PulseRadar-readonly-market-crosscheck',version:'1.0.0'}});
    await rpc('notifications/initialized',{},true);initialized=true;
  }
  async function listTools(){if(toolCache)return toolCache;await ensureInitialized();const r=await rpc('tools/list',{});toolCache=arr(r?.tools);return toolCache}
  async function callTool(name,args={}){await ensureInitialized();const r=await rpc('tools/call',{name,arguments:args});if(r?.isError){const e=new Error('MCP tool failed');e.statusCode=502;throw e}return decodeToolResult(r)}
  return{available,listTools,callTool};
}
function toolPicker(client){let cache=null;return async candidates=>{if(!cache)cache=await client.listTools();const names=cache.map(x=>String(x?.name||''));for(const c of candidates){if(names.includes(c))return c}for(const c of candidates){const n=names.find(x=>x.toLowerCase().replace(/[^a-z0-9]/g,'')===c.toLowerCase().replace(/[^a-z0-9]/g,''));if(n)return n}return null}}
function deepObjects(v,out=[]){if(v&&typeof v==='object'){out.push(v);if(Array.isArray(v))v.forEach(x=>deepObjects(x,out));else Object.values(v).forEach(x=>deepObjects(x,out))}return out}
function cgRow(v,base){const objs=deepObjects(v);return objs.find(x=>String(x?.symbol||'').toUpperCase()===base&&x.current_price!=null)||objs.find(x=>x?.current_price!=null&&x?.market_cap!=null)||null}
function cmcRow(v,base){const objs=deepObjects(v);return objs.find(x=>String(x?.symbol||'').toUpperCase()===base&&x?.quote?.USD)||objs.find(x=>x?.quote?.USD?.price!=null)||null}
function cgNormalize(x){if(!x)return null;return{source:'coingecko-mcp',id:x.id??null,symbol:String(x.symbol||'').toUpperCase(),name:x.name||null,rank:num(x.market_cap_rank),priceUsd:num(x.current_price),marketCapUsd:num(x.market_cap),volume24hUsd:num(x.total_volume),circulatingSupply:num(x.circulating_supply),totalSupply:num(x.total_supply),lastUpdated:x.last_updated||null}}
function cmcNormalize(x){if(!x)return null;const q=x.quote?.USD||{};return{source:'coinmarketcap-mcp',id:x.id??null,symbol:String(x.symbol||'').toUpperCase(),name:x.name||null,rank:num(x.cmc_rank),priceUsd:num(q.price),marketCapUsd:num(q.market_cap),volume24hUsd:num(q.volume_24h),circulatingSupply:num(x.circulating_supply),totalSupply:num(x.total_supply),lastUpdated:q.last_updated||x.last_updated||null}}
function cgGlobal(v){const objs=deepObjects(v);const d=objs.find(x=>x?.total_market_cap?.usd!=null)||objs.find(x=>x?.data?.total_market_cap?.usd!=null)?.data;if(!d)return null;return{activeCryptocurrencies:num(d.active_cryptocurrencies),totalMarketCapUsd:num(d.total_market_cap?.usd),totalVolume24hUsd:num(d.total_volume?.usd),btcDominancePct:num(d.market_cap_percentage?.btc)}}
function cmcGlobal(v){const objs=deepObjects(v);const d=objs.find(x=>x?.quote?.USD?.total_market_cap!=null)||null;if(!d)return null;const q=d.quote?.USD||{};return{activeCryptocurrencies:num(d.active_cryptocurrencies),totalMarketCapUsd:num(q.total_market_cap),totalVolume24hUsd:num(q.total_volume_24h),btcDominancePct:num(d.btc_dominance)}}

function createCoinGeckoMcpProvider({client,fetchImpl=global.fetch,url=CG_MCP_URL}={}){
  const c=client||createMcpHttpClient({url,fetchImpl});const pick=toolPicker(c);const available=Boolean(c?.available);
  async function getAssetBySymbol(symbol){const base=cleanBaseSymbol(symbol);if(!base){const e=new Error('invalid symbol');e.statusCode=400;throw e}const searchTool=await pick(['search','search_data','search_coins']);const marketTool=await pick(['coins_markets','coins_market']);if(!marketTool){const e=new Error('CoinGecko MCP market tool unavailable');e.statusCode=503;throw e}let id=base.toLowerCase();if(searchTool){try{const s=await c.callTool(searchTool,{query:base});const objs=deepObjects(s);const match=objs.find(x=>String(x?.symbol||'').toUpperCase()===base&&x?.id);if(match?.id)id=match.id}catch{}}
    const data=await c.callTool(marketTool,{vs_currency:'usd',ids:id,order:'market_cap_desc',per_page:1,page:1,sparkline:false});const out=cgNormalize(cgRow(data,base));if(!out){const e=new Error('CoinGecko MCP asset unavailable');e.statusCode=404;throw e}return out}
  async function getOverview(){const globalTool=await pick(['global','global_market_data']);if(!globalTool)return{global:null,trending:[],categories:[]};const data=await c.callTool(globalTool,{});return{global:cgGlobal(data),trending:[],categories:[]}}
  return{available,getAssetBySymbol,getOverview};
}
function createCoinMarketCapMcpProvider({client,fetchImpl=global.fetch,url=CMC_MCP_URL,apiKey=process.env.CMC_API_KEY||''}={}){
  const c=client||createMcpHttpClient({url,fetchImpl,headers:apiKey?{'X-CMC-MCP-API-KEY':apiKey}:{}});const pick=toolPicker(c);const available=Boolean(apiKey&&c?.available||client?.available);
  async function getAssetBySymbol(symbol){const base=cleanBaseSymbol(symbol);if(!base){const e=new Error('invalid symbol');e.statusCode=400;throw e}const tool=await pick(['get_crypto_quotes_latest']);if(!tool){const e=new Error('CoinMarketCap MCP quote tool unavailable');e.statusCode=503;throw e}const data=await c.callTool(tool,{symbol:base,convert:'USD'});const out=cmcNormalize(cmcRow(data,base));if(!out){const e=new Error('CoinMarketCap MCP asset unavailable');e.statusCode=404;throw e}return out}
  async function getOverview(){const tool=await pick(['get_global_metrics_latest']);if(!tool)return{global:null};const data=await c.callTool(tool,{convert:'USD'});return{global:cmcGlobal(data)}}
  return{available,getAssetBySymbol,getOverview};
}
module.exports={CG_MCP_URL,CMC_MCP_URL,createMcpHttpClient,createCoinGeckoMcpProvider,createCoinMarketCapMcpProvider};

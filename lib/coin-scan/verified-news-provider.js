'use strict';
function clean(s){return String(s||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()}
function base(symbol){return String(symbol||'').toUpperCase().replace(/(USDT|USDC|BUSD|USD)$/,'')}
function parseFeed(xml='',source='project',observedAt=Date.now()){
  const rows=[],blocks=[...String(xml).matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(x=>x[0]);
  for(const b of blocks){
    const title=clean((b.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)||[])[1]);
    const link=clean((b.match(/<link[^>]*href=["']([^"']+)/i)||[])[1]||(b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]);
    const date=clean((b.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)||[])[1]);
    if(!title)continue;const published=Date.parse(date);
    rows.push({title,url:link,source,publisher:source,publishedAt:Number.isFinite(published)?published:null,retrievedAt:observedAt,verification_status:'OFFICIAL_CONFIRMED',source_tier:2});
  }return rows;
}
function parseBinanceHtml(html='',observedAt=Date.now()){
  const rows=[],seen=new Set();
  const re=/<a[^>]+href=["']([^"']*\/support\/announcement\/detail\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(String(html)))&&rows.length<50){const url=m[1].startsWith('http')?m[1]:'https://www.binance.com'+m[1],title=clean(m[2]);if(!title||seen.has(url))continue;seen.add(url);rows.push({title,url,source:'Binance',publisher:'Binance',publishedAt:null,retrievedAt:observedAt,verification_status:'OFFICIAL_CONFIRMED',source_tier:1})}
  return rows;
}
function createVerifiedNewsProvider({fetchImpl=globalThis.fetch,env=process.env,now=()=>Date.now(),cache=null}={}){
  async function binance(){
    const cacheKey='verified-news:binance';const hit=cache?.get?.(cacheKey);if(hit!=null)return hit;
    try{const r=await fetchImpl('https://www.binance.com/en/support/announcement',{headers:{'user-agent':'PulseRadar-selector-r0.4'}});if(!r.ok)throw new Error('HTTP '+r.status);const items=parseBinanceHtml(await r.text(),now());const out={available:items.length>0,provider:'Binance Official',items,status:items.length?'FRESH':'DEGRADED',reason:items.length?null:'NO_PARSEABLE_ITEMS'};cache?.set?.(cacheKey,out,300000);return out}catch(e){return{available:false,provider:'Binance Official',items:[],status:'DEGRADED',reason:String(e?.message||e)}}}
  async function projects(symbol){
    let cfg={};try{cfg=JSON.parse(env.PROJECT_NEWS_FEEDS_JSON||'{}')}catch{}
    const urls=Array.isArray(cfg[base(symbol)])?cfg[base(symbol)]:[],items=[],errors=[];
    for(const url of urls.slice(0,5))try{const r=await fetchImpl(url,{headers:{'user-agent':'PulseRadar-selector-r0.4'}});if(!r.ok)throw new Error('HTTP '+r.status);items.push(...parseFeed(await r.text(),'Project Official',now()))}catch(e){errors.push(url+': '+String(e?.message||e))}
    return{available:items.length>0,provider:'Project Official Feeds',items,status:errors.length?'DEGRADED':urls.length?'FRESH':'UNKNOWN',errors};
  }
  async function coingecko(symbol){
    const key=env.COINGECKO_API_KEY||env.COINGECKO_PRO_API_KEY;if(!key)return{available:false,provider:'CoinGecko News',items:[],status:'UNKNOWN',reason:'API_KEY_NOT_CONFIGURED'};
    let map={};try{map=JSON.parse(env.COINGECKO_COIN_IDS_JSON||'{}')}catch{}const coin=map[base(symbol)];if(!coin)return{available:false,provider:'CoinGecko News',items:[],status:'UNKNOWN',reason:'COIN_ID_NOT_CONFIGURED'};
    try{const url='https://pro-api.coingecko.com/api/v3/news?coin_id='+encodeURIComponent(coin)+'&language=en&type=news&page=1&per_page=20';const r=await fetchImpl(url,{headers:{'x-cg-pro-api-key':key,'user-agent':'PulseRadar-selector-r0.4'}});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json(),arr=Array.isArray(j)?j:Array.isArray(j?.data)?j.data:[];const items=arr.map(x=>({title:String(x.title||''),url:String(x.url||''),source:String(x.source_name||'CoinGecko News'),publisher:String(x.source_name||'CoinGecko News'),publishedAt:Date.parse(x.posted_at)||null,retrievedAt:now(),verification_status:'SINGLE_SOURCE',source_tier:4,asset_entities:x.related_coin_ids||[]})).filter(x=>x.title);return{available:items.length>0,provider:'CoinGecko News',items,status:'FRESH'}}catch(e){return{available:false,provider:'CoinGecko News',items:[],status:'DEGRADED',reason:String(e?.message||e)}}}
  async function get(symbol){const [b,p,c]=await Promise.all([binance(),projects(symbol),coingecko(symbol)]);const items=[...b.items,...p.items,...c.items];return{available:items.length>0,provider:'Verified News Stack',items,sources:{binance:b,projects:p,coingecko:c},status:[b,p,c].some(x=>x.status==='DEGRADED')?'DEGRADED':'FRESH'}}
  return{get,binance,projects,coingecko};
}
module.exports={clean,parseFeed,parseBinanceHtml,createVerifiedNewsProvider};

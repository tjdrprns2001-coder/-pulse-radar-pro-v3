'use strict';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(values){const a=(values||[]).map(finite).filter(v=>v!=null);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function emptyExchange(exchange,error=null){return{exchange,available:false,changePct:null,drawdownPct:null,min:null,max:null,samples:0,error:error?String(error):null}}
function deriveSeriesProfile(exchange,rows=[]){
  const points=(rows||[]).map(x=>({ts:finite(x?.timestamp??x?.ts),value:finite(x?.openInterest??x?.sumOpenInterest??x?.oi??x?.value)})).filter(x=>x.value!=null&&x.value>0).sort((a,b)=>(a.ts??0)-(b.ts??0));
  if(points.length<2)return emptyExchange(exchange);
  const first=points[0].value,last=points[points.length-1].value,min=Math.min(...points.map(x=>x.value)),max=Math.max(...points.map(x=>x.value));
  return{exchange,available:true,changePct:first?((last/first)-1)*100:null,drawdownPct:first?((min/first)-1)*100:null,min,max,samples:points.length,firstTs:points[0].ts,lastTs:points[points.length-1].ts,error:null};
}
function aggregateProfiles(exchanges={}){
  const active=Object.values(exchanges).filter(x=>x&&x.available&&finite(x.changePct)!=null);
  if(!active.length)return{available:false,exchanges,breadth:0,positiveBreadth:0,strongBreadth:0,leaderExchange:null,leaderChangePct:null,aggregateChangePct:null,samples:0};
  const leader=active.slice().sort((a,b)=>finite(b.changePct)-finite(a.changePct))[0];
  return{
    available:true,
    exchanges,
    breadth:active.length,
    positiveBreadth:active.filter(x=>finite(x.changePct)>=1.2).length,
    strongBreadth:active.filter(x=>finite(x.changePct)>=2.5).length,
    leaderExchange:leader.exchange,
    leaderChangePct:finite(leader.changePct),
    aggregateChangePct:avg(active.map(x=>x.changePct)),
    samples:active.reduce((s,x)=>s+(Number(x.samples)||0),0)
  };
}
function createCrossOiProvider({fetchImpl=globalThis.fetch,cache=null,bybitBase='https://api.bybit.com',okxBase='https://www.okx.com',gateBase='https://api.gateio.ws',adapters=[]}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
  async function getJson(url,ttlMs,key){
    if(cache&&typeof cache.get==='function'){const hit=cache.get(key);if(hit!=null)return hit}
    const res=await fetchImpl(url);
    if(!res||!res.ok)throw new Error(`HTTP ${res&&res.status||'ERR'}`);
    const data=await res.json();
    if(cache&&typeof cache.set==='function')cache.set(key,data,ttlMs);
    return data;
  }
  async function bybit(symbol){
    const s=String(symbol||'').toUpperCase();
    try{
      const url=`${bybitBase}/v5/market/open-interest?category=linear&symbol=${encodeURIComponent(s)}&intervalTime=15min&limit=32`;
      const data=await getJson(url,45000,`xoi:bybit:${s}`);
      if(Number(data?.retCode)!==0)throw new Error(data?.retMsg||'Bybit OI unavailable');
      const rows=Array.isArray(data?.result?.list)?data.result.list:[];
      return deriveSeriesProfile('bybit',rows);
    }catch(e){return emptyExchange('bybit',e?.message||e)}
  }
  function baseAsset(symbol){const s=String(symbol||'').toUpperCase();return s.endsWith('USDT')?s.slice(0,-4):s}
  async function okx(symbol){
    const s=String(symbol||'').toUpperCase(),base=baseAsset(s);
    try{
      const url=`${okxBase}/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${encodeURIComponent(base)}&period=5m`;
      const data=await getJson(url,45000,`xoi:okx:${s}`);
      if(String(data?.code??'0')!=='0')throw new Error(data?.msg||'OKX OI unavailable');
      const rows=(Array.isArray(data?.data)?data.data:[]).map(x=>({timestamp:finite(x?.[0]),openInterest:finite(x?.[1])}));
      return deriveSeriesProfile('okx',rows);
    }catch(e){return emptyExchange('okx',e?.message||e)}
  }
  async function gate(symbol){
    const s=String(symbol||'').toUpperCase(),base=baseAsset(s),contract=`${base}_USDT`;
    try{
      const url=`${gateBase}/api/v4/futures/usdt/contract_stats?contract=${encodeURIComponent(contract)}&interval=5m`;
      const data=await getJson(url,45000,`xoi:gate:${s}`);
      const rows=(Array.isArray(data)?data:[]).map(x=>{const t=finite(x?.time);return{timestamp:t!=null&&t<1e12?t*1000:t,openInterest:finite(x?.open_interest)}}); 
      return deriveSeriesProfile('gate',rows);
    }catch(e){return emptyExchange('gate',e?.message||e)}
  }
  const builtins=[{name:'bybit',getProfile:bybit},{name:'okx',getProfile:okx},{name:'gate',getProfile:gate}];
  async function getProfile(symbol){
    const exchanges={};
    const all=[...builtins,...(Array.isArray(adapters)?adapters:[])];
    const settled=await Promise.all(all.map(async adapter=>{
      const name=String(adapter?.name||'external').toLowerCase();
      try{
        if(typeof adapter?.getProfile!=='function')return emptyExchange(name,'adapter unavailable');
        const p=await adapter.getProfile(symbol);
        if(p&&p.available&&finite(p.changePct)!=null)return{exchange:name,...p};
        if(Array.isArray(p))return deriveSeriesProfile(name,p);
        return{...emptyExchange(name),...(p||{}),exchange:name};
      }catch(e){return emptyExchange(name,e?.message||e)}
    }));
    for(const p of settled)exchanges[p.exchange]=p;
    return aggregateProfiles(exchanges);
  }
  return{getProfile,deriveSeriesProfile,aggregateProfiles};
}
module.exports={deriveSeriesProfile,aggregateProfiles,createCrossOiProvider};

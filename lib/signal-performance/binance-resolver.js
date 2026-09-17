'use strict';
const BASES=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com'];
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
async function defaultFetchKlines(symbol,targetTs){
  let lastErr=null;
  const qs=`symbol=${encodeURIComponent(String(symbol||'').toUpperCase())}&interval=1m&startTime=${Math.floor(Number(targetTs)||0)}&limit=5`;
  for(const base of BASES){
    try{const r=await fetch(`${base}/api/v3/klines?${qs}`,{headers:{accept:'application/json'}});if(!r.ok)throw new Error(`Binance HTTP ${r.status}`);const data=await r.json();if(Array.isArray(data))return data}catch(e){lastErr=e}
  }
  throw lastErr||new Error('Binance klines unavailable');
}
function createBinanceResolver({fetchKlines=defaultFetchKlines}={}){
  return{
    async resolve(symbol,targetTs,nowTs=Date.now()){
      const target=finite(targetTs),now=finite(nowTs);if(target==null)throw new Error('target timestamp required');
      if(now==null||now<target)return{status:'pending',targetTs:target};
      const rows=await fetchKlines(String(symbol||'').toUpperCase(),target);
      const valid=(Array.isArray(rows)?rows:[]).map(row=>({row,ts:finite(row?.[0]),price:finite(row?.[1])})).filter(x=>x.ts!=null&&x.ts>=target&&x.price!=null&&x.price>0).sort((a,b)=>a.ts-b.ts);
      if(!valid.length)return{status:'unavailable',targetTs:target};
      return{status:'evaluated',targetTs:target,marketTs:valid[0].ts,price:valid[0].price};
    }
  };
}
module.exports={BASES,createBinanceResolver};

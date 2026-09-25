'use strict';

const SPOT_BASES=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com'];
const FUTURES_BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
async function fetchMarketKlines(symbol,targetTs,market='futures'){
  const futures=market==='futures',bases=futures?FUTURES_BASES:SPOT_BASES,path=futures?'/fapi/v1/klines':'/api/v3/klines';
  const qs=`symbol=${encodeURIComponent(String(symbol||'').toUpperCase())}&interval=1m&startTime=${Math.floor(Number(targetTs)||0)}&limit=5`;let lastErr=null;
  for(const base of bases){try{const r=await fetch(base+path+'?'+qs,{headers:{accept:'application/json'}});if(!r.ok)throw new Error(`Binance ${market} HTTP ${r.status}`);const data=await r.json();if(Array.isArray(data))return data}catch(e){lastErr=e}}
  throw lastErr||new Error('Binance '+market+' klines unavailable');
}
function rowsToHit(rows,target){
  const valid=(Array.isArray(rows)?rows:[]).map(row=>({ts:finite(row?.[0]),price:finite(row?.[1])})).filter(x=>x.ts!=null&&x.ts>=target&&x.price!=null&&x.price>0).sort((a,b)=>a.ts-b.ts);
  return valid[0]||null;
}
function createPreIgnitionResolver({fetchKlines=fetchMarketKlines}={}){
  return{
    async resolve(symbol,targetTs,nowTs=Date.now(),context={}){
      const target=finite(targetTs),now=finite(nowTs);if(target==null)throw new Error('target timestamp required');if(now==null||now<target)return{status:'pending',targetTs:target};
      const scope=String(context.marketScope||'').toLowerCase(),preferFutures=context.futuresListed===true||scope.includes('futures'),order=preferFutures?['futures','spot']:['spot','futures'];
      let attempted=0;
      for(const market of order){
        if(market==='spot'&&context.spotListed===false&&preferFutures)continue;
        if(market==='futures'&&context.futuresListed===false&&!preferFutures)continue;
        attempted++;
        try{const hit=rowsToHit(await fetchKlines(String(symbol||'').toUpperCase(),target,market),target);if(hit)return{status:'evaluated',targetTs:target,marketTs:hit.ts,price:hit.price,market}}catch(_e){}
      }
      return{status:'unavailable',targetTs:target,attemptedMarkets:attempted};
    }
  };
}
module.exports={SPOT_BASES,FUTURES_BASES,fetchMarketKlines,rowsToHit,createPreIgnitionResolver};

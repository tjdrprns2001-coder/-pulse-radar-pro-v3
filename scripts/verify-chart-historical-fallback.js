'use strict';
const assert=require('assert');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const STEP=4*3600000,asOf=1791374400000,seen=[];
async function fetchImpl(url){
  const s=String(url);seen.push(s);
  if(s.includes('api.bybit.com/v5/market/kline')){
    const u=new URL(s),end=Number(u.searchParams.get('end')),limit=Number(u.searchParams.get('limit')),items=[];
    for(let i=0;i<limit;i++){const t=Math.floor(end/STEP)*STEP-i*STEP;items.push([String(t),'0.12','0.13','0.11','0.121','1000','121'])}
    return{ok:true,status:200,json:async()=>({retCode:0,retMsg:'OK',result:{list:items}})}
  }
  return{ok:false,status:418,json:async()=>({code:-1003,msg:'blocked'})}
}
(async()=>{
  const provider=createBinanceProvider({fetchImpl,bases:['https://api.binance.com'],futuresBases:['https://fapi.binance.com'],futuresMinIntervalMs:0});
  const rows=await provider.getKlinesAt('DOGEUSDT','4h',{endTime:asOf,rows:120});
  assert(rows.length>=100,'historical fallback must return sufficient bars');
  assert.equal(rows._source,'BYBIT_LINEAR_HISTORICAL');
  assert(rows.every(x=>Number(x[6])<=asOf),'future or unfinished bars must be excluded');
  assert(rows.every((x,i)=>!i||x[0]>rows[i-1][0]),'history must be ordered and deduplicated');
  assert(seen.some(x=>x.includes('api.bybit.com/v5/market/kline')),'Bybit endpoint must be used');
  console.log('chart historical fallback PASS',rows.length);
})().catch(e=>{console.error(e);process.exit(1)});

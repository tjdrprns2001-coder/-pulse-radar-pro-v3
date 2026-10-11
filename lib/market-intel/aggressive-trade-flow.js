'use strict';
const ALLOWED=/^[A-Z0-9]{2,25}USDT$/;
function analyzeTrades(rows,{market='futures',symbol,now=Date.now()}={}){
 if(!Array.isArray(rows)||!rows.length)return{ok:true,available:false,reason:'NO_TRADES',symbol,market};
 const trades=rows.filter(x=>x&&Number.isFinite(Number(x.T))&&Number.isFinite(Number(x.p))&&Number(x.p)>0&&Number.isFinite(Number(x.q))&&Number(x.q)>0&&typeof x.m==='boolean')
  .map(x=>({id:Number(x.a),time:Number(x.T),price:Number(x.p),quantity:Number(x.q),buyerMaker:x.m}))
  .sort((a,b)=>a.time-b.time||a.id-b.id);
 if(trades.length<30)return{ok:true,available:false,reason:'INSUFFICIENT_TRADES',count:trades.length,symbol,market};
 let buy=0,sell=0,cumulative=0,lowest=Infinity,highest=-Infinity;const points=[];
 for(const t of trades){
  const notional=t.price*t.quantity;
  if(t.buyerMaker)sell+=notional;else buy+=notional;
  cumulative+=t.buyerMaker?-notional:notional;
  lowest=Math.min(lowest,t.price);highest=Math.max(highest,t.price);
  points.push({time:t.time,cvd:Math.round(cumulative*100)/100,price:t.price});
 }
 const first=trades[0],last=trades.at(-1),priceChangePct=(last.price/first.price-1)*100;
 const net=buy-sell,total=buy+sell,deltaPct=total?net/total*100:0;
 // heuristic; never call this verified order-book absorption
 const candidate=deltaPct<=-20&&priceChangePct>=-.25?'POSSIBLE_BUY_ABSORPTION':
  deltaPct>=20&&priceChangePct<=.25?'POSSIBLE_SELL_ABSORPTION':'NONE';
 const age=Math.max(0,now-last.time);
 return{ok:true,available:true,symbol,market,source:'BINANCE_AGG_TRADES',tradeCount:trades.length,
  fromTime:first.time,toTime:last.time,ageMs:age,partialWindow:true,
  buyNotional:buy,sellNotional:sell,netDeltaNotional:net,deltaPct,
  cvdStart:0,cvdEnd:cumulative,priceChangePct,priceLow:lowest,priceHigh:highest,
  possibleAbsorption:candidate,
  caveats:['최근 조회된 체결 표본만의 누적 델타입니다. 전체 과거 CVD가 아닙니다.',
   'buyerMaker=true는 매도 주도 체결로 해석합니다.',
   '흡수는 체결과 가격 변화로 추정한 징후이며 실제 주문벽·세력 의도는 확인할 수 없습니다.'],
  points:points.filter((_,i)=>i%Math.max(1,Math.ceil(points.length/80))===0||i===points.length-1).slice(-81)};
}
async function getFlow({symbol='BTCUSDT',market='futures',limit=500,fetchImpl=global.fetch,now=Date.now()}={}){
 symbol=String(symbol||'').toUpperCase();if(!ALLOWED.test(symbol))return{ok:false,error:'INVALID_SYMBOL'};
 if(!['spot','futures'].includes(market))return{ok:false,error:'INVALID_MARKET'};
 const safeLimit=Math.max(50,Math.min(500,Number(limit)||500));
 const base=market==='futures'?'https://fapi.binance.com':'https://api.binance.com';
 const url=base+'/fapi/v1/aggTrades';const target=market==='futures'?url:base+'/api/v3/aggTrades';
 try{
  const res=await fetchImpl(target+'?symbol='+symbol+'&limit='+safeLimit,{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});
  if(!res?.ok)return{ok:true,available:false,reason:'UPSTREAM_'+(res?.status||'ERROR'),symbol,market};
  const rows=await res.json();
  return analyzeTrades(rows,{symbol,market,now});
 }catch{return{ok:true,available:false,reason:'TRADE_FETCH_FAILED',symbol,market}}
}
module.exports={getFlow,analyzeTrades};

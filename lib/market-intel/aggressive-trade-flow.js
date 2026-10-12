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

// Bounded, process-local rolling observations, not persistent full-history CVD.
const sessions=new Map();
function observe(key,rows,depth,now){
 const valid=rows.filter(x=>x&&Number.isFinite(Number(x.a))&&Number.isFinite(Number(x.T))&&Number(x.p)>0&&Number(x.q)>0&&typeof x.m==='boolean')
  .map(x=>({id:Number(x.a),t:Number(x.T),p:Number(x.p),q:Number(x.q),m:x.m})).sort((a,b)=>a.id-b.id);
 let session=sessions.get(key);
 if(!session){session={seen:new Set(),buckets:new Map(),lastObserved:0};sessions.set(key,session)}
 // Expire stale sessions and never combine discontinuous histories without warning.
 if(session.lastObserved&&now-session.lastObserved>30*60*1000){session.seen.clear();session.buckets.clear()}
 let added=0;
 for(const t of valid){
  if(session.seen.has(t.id))continue;
  session.seen.add(t.id);added++;
  const minute=Math.floor(t.t/60000)*60000,notional=t.p*t.q,old=session.buckets.get(minute)||{time:minute,buy:0,sell:0,trades:0};
  if(t.m)old.sell+=notional;else old.buy+=notional;
  old.trades++;session.buckets.set(minute,old);
 }
 const floor=now-60*60*1000;
 for(const time of session.buckets.keys())if(time<floor)session.buckets.delete(time);
 // Avoid unbounded distinct-ID growth if a server is kept running for weeks.
 if(session.seen.size>15000){session.seen=new Set(valid.slice(-500).map(x=>x.id))}
 session.lastObserved=now;
 const buckets=[...session.buckets.values()].sort((a,b)=>a.time-b.time),roll={time:now,windowMs:3600000,
  ephemeral:true,sessionOnly:true,newTrades:added,minutes:buckets.length,
  buyNotional:buckets.reduce((s,b)=>s+b.buy,0),sellNotional:buckets.reduce((s,b)=>s+b.sell,0),
  observedBuckets:buckets.slice(-60).map(b=>({time:b.time,deltaNotional:b.buy-b.sell,trades:b.trades}))};
 roll.netDeltaNotional=roll.buyNotional-roll.sellNotional;
 const bids=Array.isArray(depth?.bids)?depth.bids:[],asks=Array.isArray(depth?.asks)?depth.asks:[];
 const sum=xs=>xs.slice(0,20).reduce((a,x)=>a+(Number(x[0])>0&&Number(x[1])>0?Number(x[0])*Number(x[1]):0),0);
 const bid=sum(bids),ask=sum(asks);
 const depthCheck=bid>0&&ask>0?{available:true,source:'BINANCE_DEPTH_SNAPSHOT',levels:Math.min(20,bids.length,asks.length),
  bidNotional:bid,askNotional:ask,imbalance:(bid-ask)/(bid+ask),
  warning:'단일 시점 호가 스냅샷이며 주문벽 지속시간/취소 여부는 확인되지 않음'}:
  {available:false,reason:'NO_VALID_ORDERBOOK_SNAPSHOT'};
 return{rolling:roll,depth:depthCheck};
}
async function getDepth({symbol,market,fetchImpl}){
 const host=market==='futures'?'https://fapi.binance.com/fapi/v1/depth':'https://api.binance.com/api/v3/depth';
 try{const res=await fetchImpl(host+'?symbol='+symbol+'&limit=20',{signal:AbortSignal.timeout(4000)});
  return res?.ok?await res.json():null}catch{return null}
}

module.exports={getFlow,analyzeTrades,observe,getDepth};

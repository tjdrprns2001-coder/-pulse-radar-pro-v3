'use strict';
const BASE='https://fapi.binance.com';
async function json(path){const r=await fetch(BASE+path,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8500)});if(!r.ok)throw Error('Binance HTTP '+r.status);return r.json()}
const qs=(o)=>new URLSearchParams(o).toString();
function average(a){return a.reduce((s,x)=>s+x,0)/a.length}
function findBowl(raw){
 const data=raw.filter(x=>Number(x[6])<Date.now()),n=data.length;
 if(n<500)return {stage:'NO_HISTORY',bars:n};
 const close=data.map(x=>+x[4]), hi=data.map(x=>+x[2]),lo=data.map(x=>+x[3]),vol=data.map(x=>+x[5]);
 const ma=k=>average(close.slice(-k));const sma112=ma(112),sma224=ma(224),sma448=ma(448);
 const last=n-1,price=close[last],best=[];
 // Candidate lows must be local pivots, with at least 35 days of base.
 for(let t=Math.max(35,n-441);t<n-35;t++){
  if(lo[t]>Math.min(...lo.slice(t-4,t+5)))continue;
  const start=Math.max(0,t-360);let p=start;
  for(let k=start+1;k<t;k++)if(hi[k]>hi[p])p=k;
  const decline=t-p;if(decline<25)continue;
  const depth=1-lo[t]/hi[p];if(depth<.25)continue;
  const baseLow=Math.min(...lo.slice(t,last+1)),boxTop=Math.max(...hi.slice(t,last));
  const width=boxTop/baseLow-1;if(width>.45)continue;
  const base=last-t,ratio=base/decline;
  if(ratio<.8||ratio>2.5)continue;
  const distance=price/boxTop-1;
  // Prefer an unbroken, recent base near its upper boundary.
  const score=Math.abs(ratio-1)*.4+Math.abs(distance)*2+width*.2+(last-t)*.0001;
  best.push({p,t,decline,base,ratio,depth,baseLow,boxTop,width,distance,score});
 }
 if(!best.length)return {stage:'NO_PATTERN',bars:n,price,sma112,sma224,sma448};
 best.sort((a,b)=>a.score-b.score);const b=best[0];
 const rvol=vol[last]/Math.max(1e-12,average(vol.slice(-21,-1)));
 const breakout=price>b.boxTop&&price>sma224&&price>sma448&&rvol>=1.5;
 let stage='WAIT';
 if(breakout)stage=b.distance>.2?'EXTENDED':'BREAKOUT';
 else if(price>b.boxTop)stage='ABOVE_BOX_UNCONFIRMED';
 else if(price>=b.boxTop*.92)stage='PRE';
 // RETEST only after actual recorded prior breakout (not merely above-box).
 const priorBreak=close.slice(Math.max(b.t,last-15),last).some((c,i)=>c>b.boxTop&&vol[Math.max(b.t,last-15)+i]>average(vol.slice(Math.max(0,Math.max(b.t,last-15)+i-20),Math.max(b.t,last-15)+i)) *1.5);
 if(priorBreak&&price>=b.boxTop*.995&&price<=b.boxTop*1.06&&price>Math.max(sma224,sma448))stage='RETEST_WATCH';
 return {stage,bars:n,price,sma112,sma224,sma448,declineBars:b.decline,baseBars:b.base,ratio:+b.ratio.toFixed(2),declinePct:+(b.depth*100).toFixed(2),boxLow:b.baseLow,boxTop:b.boxTop,boxWidthPct:+(b.width*100).toFixed(2),distancePct:+(b.distance*100).toFixed(2),rvol:+rvol.toFixed(2),breakout,method:'pivot-approximation',caution:'Price/volume proxies cannot prove accumulation'};
}
async function one(symbol,extended){
 const candles=await json('/fapi/v1/klines?'+qs({symbol,interval:'1d',limit:750}));
 const result={symbol,...findBowl(candles)};
 if(!extended||!['PRE','BREAKOUT','RETEST_WATCH','ABOVE_BOX_UNCONFIRMED'].includes(result.stage))return result;
 const [k4,k15,oi,taker]=await Promise.allSettled([
 json('/fapi/v1/klines?'+qs({symbol,interval:'4h',limit:110})),
 json('/fapi/v1/klines?'+qs({symbol,interval:'15m',limit:100})),
 json('/futures/data/openInterestHist?'+qs({symbol,period:'5m',limit:20})),
 json('/futures/data/takerlongshortRatio?'+qs({symbol,period:'15m',limit:4}))
 ]);
 const unpack=x=>x.status==='fulfilled'?x.value:null;
 const calculate=(rows)=>{if(!Array.isArray(rows))return null;let a=rows.filter(v=>+v[6]<Date.now());if(a.length<25)return null;let p=+a.at(-1)[4],q=a.map(v=>+v[7]),rvol=q.at(-1)/(average(q.slice(-21,-1))||Infinity);return {last:p,rvol:+rvol.toFixed(2),breakout12:p>Math.max(...a.slice(-13,-1).map(v=>+v[2]))}};
 result.tf4h=calculate(unpack(k4));result.tf15m=calculate(unpack(k15));
 const o=unpack(oi);if(Array.isArray(o)&&o.length>=13){let v=o.map(x=>+(x.sumOpenInterestValue??x.sumOpenInterest));result.oi60Pct=+((v.at(-1)/v.at(-13)-1)*100).toFixed(2);result.oi15Pct=+((v.at(-1)/v.at(-4)-1)*100).toFixed(2)}else result.oi60Pct=null;
 const t=unpack(taker);result.takerRatio=Array.isArray(t)&&t.length?Number(t.at(-1).buySellRatio):null;
 result.ignition=Boolean(result.tf15m?.breakout12&&result.tf15m?.rvol>=1.5&&result.oi60Pct!==null&&result.oi60Pct>0&&result.takerRatio>=1.15);
 return result;
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.query?.mode==='universe'){const [ex,tickers]=await Promise.all([json('/fapi/v1/exchangeInfo'),json('/fapi/v1/ticker/24hr')]);let v=new Map(tickers.map(x=>[x.symbol,x]));let symbols=ex.symbols.filter(x=>x.quoteAsset==='USDT'&&x.contractType==='PERPETUAL'&&x.status==='TRADING'&&x.underlyingType==='COIN').map(x=>({symbol:x.symbol,change24h:+(v.get(x.symbol)?.priceChangePercent||0),quoteVolume:+(v.get(x.symbol)?.quoteVolume||0)}));return res.status(200).json({symbols,at:new Date().toISOString()})}
  const symbols=String(req.query?.symbols||'').split(',').filter(x=>/^[A-Z0-9]{2,25}USDT$/.test(x)).slice(0,3);if(!symbols.length)return res.status(400).json({error:'symbols required'});
  const deep=String(req.query?.deep||'true')!=='false';
  const results=await Promise.all(symbols.map(async s=>{try{return await one(s,deep)}catch(e){return {symbol:s,stage:'ERROR',message:String(e.message).slice(0,100)}}}));
  return res.status(200).json({results,at:new Date().toISOString()});
 }catch(e){return res.status(502).json({error:String(e.message).slice(0,140)})}
};

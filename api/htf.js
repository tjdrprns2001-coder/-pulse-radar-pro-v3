const SPOT_BASES=['https://api.binance.com','https://api-gcp.binance.com','https://data-api.binance.vision'];
const FUTURES_BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];
const num=(v,f=null)=>{const x=Number(v);return Number.isFinite(x)?x:f};
const HIGHER={'5m':'15m','15m':'1h','1h':'4h','4h':'1d','1d':'1w'};
async function getFrom(bases,path,params={}){const qs=new URLSearchParams(params).toString();let last=null;for(const base of bases){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),3500);try{const r=await fetch(base+path+(qs?'?'+qs:''),{signal:ac.signal,headers:{'User-Agent':'PulseRadar-Pro/3.13.1'}});const text=await r.text();if(!r.ok)throw Error('Binance '+r.status+': '+text.slice(0,120));return JSON.parse(text)}catch(e){last=e}finally{clearTimeout(timer)}}throw last||Error('Binance request failed')}
const getSpot=(path,params)=>getFrom(SPOT_BASES,path,params);
const getFutures=(path,params)=>getFrom(FUTURES_BASES,path,params);
function ema(a,p){if(!a.length)return[];const k=2/(p+1),out=[];let x=a[0];for(let i=0;i<a.length;i++){x=i?a[i]*k+x*(1-k):a[i];out.push(x)}return out}
function avg(a){const v=a.filter(Number.isFinite);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null}
function pct(oldV,newV){oldV=num(oldV);newV=num(newV);return oldV!=null&&newV!=null&&oldV!==0?(newV-oldV)/Math.abs(oldV)*100:null}
function sum(a){return a.reduce((s,x)=>s+(num(x,0)||0),0)}
async function derivatives(symbol){const now=Date.now(),dayAgo=now-24*60*60*1000;const settled=await Promise.allSettled([
  getFutures('/fapi/v1/premiumIndex',{symbol}),
  getFutures('/fapi/v1/openInterest',{symbol}),
  getFutures('/futures/data/openInterestHist',{symbol,period:'1h',limit:'25'}),
  getFutures('/futures/data/openInterestHist',{symbol,period:'5m',startTime:String(dayAgo-10*60*1000),endTime:String(dayAgo+10*60*1000),limit:'5'}),
  getFutures('/futures/data/takerlongshortRatio',{symbol,period:'1h',limit:'12'}),
  getFutures('/fapi/v1/klines',{symbol,interval:'1h',limit:'12'}),
  getFutures('/fapi/v1/ticker/24hr',{symbol})
]);
const [pR,oR,hR,oldR,tR,kR,qR]=settled;if(pR.status!=='fulfilled'||qR.status!=='fulfilled')return{ok:true,mode:'deriv',available:false,symbol,reason:'USD-M 선물 데이터 없음'};
const p=pR.value||{},o=oR.status==='fulfilled'?oR.value:{},h=hR.status==='fulfilled'&&Array.isArray(hR.value)?hR.value:[],oldH=oldR.status==='fulfilled'&&Array.isArray(oldR.value)?oldR.value:[],t=tR.status==='fulfilled'&&Array.isArray(tR.value)?tR.value:[],ks=kR.status==='fulfilled'&&Array.isArray(kR.value)?kR.value:[],q=qR.value||{};
const mark=num(p.markPrice),contracts=num(o.openInterest),oiUsd=mark!=null&&contracts!=null?mark*contracts:null;
let oi24=null,oi24Source=null;if(h.length>1){oi24=pct(h[0]?.sumOpenInterestValue??h[0]?.sumOpenInterest,h.at(-1)?.sumOpenInterestValue??h.at(-1)?.sumOpenInterest);if(oi24!=null)oi24Source='1h history'}
if(oi24==null&&oldH.length&&oiUsd!=null){const oldVal=num(oldH[Math.floor(oldH.length/2)]?.sumOpenInterestValue);if(oldVal!=null){oi24=pct(oldVal,oiUsd);oi24Source='24h point vs current'}}
const ratios=t.map(x=>num(x.buySellRatio)).filter(Number.isFinite);let ratio=avg(ratios),takerSource=ratio!=null?'taker ratio history':null;
if(ratio==null&&ks.length){const totalVol=sum(ks.map(x=>x?.[5])),buyVol=sum(ks.map(x=>x?.[9])),sellVol=Math.max(0,totalVol-buyVol);if(sellVol>0){ratio=buyVol/sellVol;takerSource='1h kline taker volume'}}
const fund=num(p.lastFundingRate),fundPct=fund!=null?fund*100:null,flags=[];
if(oi24!=null&&oi24>=15)flags.push('OI 증가');if(oi24!=null&&oi24<=-15)flags.push('OI 감소');if(fundPct!=null&&fundPct>=.03)flags.push('양(+) 펀딩 쏠림');if(fundPct!=null&&fundPct<=-.03)flags.push('음(-) 펀딩 쏠림');if(ratio!=null&&ratio>=1.15)flags.push('공격적 매수 우위');if(ratio!=null&&ratio<=.87)flags.push('공격적 매도 우위');
let pressure='중립';if(flags.length>=3)pressure='레버리지 과열';else if(flags.length)pressure='레버리지 확대';
return{ok:true,mode:'deriv',available:true,symbol,markPrice:mark,openInterestContracts:contracts,openInterestUsdApprox:oiUsd,openInterestChange24hPct:oi24,openInterestChangeSource:oi24Source,fundingRate:fund,fundingRatePct:fundPct,nextFundingTime:num(p.nextFundingTime),takerBuySellRatio:ratio,takerRatioSource:takerSource,priceChange24h:num(q.priceChangePercent),quoteVolume24h:num(q.quoteVolume),pressure,flags,source:'Binance USD-M public REST'};
}
async function live(symbol,interval){let raw=null,market='spot';try{raw=await getSpot('/api/v3/klines',{symbol,interval,limit:'21'})}catch{market='futures';raw=await getFutures('/fapi/v1/klines',{symbol,interval,limit:'21'})}
if(!Array.isArray(raw)||!raw.length)return{ok:true,mode:'live',available:false,symbol,interval};const k=raw.at(-1),prev=raw.slice(0,-1),avgVol=avg(prev.map(x=>num(x[5],0))),now=Date.now(),openTime=num(k[0],now),closeTime=num(k[6],now+1),progress=Math.min(1,Math.max(.05,(now-openTime)/Math.max(1,closeTime-openTime))),vol=num(k[5],0),projected=vol/progress,ratio=avgVol?projected/avgVol:null;return{ok:true,mode:'live',available:true,symbol,interval,market,openTime,closeTime,open:num(k[1]),high:num(k[2]),low:num(k[3]),close:num(k[4]),volume:vol,projectedVolumeRatio:ratio,isClosed:now>closeTime,source:'Binance public klines'};
}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','s-maxage=5, stale-while-revalidate=10');try{const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),mode=String(req.query.mode||'htf');if(mode==='deriv')return res.status(200).json(await derivatives(symbol));if(mode==='live')return res.status(200).json(await live(symbol,String(req.query.interval||'4h')));const baseInterval=String(req.query.interval||'15m'),interval=HIGHER[baseInterval];if(!interval)return res.status(200).json({ok:true,version:'3.13.1',status:'unknown',bias:'unknown',reason:'No higher timeframe mapping'});const raw=await getSpot('/api/v3/klines',{symbol,interval,limit:'180'});if(!Array.isArray(raw))throw Error('Unexpected Binance response');const snapshotTime=num(req.query.snapshotTime,Date.now()),closed=raw.filter(k=>num(k[6],0)<=snapshotTime);if(closed.length<70)return res.status(200).json({ok:true,version:'3.13.1',status:'unknown',bias:'unknown',interval,reason:'Not enough closed HTF candles',snapshotTime});const c=closed.map(k=>num(k[4],0)),e20=ema(c,20),e60=ema(c,60),price=c.at(-1),a=e20.at(-1),b=e60.at(-1),bias=price>a&&a>b?'bullish':price<a&&a<b?'bearish':'neutral',last=closed.at(-1);return res.status(200).json({ok:true,version:'3.13.1',status:'pass',bias,interval,price,ema20:a,ema60:b,snapshotTime,lastClosedOpenTime:num(last[0]),lastClosedCloseTime:num(last[6]),currentCandleExcluded:true,dataSource:'Binance Spot',boundaryPass:num(last[6],0)<=snapshotTime})}catch(e){return res.status(200).json({ok:true,version:'3.13.1',status:'unknown',bias:'unknown',reason:e?.message||String(e)})}}

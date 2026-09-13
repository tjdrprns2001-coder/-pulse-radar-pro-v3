const spot=require('../lib/spot-structure.js');
const futures=require('../lib/futures-data.js');
function capture(){let code=200,body=null;return{res:{setHeader(){},status(c){code=c;return this},json(v){body=v;return this}},get:()=>({code,body})}}
async function runSpot(req){const c=capture();try{await spot(req,c.res)}catch(e){return{code:500,body:{ok:false,error:e?.message||String(e)}}}return c.get()}
const BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];
async function getJson(path){let last;for(const base of BASES){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),4500);try{const r=await fetch(base+path,{signal:ctl.signal,headers:{accept:'application/json'}});const text=await r.text();clearTimeout(to);if(!r.ok){last=new Error('HTTP '+r.status);continue}return JSON.parse(text)}catch(e){clearTimeout(to);last=e}}throw last||new Error('Binance USD-M fetch failed')}
const BYBIT_BASES=['https://api.bybit.com','https://api.bytick.com'];
async function getBybit(path){let last;for(const base of BYBIT_BASES){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),4500);try{const r=await fetch(base+path,{signal:ctl.signal,headers:{accept:'application/json'}});const text=await r.text();clearTimeout(to);if(!r.ok){last=new Error('HTTP '+r.status);continue}const j=JSON.parse(text);if(j?.retCode!==0){last=new Error(j?.retMsg||'Bybit API error');continue}return j}catch(e){clearTimeout(to);last=e}}throw last||new Error('Bybit linear fetch failed')}
const num=v=>{v=Number(v);return Number.isFinite(v)?v:null};
function pct(a,b){a=num(a);b=num(b);return a!=null&&b!=null&&a!==0?(b-a)/Math.abs(a)*100:null}
function pressureFrom({oi24,fundingPct,taker}){const flags=[];if(oi24!=null&&oi24>=15)flags.push('OI 증가');if(oi24!=null&&oi24<=-15)flags.push('OI 감소');if(fundingPct!=null&&Math.abs(fundingPct)>=.03)flags.push(fundingPct>0?'양(+) 펀딩':'음(-) 펀딩');if(taker!=null&&taker>=1.15)flags.push('공격적 매수 우위');if(taker!=null&&taker<=.87)flags.push('공격적 매도 우위');return{flags,pressure:flags.length>=3?'레버리지 과열':flags.length?'레버리지 확대':'중립'}}
async function bybitDerivatives(symbol){const [tickerR,oiR]=await Promise.allSettled([
  getBybit('/v5/market/tickers?category=linear&symbol='+encodeURIComponent(symbol)),
  getBybit('/v5/market/open-interest?category=linear&symbol='+encodeURIComponent(symbol)+'&intervalTime=1h&limit=25')
]);
const ticker=tickerR.status==='fulfilled'?tickerR.value?.result?.list?.[0]:null,rows=oiR.status==='fulfilled'&&Array.isArray(oiR.value?.result?.list)?oiR.value.result.list:[];
if(!ticker&&!rows.length)return null;
const hist=[...rows].map(x=>({ts:num(x.timestamp),oi:num(x.openInterest)})).filter(x=>x.ts!=null&&x.oi!=null).sort((a,b)=>a.ts-b.ts),mark=num(ticker?.markPrice)||num(ticker?.lastPrice),contracts=num(ticker?.openInterest)||hist.at(-1)?.oi||null,oiUsd=num(ticker?.openInterestValue)||(contracts!=null&&mark!=null?contracts*mark:null),oi24=hist.length>1?pct(hist[0].oi,hist.at(-1).oi):null,funding=num(ticker?.fundingRate),fundingPct=funding!=null?funding*100:null,{flags,pressure}=pressureFrom({oi24,fundingPct,taker:null});
return{ok:true,derivatives:true,available:true,symbol,updatedAt:new Date().toISOString(),markPrice:mark,openInterestContracts:contracts,openInterestUsdApprox:oiUsd,openInterestChange24hPct:oi24,fundingRatePct:fundingPct,takerBuySellRatio:null,pressure,flags,source:'Bybit linear public market data fallback',note:'Binance USD-M public endpoint unavailable from this server; derivatives context fell back to Bybit linear public data. Taker buy/sell ratio is left unavailable rather than substituted with a different metric.'}
}
async function derivatives(symbol){const [pR,oR,hR,tR]=await Promise.allSettled([
  getJson('/fapi/v1/premiumIndex?symbol='+encodeURIComponent(symbol)),
  getJson('/fapi/v1/openInterest?symbol='+encodeURIComponent(symbol)),
  getJson('/futures/data/openInterestHist?symbol='+encodeURIComponent(symbol)+'&period=1h&limit=25'),
  getJson('/futures/data/takerlongshortRatio?symbol='+encodeURIComponent(symbol)+'&period=1h&limit=24')
]);
const p=pR.status==='fulfilled'?pR.value:null,o=oR.status==='fulfilled'?oR.value:null,h=hR.status==='fulfilled'&&Array.isArray(hR.value)?hR.value:[],t=tR.status==='fulfilled'&&Array.isArray(tR.value)?tR.value:[];
if(!p&&!o&&!h.length&&!t.length){const fallback=await bybitDerivatives(symbol).catch(()=>null);if(fallback)return fallback;return{ok:true,derivatives:true,available:false,symbol,note:'Public derivatives data unavailable',errors:[pR,oR,hR,tR].filter(x=>x.status==='rejected').map(x=>x.reason?.message||String(x.reason)).slice(0,4)}}
const mark=num(p?.markPrice),contracts=num(o?.openInterest),oiUsd=contracts!=null&&mark!=null?contracts*mark:null,oi24=h.length>1?pct(h[0]?.sumOpenInterestValue,h.at(-1)?.sumOpenInterestValue):null,funding=num(p?.lastFundingRate),fundingPct=funding!=null?funding*100:null,ratios=t.map(x=>num(x.buySellRatio)).filter(Number.isFinite),taker=ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:null,{flags,pressure}=pressureFrom({oi24,fundingPct,taker});
return{ok:true,derivatives:true,available:true,symbol,updatedAt:new Date().toISOString(),markPrice:mark,openInterestContracts:contracts,openInterestUsdApprox:oiUsd,openInterestChange24hPct:oi24,fundingRatePct:fundingPct,takerBuySellRatio:taker,pressure,flags,source:'Binance USD-M public market data'}
}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=30');try{const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'');if(String(req.query.derivatives||'')==='1')return res.status(200).json(await derivatives(symbol));const s=await runSpot(req);if(s.code<400&&s.body?.ok)return res.status(200).json({...s.body,market:'spot'});const interval=String(req.query.interval||'1h'),limit=Number(req.query.limit)||500;const f=await futures.structure(symbol,interval,limit);return res.status(200).json(f)}catch(e){return res.status(502).json({ok:false,error:e?.message||'Structure fetch failed'})}}

const spot=require('../lib/spot-structure.js');
const futures=require('../lib/futures-data.js');
function capture(){let code=200,body=null;return{res:{setHeader(){},status(c){code=c;return this},json(v){body=v;return this}},get:()=>({code,body})}}
async function runSpot(req){const c=capture();try{await spot(req,c.res)}catch(e){return{code:500,body:{ok:false,error:e?.message||String(e)}}}return c.get()}
const BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];
const SPOT_BASES=['https://api.binance.com','https://api-gcp.binance.com','https://data-api.binance.vision'];
async function fetchAny(bases,path,timeout=4500){let last;for(const base of bases){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(base+path,{signal:ctl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Pro/3.13'}});const text=await r.text();clearTimeout(to);if(!r.ok){last=new Error('HTTP '+r.status);continue}if(!text.trim())throw new Error('Empty response');return JSON.parse(text)}catch(e){clearTimeout(to);last=e}}throw last||new Error('Public market fetch failed')}
async function getJson(path){return fetchAny(BASES,path,4500)}
const BYBIT_BASES=['https://api.bybit.com','https://api.bytick.com'];
async function getBybit(path){let last;for(const base of BYBIT_BASES){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),4500);try{const r=await fetch(base+path,{signal:ctl.signal,headers:{accept:'application/json'}});const text=await r.text();clearTimeout(to);if(!r.ok){last=new Error('HTTP '+r.status);continue}if(!text.trim())throw new Error('Empty response');const j=JSON.parse(text);if(j?.retCode!==0){last=new Error(j?.retMsg||'Bybit API error');continue}return j}catch(e){clearTimeout(to);last=e}}throw last||new Error('Bybit linear fetch failed')}
async function getCoinGecko(path){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),7000);try{const r=await fetch('https://api.coingecko.com/api/v3'+path,{signal:ctl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Pro/3.13'}});const text=await r.text();if(!r.ok)throw new Error('CoinGecko HTTP '+r.status);if(!text.trim())throw new Error('CoinGecko empty response');return JSON.parse(text)}finally{clearTimeout(to)}}
const num=v=>{v=Number(v);return Number.isFinite(v)?v:null};
function pct(a,b){a=num(a);b=num(b);return a!=null&&b!=null&&a!==0?(b-a)/Math.abs(a)*100:null}
function pressureFrom({oi24,fundingPct,taker}){const flags=[];if(oi24!=null&&oi24>=15)flags.push('OI 증가');if(oi24!=null&&oi24<=-15)flags.push('OI 감소');if(fundingPct!=null&&Math.abs(fundingPct)>=.03)flags.push(fundingPct>0?'양(+) 펀딩':'음(-) 펀딩');if(taker!=null&&taker>=1.15)flags.push('공격적 매수 우위');if(taker!=null&&taker<=.87)flags.push('공격적 매도 우위');return{flags,pressure:flags.length>=3?'레버리지 과열':flags.length?'레버리지 확대':'중립'}}
async function liveKline(symbol,interval,market='spot'){
  try{
    const isFutures=market==='futures';
    const raw=await fetchAny(isFutures?BASES:SPOT_BASES,(isFutures?'/fapi/v1/klines':'/api/v3/klines')+'?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(interval)+'&limit=2',3500);
    if(!Array.isArray(raw)||!raw.length)throw new Error('No kline data');
    const k=raw.at(-1);
    return{ok:true,live:true,available:true,market:isFutures?'futures':'spot',symbol,interval,updatedAt:new Date().toISOString(),candle:{time:num(k[0]),open:num(k[1]),high:num(k[2]),low:num(k[3]),close:num(k[4]),volume:num(k[5]),closeTime:num(k[6]),closed:num(k[6])<Date.now()}};
  }catch(e){return{ok:true,live:true,available:false,market,symbol,interval,error:e?.message||'Live kline unavailable'}}
}
async function bybitDerivatives(symbol){const [tickerR,oiR]=await Promise.allSettled([
  getBybit('/v5/market/tickers?category=linear&symbol='+encodeURIComponent(symbol)),
  getBybit('/v5/market/open-interest?category=linear&symbol='+encodeURIComponent(symbol)+'&intervalTime=1h&limit=25')
]);
const ticker=tickerR.status==='fulfilled'?tickerR.value?.result?.list?.[0]:null,rows=oiR.status==='fulfilled'&&Array.isArray(oiR.value?.result?.list)?oiR.value.result.list:[];
if(!ticker&&!rows.length)return null;
const hist=[...rows].map(x=>({ts:num(x.timestamp),oi:num(x.openInterest)})).filter(x=>x.ts!=null&&x.oi!=null).sort((a,b)=>a.ts-b.ts),mark=num(ticker?.markPrice)||num(ticker?.lastPrice),contracts=num(ticker?.openInterest)||hist.at(-1)?.oi||null,oiUsd=num(ticker?.openInterestValue)||(contracts!=null&&mark!=null?contracts*mark:null),oi24=hist.length>1?pct(hist[0].oi,hist.at(-1).oi):null,funding=num(ticker?.fundingRate),fundingPct=funding!=null?funding*100:null,{flags,pressure}=pressureFrom({oi24,fundingPct,taker:null});
return{ok:true,derivatives:true,available:true,symbol,updatedAt:new Date().toISOString(),markPrice:mark,openInterestContracts:contracts,openInterestUsdApprox:oiUsd,openInterestChange24hPct:oi24,fundingRatePct:fundingPct,takerBuySellRatio:null,pressure,flags,source:'Bybit linear public market data fallback',note:'Binance USD-M public endpoint unavailable from this server; derivatives context fell back to Bybit linear public data. Taker buy/sell ratio is left unavailable rather than substituted with a different metric.'}
}
async function coingeckoDerivatives(symbol){try{const rows=await getCoinGecko('/derivatives');if(!Array.isArray(rows))return null;const exact=rows.filter(x=>String(x.symbol||'').toUpperCase()===symbol&&String(x.contract_type||'').toLowerCase()==='perpetual');const row=exact.find(x=>/binance/i.test(String(x.market||'')))||exact.sort((a,b)=>(num(b.open_interest)||0)-(num(a.open_interest)||0))[0];if(!row)return null;const fundingPct=num(row.funding_rate),oiUsd=num(row.open_interest),mark=num(row.price)||num(row.index),{flags,pressure}=pressureFrom({oi24:null,fundingPct,taker:null});return{ok:true,derivatives:true,available:true,symbol,updatedAt:new Date().toISOString(),markPrice:mark,openInterestContracts:null,openInterestUsdApprox:oiUsd,openInterestChange24hPct:null,fundingRatePct:fundingPct,takerBuySellRatio:null,pressure,flags,source:'CoinGecko derivatives public data fallback',note:'Direct exchange derivatives endpoints were unavailable from this server. CoinGecko public derivatives data is used for current open interest and funding only; 24h OI change and taker buy/sell are intentionally left unavailable.'}}catch{return null}}
async function derivatives(symbol){const [pR,oR,hR,tR]=await Promise.allSettled([
  getJson('/fapi/v1/premiumIndex?symbol='+encodeURIComponent(symbol)),
  getJson('/fapi/v1/openInterest?symbol='+encodeURIComponent(symbol)),
  getJson('/futures/data/openInterestHist?symbol='+encodeURIComponent(symbol)+'&period=1h&limit=25'),
  getJson('/futures/data/takerlongshortRatio?symbol='+encodeURIComponent(symbol)+'&period=1h&limit=24')
]);
const p=pR.status==='fulfilled'?pR.value:null,o=oR.status==='fulfilled'?oR.value:null,h=hR.status==='fulfilled'&&Array.isArray(hR.value)?hR.value:[],t=tR.status==='fulfilled'&&Array.isArray(tR.value)?tR.value:[];
if(!p&&!o&&!h.length&&!t.length){const fallback=(await bybitDerivatives(symbol).catch(()=>null))||(await coingeckoDerivatives(symbol));if(fallback)return fallback;return{ok:true,derivatives:true,available:false,symbol,note:'Public derivatives data unavailable',errors:[pR,oR,hR,tR].filter(x=>x.status==='rejected').map(x=>x.reason?.message||String(x.reason)).slice(0,4)}}
const mark=num(p?.markPrice),contracts=num(o?.openInterest),oiUsd=contracts!=null&&mark!=null?contracts*mark:null,oi24=h.length>1?pct(h[0]?.sumOpenInterestValue,h.at(-1)?.sumOpenInterestValue):null,funding=num(p?.lastFundingRate),fundingPct=funding!=null?funding*100:null,ratios=t.map(x=>num(x.buySellRatio)).filter(Number.isFinite),taker=ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:null,{flags,pressure}=pressureFrom({oi24,fundingPct,taker});
return{ok:true,derivatives:true,available:true,symbol,updatedAt:new Date().toISOString(),markPrice:mark,openInterestContracts:contracts,openInterestUsdApprox:oiUsd,openInterestChange24hPct:oi24,fundingRatePct:fundingPct,takerBuySellRatio:taker,pressure,flags,source:'Binance USD-M public market data'}
}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','s-maxage=5, stale-while-revalidate=10');try{const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),interval=String(req.query.interval||'1h');if(String(req.query.live||'')==='1')return res.status(200).json(await liveKline(symbol,interval,String(req.query.market||'spot')));if(String(req.query.derivatives||'')==='1')return res.status(200).json(await derivatives(symbol));const s=await runSpot(req);if(s.code<400&&s.body?.ok)return res.status(200).json({...s.body,market:'spot'});const limit=Number(req.query.limit)||500;const f=await futures.structure(symbol,interval,limit);return res.status(200).json(f)}catch(e){return res.status(502).json({ok:false,error:e?.message||'Structure fetch failed'})}}

const spot=require('../lib/spot-structure.js');
const futures=require('../lib/futures-data.js');
const {buildTrendlines}=require('../lib/trendline-engine.js');
function capture(){let code=200,body=null;return{res:{setHeader(){},status(c){code=c;return this},json(v){body=v;return this}},get:()=>({code,body})}}
async function runSpot(req){const c=capture();try{await spot(req,c.res)}catch(e){return{code:500,body:{ok:false,error:e?.message||String(e)}}}return c.get()}
function withEnhancedTrendlines(body,interval){
  try{
    if(!body?.ok||!Array.isArray(body.candles)||!Array.isArray(body.canonicalSwings))return body;
    const confirmedCandles=body.candles.filter(x=>x&&x.partial!==true);
    const trendlines=buildTrendlines({candles:confirmedCandles,swings:body.canonicalSwings,bias:body.bias,interval,source:'canonical_swing_regression_v2'});
    return{...body,trendlines,trendlineComparison:{...(body.trendlineComparison||{}),enhancedCanonical:{support:trendlines.support,resistance:trendlines.resistance,pair:trendlines.pair}},trendlineEngine:{version:'2.0',source:'shared canonical swing regression',rules:trendlines.parameters}};
  }catch(e){return{...body,trendlineEngine:{version:'2.0',error:e?.message||'trendline enhancement failed'}}}
}
const BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];
const SPOT_BASES=['https://api.binance.com','https://api-gcp.binance.com','https://data-api.binance.vision'];
async function fetchAny(bases,path,timeout=4500){let last;for(const base of bases){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(base+path,{signal:ctl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Pro/3.15'}});const text=await r.text();clearTimeout(to);if(!r.ok){last=new Error('HTTP '+r.status);continue}if(!text.trim())throw new Error('Empty response');return JSON.parse(text)}catch(e){clearTimeout(to);last=e}}throw last||new Error('Public market fetch failed')}
async function getJson(path){return fetchAny(BASES,path,4500)}
const BYBIT_BASES=['https://api.bybit.com','https://api.bytick.com'];
async function getBybit(path){let last;for(const base of BYBIT_BASES){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),4500);try{const r=await fetch(base+path,{signal:ctl.signal,headers:{accept:'application/json'}});const text=await r.text();clearTimeout(to);if(!r.ok){last=new Error('HTTP '+r.status);continue}if(!text.trim())throw new Error('Empty response');const j=JSON.parse(text);if(j?.retCode!==0){last=new Error(j?.retMsg||'Bybit API error');continue}return j}catch(e){clearTimeout(to);last=e}}throw last||new Error('Bybit linear fetch failed')}
async function getCoinGecko(path){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),7000);try{const r=await fetch('https://api.coingecko.com/api/v3'+path,{signal:ctl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Pro/3.15'}});const text=await r.text();if(!r.ok)throw new Error('CoinGecko HTTP '+r.status);if(!text.trim())throw new Error('CoinGecko empty response');return JSON.parse(text)}finally{clearTimeout(to)}}
const num=v=>{v=Number(v);return Number.isFinite(v)?v:null};
function pct(a,b){a=num(a);b=num(b);return a!=null&&b!=null&&a!==0?(b-a)/Math.abs(a)*100:null}
function pressureFrom({oi24,fundingPct,taker}){const flags=[];if(oi24!=null&&oi24>=15)flags.push('OI 증가');if(oi24!=null&&oi24<=-15)flags.push('OI 감소');if(fundingPct!=null&&Math.abs(fundingPct)>=.03)flags.push(fundingPct>0?'양(+) 펀딩':'음(-) 펀딩');if(taker!=null&&taker>=1.15)flags.push('공격적 매수 우위');if(taker!=null&&taker<=.87)flags.push('공격적 매도 우위');return{flags,pressure:flags.length>=3?'레버리지 과열':flags.length?'레버리지 확대':'중립'}}
async function marketMeta(symbol,market='spot'){
  try{
    let info=null;
    if(market==='futures'){
      const all=await fetchAny(BASES,'/fapi/v1/exchangeInfo',5000);
      info=Array.isArray(all?.symbols)?all.symbols.find(x=>String(x.symbol).toUpperCase()===symbol):null;
    }else{
      const all=await fetchAny(SPOT_BASES,'/api/v3/exchangeInfo?symbol='+encodeURIComponent(symbol),5000);
      info=Array.isArray(all?.symbols)?all.symbols[0]:null;
      if(!info){
        const fut=await fetchAny(BASES,'/fapi/v1/exchangeInfo',5000).catch(()=>null);
        info=Array.isArray(fut?.symbols)?fut.symbols.find(x=>String(x.symbol).toUpperCase()===symbol):null;
      }
    }
    if(!info)return{ok:true,meta:true,available:false,symbol,market};
    const priceFilter=(info.filters||[]).find(x=>x.filterType==='PRICE_FILTER')||{};
    const lot=(info.filters||[]).find(x=>x.filterType==='LOT_SIZE')||{};
    return{ok:true,meta:true,available:true,symbol,market,tickSize:num(priceFilter.tickSize),minPrice:num(priceFilter.minPrice),stepSize:num(lot.stepSize),pricePrecision:num(info.pricePrecision),quantityPrecision:num(info.quantityPrecision),status:info.status||null};
  }catch(e){return{ok:true,meta:true,available:false,symbol,market,error:e?.message||'Market metadata unavailable'}}
}
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

async function fetchSpotDailyHistory(symbol,maxBars=6000){
  let out=[],endTime=null;
  while(out.length<maxBars){
    const lim=Math.min(1000,maxBars-out.length),qs=new URLSearchParams({symbol,interval:'1d',limit:String(lim)});
    if(endTime!=null)qs.set('endTime',String(endTime));
    const rows=await fetchAny(SPOT_BASES,'/api/v3/klines?'+qs.toString(),5000);
    if(!Array.isArray(rows)||!rows.length)break;
    out=rows.concat(out);
    endTime=Number(rows[0][0])-1;
    if(rows.length<lim)break;
  }
  const now=Date.now(),seen=new Set();
  return out.filter(k=>Array.isArray(k)&&Number(k[6])<now).filter(k=>{const t=Number(k[0]);if(seen.has(t))return false;seen.add(t);return true}).sort((a,b)=>Number(a[0])-Number(b[0]));
}
function rollupGroup(g,partial=false){if(!g.length)return null;return[Number(g[0][0]),String(g[0][1]),String(Math.max(...g.map(k=>Number(k[2])))),String(Math.min(...g.map(k=>Number(k[3])))),String(g.at(-1)[4]),String(g.reduce((s,k)=>s+Number(k[5]||0),0)),Number(g.at(-1)[6]),partial]}
function aggregateFixedDaily(raw,days){
  const full=Math.floor(raw.length/days)*days,used=raw.slice(0,full),out=[];
  for(let i=0;i<used.length;i+=days){const row=rollupGroup(used.slice(i,i+days),false);if(row)out.push(row)}
  const tail=raw.slice(full),partialRow=rollupGroup(tail,true);
  return{rows:out,partialRow,partialTailBars:tail.length,sourceBars:raw.length};
}
function syntheticStructureFromDaily(symbol,interval,agg){
  const I=spot._internals||{},rows=agg.rows||[],displayRows=agg.partialRow?[...rows,agg.partialRow]:rows,days=interval==='28d'?28:14;
  if(rows.length<8)throw new Error(interval.toUpperCase()+' 합성봉 데이터 부족');
  const times=rows.map(k=>Number(k[0])),o=rows.map(k=>Number(k[1])),h=rows.map(k=>Number(k[2])),l=rows.map(k=>Number(k[3])),cl=rows.map(k=>Number(k[4])),v=rows.map(k=>Number(k[5]));
  const rr=I.rsi(cl),aa=I.atr(h,l,cl),vs=I.sma(v,20),e20=I.ema(cl,20),e60=I.ema(cl,60),rawPs=I.rawPivots(h,l,3,3).filter(p=>p.confirmedAt<=cl.length-1),canonical=I.canonicalSwings(rawPs),swings=canonical.swings,events=I.structureEvents(swings,cl,v,vs,times,aa,interval),av=aa.at(-1)||0,zs=I.mergeZones(I.preliminaryZones(rawPs,cl.at(-1),av,cl.length-1),cl.at(-1),av),bias=I.biasScore(swings,events,cl,e20,e60),canonicalPoints=swings.map(s=>({id:s.swingId,i:s.pivotIndex,type:s.type,price:s.price,confirmedAt:s.confirmedAt})),rawTls=I.trendlines(rawPs,cl,o,h,l,v,vs,aa,bias,times,'raw'),canonicalTls=I.trendlines(canonicalPoints,cl,o,h,l,v,vs,aa,bias,times,'canonical');
  return{ok:true,version:'3.15-htf-fixed',symbol,interval,dataSource:'Binance Spot 1D fixed-count rollup',snapshotTime:Date.now(),lastClosedOpenTime:Number(rows.at(-1)[0]),lastClosedCloseTime:Number(rows.at(-1)[6]),currentCandleExcluded:!agg.partialRow,pivotRule:{left:3,right:3,confirmedDelayBars:3,activation:'confirmedAt only',pipeline:'shared Structure Lab canonical swing'},candles:displayRows.map((k,i)=>i<rows.length?({time:times[i],open:o[i],high:h[i],low:l[i],close:cl[i],volume:v[i],rsi:rr[i],atr:aa[i],volSma20:vs[i],partial:false}):({time:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),partial:true})),rawPivots:rawPs.slice(-48),canonicalSwings:swings.slice(-32),swingRevisions:canonical.revisions.slice(-36),provisionalPivots:[],events,zones:zs,trendlines:rawTls,trendlineComparison:{raw:{support:I.lineSummary(rawTls.support),resistance:I.lineSummary(rawTls.resistance),dedup:rawTls.dedup},canonical:{support:I.lineSummary(canonicalTls.support),resistance:I.lineSummary(canonicalTls.resistance),dedup:canonicalTls.dedup},note:'Fixed-count synthetic TF using shared Structure Lab canonical swing pipeline.'},bias,htfDiagnostic:{status:'self',bias:bias?.label||'unknown',reason:'Synthetic HTF assessed on its own confirmed closes'},audit:{coreStatus:'PASS',htfStatus:'SELF',checks:{fixedCountAggregation:{status:'PASS'},partialTailExcluded:{status:'PASS',count:agg.partialTailBars},canonicalSwingPipeline:{status:'PASS'}}},scenario:I.scenario(cl.at(-1),zs,swings,av,interval),current:{price:Number((agg.partialRow||rows.at(-1))?.[4]),atr14:av,ema20:e20.at(-1),ema60:e60.at(-1)},syntheticAggregation:{mode:'fixed-count',sourceInterval:'1d',days,sourceClosedBars:agg.sourceBars,completeBars:rows.length,partialTailBars:agg.partialTailBars,partialTailDisplayed:!!agg.partialRow,partialTailExcludedFromStats:true,minimumLongTrendBars:40,anchor:'listing-first-closed-1D'},notes:{canonicalSwing:'Shared Structure Lab canonical swing pipeline',aggregation:'Fixed count from first available closed 1D candle; newest incomplete block excluded.'},disclaimer:'Educational HTF structure visualization. Synthetic 14D/28D bars are fixed-count rollups, not exchange-native intervals.'};
}
async function syntheticStructure(symbol,interval){
  const days=interval==='28d'?28:14,raw=await fetchSpotDailyHistory(symbol,6000),agg=aggregateFixedDaily(raw,days);
  return syntheticStructureFromDaily(symbol,interval,agg);
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
module.exports=async function handler(req,res){res.setHeader('Cache-Control','s-maxage=5, stale-while-revalidate=10');try{const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),interval=String(req.query.interval||'1h');if(String(req.query.live||'')==='1')return res.status(200).json(await liveKline(symbol,interval,String(req.query.market||'spot')));if(String(req.query.derivatives||'')==='1')return res.status(200).json(await derivatives(symbol));if(String(req.query.meta||'')==='1')return res.status(200).json(await marketMeta(symbol,String(req.query.market||'spot')));if(interval==='14d'||interval==='28d')return res.status(200).json(await syntheticStructure(symbol,interval));const s=await runSpot(req);if(s.code<400&&s.body?.ok)return res.status(200).json(withEnhancedTrendlines({...s.body,market:'spot'},interval));const limit=Number(req.query.limit)||500;const f=await futures.structure(symbol,interval,limit);return res.status(200).json(withEnhancedTrendlines(f,interval))}catch(e){return res.status(502).json({ok:false,error:e?.message||'Structure fetch failed'})}}

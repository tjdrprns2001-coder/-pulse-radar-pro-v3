'use strict';

const DQ=require('../coin-report/modules/data-quality.js');
const VP=require('../coin-report/modules/volume-profile.js');
const MS=require('../coin-report/modules/market-structure.js');
const LQ=require('../coin-report/modules/liquidity.js');
const ICT=require('../coin-report/modules/ict.js');
const SM=require('../coin-report/modules/smart-money.js');
const CF=require('../coin-report/modules/confluence.js');

const VERSION='CHART_API_v1.0.0';
const PARAMETER_VERSION='2026-10-08.chart-v1';
const TF_MS={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'8h':28800000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000};
const SUPPORTED_TF=new Set(Object.keys(TF_MS));
const DEFAULT_PROFILE={visible:500,warmup:300,total:800,max:2000,pageSize:500,priceBins:100,realtimeBuffer:50};
const TF_PROFILES={
  '1m':{visible:500,warmup:300,total:800},
  '5m':{visible:500,warmup:300,total:800},
  '15m':{visible:500,warmup:300,total:800},
  '1h':{visible:500,warmup:300,total:800},
  '4h':{visible:500,warmup:300,total:800},
  '12h':{visible:500,warmup:300,total:800},
  '1d':{visible:500,warmup:300,total:800},
  '3d':{visible:400,warmup:300,total:700},
  '1w':{visible:300,warmup:250,total:550}
};

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function cleanBase(v){
  let s=String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  s=s.replace(/^ASSET/,'').replace(/USDT$/,'');
  if(!/^[A-Z0-9]{1,20}$/.test(s)){const e=new Error('invalid asset');e.statusCode=400;throw e}
  return s;
}
function symbolFor(asset){return cleanBase(asset)+'USDT'}
function assetIdFor(asset){return 'asset:'+cleanBase(asset)}
function instrumentIdFor(asset,market='spot'){return (String(market).toLowerCase()==='perpetual'?'perp:':'spot:')+symbolFor(asset)}
function parseInstrumentId(v){
  const s=String(v||'').trim();
  const m=s.match(/^(spot|perp):([A-Z0-9]{2,24}USDT)$/i);
  if(!m){const e=new Error('invalid instrument_id');e.statusCode=400;throw e}
  return{market:m[1].toLowerCase()==='perp'?'perpetual':'spot',symbol:m[2].toUpperCase(),asset:cleanBase(m[2])}
}
function profileFor(tf,opts={}){
  const base={...DEFAULT_PROFILE,...(TF_PROFILES[tf]||{})};
  const visible=Math.max(50,Math.min(1000,Math.floor(finite(opts.visible)??base.visible)));
  const warmup=Math.max(0,Math.min(1000,Math.floor(finite(opts.warmup)??base.warmup)));
  const requested=Math.max(visible,Math.floor(finite(opts.total)??Math.max(base.total,visible+warmup)));
  const total=Math.max(visible,Math.min(DEFAULT_PROFILE.max,requested));
  const bins=Math.max(50,Math.min(200,Math.floor(finite(opts.priceBins)??base.priceBins??DEFAULT_PROFILE.priceBins)));
  return{visible,warmup:Math.min(warmup,Math.max(0,total-visible)),total,max:DEFAULT_PROFILE.max,pageSize:DEFAULT_PROFILE.pageSize,priceBins:bins,realtimeBuffer:DEFAULT_PROFILE.realtimeBuffer}
}
function sourceOf(rows,fallback='unknown'){return String(rows?._source||fallback)}
function normalizeRows(rows){return(Array.isArray(rows)?rows:[]).filter(Array.isArray)}
function mergeRows(parts){
  const map=new Map();
  for(const rows of parts||[])for(const r of normalizeRows(rows)){const t=finite(r[0]);if(t!=null)map.set(t,r)}
  return[...map.values()].sort((a,b)=>Number(a[0])-Number(b[0]))
}
function rowToCandle(r,nowMs){
  const ct=finite(r?.[6]),closed=ct!=null?ct<=nowMs:true;
  return{open_time:finite(r?.[0]),close_time:ct,open:finite(r?.[1]),high:finite(r?.[2]),low:finite(r?.[3]),close:finite(r?.[4]),volume_base:finite(r?.[5]),volume_quote:finite(r?.[7]),trade_count:finite(r?.[8]),taker_buy_quote:finite(r?.[10]),is_closed:closed}
}
function ema(values,period){
  const out=Array(values.length).fill(null);if(!values.length)return out;const k=2/(period+1);let e=Number(values[0]);
  for(let i=0;i<values.length;i++){if(i===0)e=Number(values[i]);else e=Number(values[i])*k+e*(1-k);if(i>=period-1)out[i]=e}
  return out
}
function rsi(values,period=14){
  const out=Array(values.length).fill(null);if(values.length<=period)return out;let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0)}
  gain/=period;loss/=period;out[period]=loss===0?100:100-100/(1+gain/loss);
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;out[i]=loss===0?100:100-100/(1+gain/loss)}
  return out
}
function indicatorSeries(bars){
  const closes=bars.map(x=>x.c),times=bars.map(x=>x.ct??x.t),map=vals=>vals.map((v,i)=>v==null?null:{time:times[i],value:v}).filter(Boolean);
  const e20=ema(closes,20),e50=ema(closes,50),e100=ema(closes,100),e200=ema(closes,200),rs=rsi(closes,14),fast=ema(closes,12),slow=ema(closes,26),macd=closes.map((_,i)=>fast[i]==null||slow[i]==null?null:fast[i]-slow[i]),sig=ema(macd.map(v=>v??0),9),hist=macd.map((v,i)=>v==null||sig[i]==null?null:v-sig[i]);
  return{ema20:map(e20),ema50:map(e50),ema100:map(e100),ema200:map(e200),rsi14:map(rs),macd:{line:map(macd),signal:map(sig),histogram:map(hist)}}
}
function volumeRatio(bars){const last=bars.at(-1),base=bars.slice(-21,-1).map(x=>finite(x.v)).filter(Number.isFinite);if(!last||!base.length)return null;const a=base.reduce((s,v)=>s+v,0)/base.length;return a>0?(finite(last.v)||0)/a:null}
function derivativeSummary(d={}){
  const cap=d.capability||{},v=d.v2Profile||d.derivativesProfile?.v2Profile||{};
  return{status:d.availabilityStatus||cap.availabilityStatus||d.status||'unavailable',data_status:d.dataAvailable===true?'valid':d.derivativesSupported===true?'unavailable':'unavailable',open_interest:finite(d.openInterest),open_interest_usd:finite(d.openInterestUsd??cap.aggregate?.openInterestUsd),oi_1h_pct:finite(v.oi1hPct??d.oiChangePct??cap.aggregate?.oi1hPct),oi_4h_pct:finite(v.oi4hPct??cap.aggregate?.oi4hPct),oi_24h_pct:finite(v.oi24hPct??cap.aggregate?.oi24hPct),funding_rate_pct:finite(d.fundingPct),funding_8h_pct:finite(d.funding8hPct??cap.aggregate?.funding8hPct),funding_interval_hours:finite(d.fundingIntervalHours),supported_venues:d.supportedVenues||cap.supportedVenues||[],data_venues:d.dataVenues||cap.dataVenues||[],representative_sources:d.representativeSources||null,estimated:false}
}
function oiSeriesFrom(d={}){
  const rows=d.v2Profile?.rows||d.derivativesProfile?.v2Profile?.rows||[];
  return(Array.isArray(rows)?rows:[]).map(x=>({time:finite(x?.timestamp),open_interest:finite(x?.sumOpenInterest),source:x?._fallbackSource||d.v2Profile?.fallbackSource||null})).filter(x=>x.time!=null&&x.open_interest!=null)
}
function fundingSeriesFrom(rows=[]){
  return(Array.isArray(rows)?rows:[]).map(x=>{const raw=x.ratePct??x.fundingRatePct??(x.fundingRate!=null?Number(x.fundingRate)*100:null);return{time:finite(x.time??x.fundingTime??x.fundingRateTimestamp),funding_rate_pct:finite(raw),source:x.source||x.venue||null}}).filter(x=>x.time!=null&&x.funding_rate_pct!=null)
}
function zoneObject(z,tf){
  const inv=z.score?.side==='bullish'?{type:'close_below',price:z.from}:z.score?.side==='bearish'?{type:'close_above',price:z.to}:null;
  const origins=z.items?.map(x=>finite(x.originTimestamp)).filter(Number.isFinite)||[];
  const confirmations=z.items?.map(x=>finite(x.confirmedAt??x.knownAt)).filter(Number.isFinite)||[];
  return{zone_id:z.zoneId,timeframe:tf,zone_type:(z.types||[]).join('+'),price_low:z.from,price_high:z.to,origin_time:origins.length?Math.min(...origins):null,confirmed_at:confirmations.length?Math.max(...confirmations):null,invalidated_at:null,status:z.status||'active',strength_score:z.score?.score??null,coverage:z.score?.coverage??null,confidence:z.score?.confidence||'limited',components:z.types||[],evidence:z.score?.evidence||{},missing_data:z.score?.missingData||[],invalidation_condition:inv,algorithm_version:VERSION,parameter_version:PARAMETER_VERSION,repaint_state:'confirmed'}
}
function structureEventObject(e,tf){
  return{event_id:[tf,e.type,e.side,e.eventAt,e.level].join(':'),timeframe:tf,event_type:String(e.type||'').toLowerCase(),direction:e.side||null,level_price:finite(e.level),event_time:finite(e.eventAt),confirmed_at:finite(e.knownAt??e.eventAt),status:'confirmed',evidence:{reference_swing_at:e.referenceSwingAt??null,close:e.close??null},algorithm_version:VERSION,repaint_state:'confirmed'}
}
function candlesForClient(rows,nowMs){return normalizeRows(rows).map(r=>rowToCandle(r,nowMs)).filter(x=>[x.open_time,x.open,x.high,x.low,x.close].every(Number.isFinite))}
function statusFromQuality(q){return['valid','delayed','partial','stale','suspect','invalid','unavailable'].includes(q)?q:'unavailable'}

function createChartV1Service({provider,now=()=>Date.now()}={}){
  if(!provider)throw new Error('provider required');
  const assetCache={value:null,expiresAt:0};

  async function fetchFrame(symbol,tf,count,market='spot'){
    const n=Math.max(2,Math.min(2000,Math.floor(count||800))),parts=[],sources=[],errors=[];
    async function recent(limit){
      const attempts=market==='perpetual'
        ?[['FUTURES',()=>provider.getFuturesKlines(symbol,tf,limit)],['AUTO',()=>provider.getKlines(symbol,tf,limit)]]
        :[['SPOT',()=>provider.getSpotKlines(symbol,tf,limit)],['FUTURES_FALLBACK',()=>provider.getFuturesKlines(symbol,tf,limit)],['AUTO',()=>provider.getKlines(symbol,tf,limit)]];
      for(const [label,fn] of attempts){if(typeof fn!=='function')continue;try{const rows=await fn();if(Array.isArray(rows)&&rows.length){sources.push(sourceOf(rows,label));return rows}}catch(e){errors.push(label+': '+String(e?.message||e))}}
      throw new Error(errors.join(' | ')||'market data unavailable')
    }
    const first=await recent(Math.min(1500,n));parts.push(first);
    if(n>1500&&typeof provider.getKlinesAt==='function'){
      const earliest=finite(first?.[0]?.[0]);if(earliest!=null){try{const older=await provider.getKlinesAt(symbol,tf,{endTime:earliest-1,rows:n-1500});if(Array.isArray(older)&&older.length){parts.push(older);sources.push(sourceOf(older,'HISTORICAL_FALLBACK'))}}catch(e){errors.push('historical: '+String(e?.message||e))}}
    }
    const rows=mergeRows(parts).slice(-n);
    return{rows,sources:[...new Set(sources)],errors,requested:n,returned:rows.length,requestedMarket:market,actualMarket:sources.some(x=>/FUTURES|BYBIT|OKX|GATE|SWAP|LINEAR/i.test(x))?'perpetual':market}
  }

  async function assets(){
    const stamp=now();if(assetCache.value&&assetCache.expiresAt>stamp)return assetCache.value;
    const map=new Map(),errors=[];
    try{const spot=await provider.getSpotUniverse();for(const x of spot?.symbols||[]){if(String(x?.quoteAsset||'').toUpperCase()!=='USDT'||String(x?.status||'').toUpperCase()!=='TRADING')continue;const base=String(x.baseAsset||'').toUpperCase();if(base)map.set(base,{asset_id:assetIdFor(base),symbol:base,name:null,asset_type:'coin',status:'active',spot:true,derivatives:false})}}catch(e){errors.push({source:'spot',error:String(e?.message||e)})}
    try{const d=await provider.getDerivativesSupportUniverse();for(const x of d?.items||[]){const base=String(x.baseAsset||cleanBase(x.symbol)).toUpperCase(),cur=map.get(base)||{asset_id:assetIdFor(base),symbol:base,name:null,asset_type:'coin',status:'active',spot:false,derivatives:false};cur.derivatives=true;cur.derivatives_venues=x.supportedVenues||[];map.set(base,cur)}if(d?.errors?.length)errors.push(...d.errors}catch(e){errors.push({source:'derivatives',error:String(e?.message||e)})}
    const value={data:[...map.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol)),errors,as_of:stamp};assetCache.value=value;assetCache.expiresAt=stamp+300000;return value
  }

  async function searchAssets(query='',limit=20){
    const a=await assets(),q=String(query||'').trim().toUpperCase(),n=Math.max(1,Math.min(100,Number(limit)||20));
    const data=a.data.filter(x=>!q||x.symbol.includes(q)||String(x.name||'').toUpperCase().includes(q)).slice(0,n);
    return{data,pagination:{limit:n,next_cursor:null},meta:{as_of:a.as_of,data_status:a.errors.length?'partial':'valid',errors:a.errors}}
  }
  async function getAsset(asset){const base=cleanBase(asset),a=await assets(),x=a.data.find(v=>v.symbol===base);if(!x){const e=new Error('asset not found');e.statusCode=404;throw e}return{data:x,meta:{as_of:a.as_of,data_status:a.errors.length?'partial':'valid'}}}
  async function getMarkets(asset){
    const base=cleanBase(asset),a=(await getAsset(base)).data,data=[];
    if(a.spot)data.push({instrument_id:instrumentIdFor(base,'spot'),market_id:'auto_spot_'+base.toLowerCase()+'_usdt',asset_id:a.asset_id,exchange_id:'auto',symbol:symbolFor(base),market_type:'spot',quote_asset:'USDT',contract_type:null,contract_size:null,funding_interval_seconds:null,status:'active'});
    if(a.derivatives)data.push({instrument_id:instrumentIdFor(base,'perpetual'),market_id:'auto_perp_'+base.toLowerCase()+'_usdt',asset_id:a.asset_id,exchange_id:'multi-venue',symbol:symbolFor(base),market_type:'perpetual',quote_asset:'USDT',contract_type:'perpetual',contract_size:null,funding_interval_seconds:null,status:'active',venues:a.derivatives_venues||[]});
    return{data,meta:{data_status:'valid',as_of:now()}}
  }

  async function getCandles(instrumentId,{timeframe='4h',limit=800,visible=500,warmup=300,includeWarmup=true,before=null}={}){
    const inst=parseInstrumentId(instrumentId),tf=String(timeframe||'4h').toLowerCase();if(!SUPPORTED_TF.has(tf)){const e=new Error('unsupported timeframe');e.statusCode=400;throw e}
    const p=profileFor(tf,{total:limit,visible,warmup}),stamp=now();let got;
    if(before!=null&&typeof provider.getKlinesAt==='function'){
      const end=Date.parse(String(before))||finite(before);const rows=await provider.getKlinesAt(inst.symbol,tf,{endTime:end,rows:Math.min(1500,p.total)});got={rows,sources:[sourceOf(rows,'historical')],errors:[],requested:p.total,returned:rows.length,requestedMarket:inst.market,actualMarket:inst.market}
    }else got=await fetchFrame(inst.symbol,tf,p.total,inst.market);
    const quality=DQ.normalizeFrame(got.rows,{tf,nowMs:stamp}),all=quality.bars,visibleBars=all.slice(-p.visible),warmupCount=Math.max(0,all.length-visibleBars.length),data=(includeWarmup?all:visibleBars).map(x=>({open_time:x.t,close_time:x.ct??null,open:x.o,high:x.h,low:x.l,close:x.c,volume_base:x.v,volume_quote:x.q,trade_count:null,is_closed:true,data_status:'valid',source:got.sources.join('|')||quality.source}));
    return{data:{instrument_id:instrumentId,timeframe:tf,candles:data,visible_range:{start_index:Math.max(0,data.length-visibleBars.length),end_index:Math.max(0,data.length-1),count:visibleBars.length},warmup_range:{start_index:0,end_index:Math.max(-1,warmupCount-1),count:warmupCount}},meta:{requested:p.total,returned:all.length,is_complete:all.length>=Math.min(p.total,got.returned),data_status:statusFromQuality(quality.state),as_of:quality.lastClosedAt,calculated_at:stamp,sources:got.sources,requested_market:got.requestedMarket,actual_market:got.actualMarket,errors:got.errors}}
  }

  async function derivativeBundle(symbol){
    const stamp=now(),[derivatives,execution,oiProfile,fundingHistory]=await Promise.all([
      typeof provider.getCoinReportDerivatives==='function'?provider.getCoinReportDerivatives(symbol).catch(()=>({})):Promise.resolve({}),
      typeof provider.getExecutionContext==='function'?provider.getExecutionContext(symbol,{spotListed:true,futuresListed:true}).catch(()=>null):Promise.resolve(null),
      typeof provider.getV2OiProfile==='function'?provider.getV2OiProfile(symbol).catch(()=>({rows:[]})):Promise.resolve({rows:[]}),
      typeof provider.getFundingHistory==='function'?provider.getFundingHistory(symbol,{limit:100}).catch(()=>[]):Promise.resolve([])
    ]);
    if(!derivatives.v2Profile)derivatives.v2Profile={};if(!(derivatives.v2Profile.rows||[]).length&&Array.isArray(oiProfile?.rows))derivatives.v2Profile.rows=oiProfile.rows;
    return{derivatives,execution,oiProfile,fundingHistory,stamp}
  }

  async function analyze(asset,{timeframe='4h',market='spot',visible=500,warmup=300,total=800,priceBins=100}={}){
    const base=cleanBase(asset),symbol=symbolFor(base),tf=String(timeframe||'4h').toLowerCase();if(!SUPPORTED_TF.has(tf)){const e=new Error('unsupported timeframe');e.statusCode=400;throw e}
    const p=profileFor(tf,{visible,warmup,total,priceBins}),stamp=now(),framePromise=fetchFrame(symbol,tf,p.total,market),htfTf=tf==='5m'||tf==='15m'?'1h':tf==='1h'?'4h':tf==='4h'||tf==='12h'?'1d':tf==='1d'||tf==='3d'?'1w':null;
    const [got,db,htfGot]=await Promise.all([framePromise,derivativeBundle(symbol),htfTf?fetchFrame(symbol,htfTf,Math.min(800,p.total),market).catch(()=>null):Promise.resolve(null)]);
    const quality=DQ.normalizeFrame(got.rows,{tf,nowMs:stamp}),bars=quality.bars;
    if(bars.length<20){const e=new Error('insufficient candle data');e.statusCode=503;throw e}
    const currentPrice=bars.at(-1).c,profile=VP.analyze(bars,{bins:p.priceBins}),structure=MS.analyze(bars,{tf}),liquidity=LQ.analyze({bars,structure,execution:db.execution,currentPrice}),ict=ICT.analyze({bars,structure,liquidity,currentPrice}),vr=volumeRatio(bars);
    let htfTrend='unknown';if(htfGot){const hq=DQ.normalizeFrame(htfGot.rows,{tf:htfTf,nowMs:stamp});if(hq.bars.length)htfTrend=MS.analyze(hq.bars,{tf:htfTf}).trend}
    const deriv=derivativeSummary(db.derivatives),rawZones=CF.sourceZones({volumeProfile:profile,liquidity,ict,structure,currentPrice}),tol=Math.max((liquidity.atr||0)*.2,currentPrice*.0015),merged=CF.mergeZones(rawZones,{tolerance:tol});
    const bookImb=finite(liquidity?.orderbook?.imbalance10bps??liquidity?.orderbook?.imbalance25bps);
    const scoreCtx={htfTrend,volumeProfileAvailable:Boolean(profile?.available),ictAvailable:Boolean(ict?.available),volumeRatio:vr,derivativesAvailable:db.derivatives?.dataAvailable===true,oiChangePct:deriv.oi_4h_pct??deriv.oi_1h_pct,spotConfirmation:null,orderbookAvailable:Boolean(liquidity?.orderbook?.available),orderbookImbalance:bookImb};
    for(const z of merged)z.score=CF.scoreZone(z,scoreCtx);
    const zones=merged.map(z=>zoneObject(z,tf)).sort((a,b)=>Math.abs(((a.price_low+a.price_high)/2)-currentPrice)-Math.abs(((b.price_low+b.price_high)/2)-currentPrice));
    const sm=SM.candidate({bars,structure,liquidity,ict,volumeProfile:profile,derivatives:{dataAvailable:db.derivatives?.dataAvailable,oi4hPct:deriv.oi_4h_pct,oi1hPct:deriv.oi_1h_pct,funding8hPct:deriv.funding_8h_pct,fundingPct:deriv.funding_rate_pct}});
    const nearestResistance=merged.filter(z=>z.sides.includes('resistance')&&z.mid>=currentPrice).sort((a,b)=>a.mid-b.mid)[0]||null,nearestSupport=merged.filter(z=>z.sides.includes('support')&&z.mid<=currentPrice).sort((a,b)=>b.mid-a.mid)[0]||null;
    const breakout={up:CF.breakoutState({bars,structure,volumeRatio:vr,derivatives:{oi1hPct:deriv.oi_1h_pct,oi4hPct:deriv.oi_4h_pct,funding8hPct:deriv.funding_8h_pct},zone:nearestResistance,htfTrend,role:'resistance'}),down:CF.breakoutState({bars,structure,volumeRatio:vr,derivatives:{oi1hPct:deriv.oi_1h_pct,oi4hPct:deriv.oi_4h_pct,funding8hPct:deriv.funding_8h_pct},zone:nearestSupport,htfTrend,role:'support'})};
    const rawLast=normalizeRows(got.rows).at(-1),currentCandleClosed=finite(rawLast?.[6])!=null?finite(rawLast[6])<=stamp:true,visibleBars=bars.slice(-p.visible),visibleStart=visibleBars[0]?.t??null,allIndicators=indicatorSeries(bars);
    const cut=(arr)=>Array.isArray(arr)?arr.filter(x=>x.time>=visibleStart):arr;
    const indicators={ema20:cut(allIndicators.ema20),ema50:cut(allIndicators.ema50),ema100:cut(allIndicators.ema100),ema200:cut(allIndicators.ema200),rsi14:cut(allIndicators.rsi14),macd:{line:cut(allIndicators.macd.line),signal:cut(allIndicators.macd.signal),histogram:cut(allIndicators.macd.histogram)}};
    const missing=[];if(profile.approximation)missing.push('trade_level_volume_profile');if(!liquidity.orderbook?.available)missing.push('orderbook_depth');if(!db.derivatives?.dataAvailable)missing.push('open_interest','funding');if(!db.fundingHistory?.length)missing.push('funding_history');missing.push('liquidations');
    const staleSeconds=quality.lastClosedAt!=null?Math.max(0,(stamp-quality.lastClosedAt)/1000):null,sourceCount=[...new Set(got.sources)].length,confidence=quality.state==='valid'&&missing.length<=2?'high':quality.state==='valid'&&missing.length<=4?'medium':quality.state==='invalid'?'unknown':'limited';
    const dataQuality={status:statusFromQuality(quality.state),stale_seconds:staleSeconds,sources:got.sources,source_count:sourceCount,requested_market:got.requestedMarket,actual_market:got.actualMarket,missing_fields:[...new Set(missing)],current_candle_closed:currentCandleClosed,last_closed_candle:quality.lastClosedAt,repaint_state:currentCandleClosed?'confirmed':'provisional',confidence};
    const oiSeries=oiSeriesFrom({...db.derivatives,v2Profile:{...(db.derivatives.v2Profile||{}),rows:db.oiProfile?.rows||db.derivatives.v2Profile?.rows||[]}}),fundingSeries=fundingSeriesFrom(db.fundingHistory);
    return{base,symbol,tf,p,stamp,bars,visibleBars,currentPrice,profile,structure,liquidity,ict,smartMoney:sm,zones,breakout,derivatives:deriv,oiSeries,fundingSeries,indicators,dataQuality,htfTrend,source:got}
  }

  async function chart(asset,opts={}){
    const a=await analyze(asset,opts),visibleStart=a.visibleBars[0]?.t??null;
    return{asset:{asset_id:assetIdFor(a.base),symbol:a.base},chart:{timeframe:a.tf,start_time:a.visibleBars[0]?.t??null,end_time:a.visibleBars.at(-1)?.ct??a.visibleBars.at(-1)?.t??null,visible_candle_count:a.visibleBars.length,warmup_candle_count:Math.max(0,a.bars.length-a.visibleBars.length),total_candle_count:a.bars.length,max_candle_count:a.p.max,max_render_candles:1000,pagination_size:a.p.pageSize,price_bins:a.p.priceBins,realtime_buffer:a.p.realtimeBuffer},candles:a.visibleBars.map(x=>({open_time:x.t,close_time:x.ct,open:x.o,high:x.h,low:x.l,close:x.c,volume_base:x.v,volume_quote:x.q,is_closed:true})),volume:a.visibleBars.map(x=>({time:x.ct??x.t,value:x.v})),indicators:a.indicators,volume_profile:{precision:a.profile.approximation?'estimated':'exact',source:a.profile.sourcePrecision||null,calculation_candles:a.bars.length,display_candles:a.visibleBars.length,poc:a.profile.poc||null,vah:a.profile.vah??null,val:a.profile.val??null,hvn:a.profile.hvn||[],lvn:a.profile.lvn||[],nodes:(a.profile.nodes||[]).map(x=>({price_low:x.low,price_high:x.high,price:x.mid,volume:x.volume}))},zones:a.zones.filter(z=>z.status!=='invalidated').slice(0,100),structure_events:(a.structure.events||[]).map(e=>structureEventObject(e,a.tf)).filter(e=>e.event_time>=visibleStart).slice(-50),swings:(a.structure.swings||[]).filter(x=>x.confirmedAt!=null&&x.confirmedAt>=visibleStart).slice(-80),open_interest:{status:a.oiSeries.length?'available':a.derivatives.status||'unavailable',series:a.oiSeries},funding:{status:a.fundingSeries.length?'available':a.derivatives.funding_rate_pct!=null?'partial':'unavailable',series:a.fundingSeries,current_rate_pct:a.derivatives.funding_rate_pct,current_8h_pct:a.derivatives.funding_8h_pct,venues:a.derivatives.data_venues},liquidations:{status:'unavailable',series:[]},orderbook:a.liquidity.orderbook||{available:false},smart_money:a.smartMoney,breakout:a.breakout,data_quality:a.dataQuality,confidence:a.dataQuality.confidence,as_of:a.dataQuality.last_closed_candle,calculated_at:a.stamp,algorithm_version:VERSION,parameter_version:PARAMETER_VERSION}
  }

  async function overview(asset,opts={}){
    const a=await analyze(asset,opts);
    return{data:{asset_id:assetIdFor(a.base),symbol:a.base,timeframe:a.tf,as_of:a.dataQuality.last_closed_candle,current_price:a.currentPrice,market_structure:{trend:a.structure.trend,last_bos:a.structure.lastBos,last_choch:a.structure.lastChoch,range:a.structure.range,htf_trend:a.htfTrend},volume_profile:{poc:a.profile.poc,vah:a.profile.vah,val:a.profile.val,precision:a.profile.approximation?'estimated':'exact'},liquidity_zones:a.zones.filter(z=>/liquidity/.test(z.zone_type)),ict_zones:a.zones.filter(z=>/order_block|fvg/.test(z.zone_type)),derivatives:a.derivatives,breakout:a.breakout,smart_money:a.smartMoney,confidence:a.dataQuality.confidence,missing_fields:a.dataQuality.missing_fields},meta:{algorithm_version:VERSION,parameter_version:PARAMETER_VERSION,data_quality:a.dataQuality}}
  }
  async function structure(asset,opts={}){const a=await analyze(asset,opts);return{data:(a.structure.events||[]).map(e=>structureEventObject(e,a.tf)),meta:{asset_id:assetIdFor(a.base),timeframe:a.tf,trend:a.structure.trend,data_quality:a.dataQuality,algorithm_version:VERSION}}}
  async function zones(asset,opts={}){const a=await analyze(asset,opts);return{data:a.zones,meta:{asset_id:assetIdFor(a.base),timeframe:a.tf,current_price:a.currentPrice,data_quality:a.dataQuality,algorithm_version:VERSION,parameter_version:PARAMETER_VERSION}}}
  async function openInterest(instrumentId,opts={}){const inst=parseInstrumentId(instrumentId),db=await derivativeBundle(inst.symbol),d=derivativeSummary(db.derivatives),series=oiSeriesFrom({...db.derivatives,v2Profile:{...(db.derivatives.v2Profile||{}),rows:db.oiProfile?.rows||[]}});return{data:series,meta:{status:series.length?'available':d.status||'unavailable',data_status:series.length?'valid':'unavailable',source_count:d.data_venues.length,as_of:series.at(-1)?.time??db.stamp,supported_venues:d.supported_venues,data_venues:d.data_venues}}}
  async function funding(instrumentId){const inst=parseInstrumentId(instrumentId),db=await derivativeBundle(inst.symbol),d=derivativeSummary(db.derivatives),series=fundingSeriesFrom(db.fundingHistory);return{data:series,meta:{status:series.length?'available':d.funding_rate_pct!=null?'partial':d.status||'unavailable',data_status:series.length?'valid':d.funding_rate_pct!=null?'partial':'unavailable',current_rate_pct:d.funding_rate_pct,current_8h_pct:d.funding_8h_pct,source_count:d.data_venues.length,as_of:series.at(-1)?.time??db.stamp}}}
  async function quality(asset,opts={}){const a=await analyze(asset,opts);return{data:{asset_id:assetIdFor(a.base),overall_status:a.dataQuality.status,freshness:{market:a.dataQuality.stale_seconds,open_interest:a.oiSeries.length?Math.max(0,(a.stamp-a.oiSeries.at(-1).time)/1000):null,funding:a.fundingSeries.length?Math.max(0,(a.stamp-a.fundingSeries.at(-1).time)/1000):null},coverage:{ohlcv:true,open_interest:a.oiSeries.length>0,funding:a.derivatives.funding_rate_pct!=null,liquidations:false,orderbook:Boolean(a.liquidity.orderbook?.available)},missing_fields:a.dataQuality.missing_fields,source_count:a.dataQuality.source_count,last_validated_at:a.stamp,confidence:a.dataQuality.confidence},meta:{algorithm_version:VERSION,parameter_version:PARAMETER_VERSION}}}

  return{VERSION,PARAMETER_VERSION,searchAssets,getAsset,getMarkets,getCandles,chart,overview,structure,zones,openInterest,funding,quality,analyze,profileFor,assetIdFor,instrumentIdFor,parseInstrumentId}
}

module.exports={VERSION,PARAMETER_VERSION,DEFAULT_PROFILE,TF_PROFILES,createChartV1Service,cleanBase,symbolFor,assetIdFor,instrumentIdFor,parseInstrumentId,profileFor};

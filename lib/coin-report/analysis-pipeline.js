'use strict';
const DQ=require('./modules/data-quality.js');
const VP=require('./modules/volume-profile.js');
const MS=require('./modules/market-structure.js');
const LQ=require('./modules/liquidity.js');
const ICT=require('./modules/ict.js');
const SM=require('./modules/smart-money.js');
const CF=require('./modules/confluence.js');
const VERSION='COIN_ANALYSIS_PIPELINE_v1.0.0';
const PARAMETER_VERSION='2026-10-08.v1';
const TFS=['15m','1h','4h','1d'];
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function volumeRatio(bars){if(!bars?.length)return null;const last=bars.at(-1),base=bars.slice(-21,-1).map(x=>finite(x.v)).filter(Number.isFinite);if(!base.length||last?.v==null)return null;const a=base.reduce((s,v)=>s+v,0)/base.length;return a>0?last.v/a:null}
function derivativeView(d={}){
 const v=d.v2Profile||d.derivativesProfile?.v2Profile||{},cap=d.capability||{};
 return{status:d.status||cap.status||'unknown',derivativesSupported:d.derivativesSupported??cap.derivativesSupported??null,dataAvailable:d.dataAvailable??cap.dataAvailable??null,oi1hPct:finite(v.oi1hPct??d.oiChangePct),oi4hPct:finite(v.oi4hPct),oi24hPct:finite(v.oi24hPct),fundingPct:finite(d.fundingPct??v.fundingRate),funding8hPct:finite(d.funding8hPct??v.funding8hPct??cap.aggregate?.funding8hPct),openInterestUsd:finite(d.openInterestUsd??cap.aggregate?.openInterestUsd),supportedVenues:d.supportedVenues||cap.supportedVenues||[],dataVenues:d.dataVenues||cap.dataVenues||[],estimated:false}
}
function confidenceFromQuality(q,coverage){if(q.state==='invalid'||q.state==='stale')return'limited';if(q.state==='suspect')return'low';if(coverage>=.75&&q.state==='valid')return'high';if(coverage>=.5)return'medium';return'limited'}
function analyzeFrame(tf,raw,{nowMs,execution}={}){
 const quality=DQ.normalizeFrame(raw,{tf,nowMs}),bars=quality.bars;if(!bars.length)return{tf,quality,available:false};
 const currentPrice=bars.at(-1).c,profile=VP.analyze(bars,{bins:tf==='1d'?64:48}),structure=MS.analyze(bars,{tf}),liquidity=LQ.analyze({bars,structure,execution,currentPrice}),ict=ICT.analyze({bars,structure,liquidity,currentPrice}),vr=volumeRatio(bars);
 return{tf,available:true,quality,currentPrice,volumeRatio:vr,volumeProfile:profile,structure,liquidity,ict}
}
function standardizedZones(zones,tf,currentPrice){
 return(zones||[]).map(z=>({zone_id:z.zoneId,timeframe:tf,zone_type:z.types.join('+'),price_low:z.from,price_high:z.to,origin_timestamp:z.originTimestamp||null,last_test_timestamp:z.lastTestTimestamp||null,status:z.status||'active',side:z.score?.side||'neutral',confluence_score:z.score?.score??null,coverage:z.score?.coverage??null,confidence:z.score?.confidence||'limited',evidence:z.score?.evidence||{},missing_data:z.score?.missingData||[],invalidation_condition:z.score?.side==='bullish'?('close below '+z.from):z.score?.side==='bearish'?('close above '+z.to):null,distance_pct:currentPrice?((z.mid/currentPrice)-1)*100:null,data_source:[...new Set(z.items.flatMap(x=>x.evidence||[]))]}))
}
function run({symbol,frames={},derivatives={},execution=null,nowMs=Date.now()}={}){
 const normalized={},modules={};for(const tf of TFS){modules[tf]=analyzeFrame(tf,frames[tf],{nowMs,execution});normalized[tf]=modules[tf].quality}
 const primary=modules['4h']?.available?modules['4h']:modules['1h']?.available?modules['1h']:modules['1d'],htf=modules['1d']?.available?modules['1d']:primary,currentPrice=primary?.currentPrice??null,deriv=derivativeView(derivatives);
 if(!primary?.available){return{version:VERSION,parameterVersion:PARAMETER_VERSION,symbol:String(symbol||'').toUpperCase(),calculatedAt:nowMs,dataAsOf:null,currentPrice:null,modules,dataQuality:{...DQ.aggregateQuality(normalized),confidence:'limited'},zones:[],smartMoney:{available:false},breakout:{state:'needs_confirmation',reason:'primary_timeframe_missing'}}}
 const rawZones=CF.sourceZones({volumeProfile:primary.volumeProfile,liquidity:primary.liquidity,ict:primary.ict,structure:primary.structure,currentPrice});
 const tol=Math.max((primary.liquidity?.atr||0)*.2,(currentPrice||0)*.0015),merged=CF.mergeZones(rawZones,{tolerance:tol}),bookImb=finite(primary.liquidity?.orderbook?.imbalance10bps??primary.liquidity?.orderbook?.imbalance25bps);
 const scoreCtx={htfTrend:htf?.structure?.trend,volumeProfileAvailable:Boolean(primary.volumeProfile?.available),ictAvailable:Boolean(primary.ict?.available),volumeRatio:primary.volumeRatio,derivativesAvailable:deriv.dataAvailable,oiChangePct:deriv.oi4hPct??deriv.oi1hPct,spotConfirmation:null,orderbookAvailable:Boolean(primary.liquidity?.orderbook?.available),orderbookImbalance:bookImb};
 for(const z of merged)z.score=CF.scoreZone(z,scoreCtx);
 const zones=standardizedZones(merged,primary.tf,currentPrice).sort((a,b)=>Math.abs(a.distance_pct??999)-Math.abs(b.distance_pct??999));
 const smartMoney=SM.candidate({bars:primary.quality.bars,structure:primary.structure,liquidity:primary.liquidity,ict:primary.ict,volumeProfile:primary.volumeProfile,derivatives:deriv});
 const nearestResistance=merged.filter(z=>z.sides.includes('resistance')&&z.mid>=currentPrice).sort((a,b)=>a.mid-b.mid)[0]||null,nearestSupport=merged.filter(z=>z.sides.includes('support')&&z.mid<=currentPrice).sort((a,b)=>b.mid-a.mid)[0]||null;
 const breakout={up:CF.breakoutState({bars:primary.quality.bars,structure:primary.structure,volumeRatio:primary.volumeRatio,derivatives:deriv,zone:nearestResistance,htfTrend:htf?.structure?.trend}),down:CF.breakoutState({bars:primary.quality.bars,structure:primary.structure,volumeRatio:primary.volumeRatio,derivatives:deriv,zone:nearestSupport,htfTrend:htf?.structure?.trend})};
 const quality=DQ.aggregateQuality(normalized),missing=[];if(!deriv.dataAvailable)missing.push('derivatives_oi_funding');if(!primary.liquidity?.orderbook?.available)missing.push('orderbook_depth');if(primary.volumeProfile?.approximation)missing.push('trade_level_volume_profile');
 const coverage=1-(missing.length/3),dataAsOf=Math.max(0,...Object.values(normalized).map(x=>finite(x?.lastClosedAt)||0))||null;
 const dataQuality={...quality,missingFields:missing,confidence:confidenceFromQuality(quality,coverage),coverage,approximation:{volumeProfile:Boolean(primary.volumeProfile?.approximation),priceLiquidity:true,smartMoneyInstitutionalClaim:false},repaintPolicy:'closed candles only; pivots become usable only after confirmedAt'};
 return{version:VERSION,parameterVersion:PARAMETER_VERSION,symbol:String(symbol||'').toUpperCase(),calculatedAt:nowMs,dataAsOf,currentPrice,primaryTimeframe:primary.tf,modules,derivatives:deriv,zones,smartMoney,breakout,dataQuality,security:{readOnlyAnalytics:true,externalUrlsUserControlled:false,secretValuesReturned:false},definitions:{volumeProfile:'price-by-volume profile; OHLCV range allocation when trade-level data unavailable',liquidity:'price-structure inference separated from actual L2 snapshot',ict:'rule-based non-standardized price-action model',smartMoney:'confluence candidate only; institutional flow is never asserted'}}
}
module.exports={VERSION,PARAMETER_VERSION,TFS,volumeRatio,derivativeView,analyzeFrame,standardizedZones,run};

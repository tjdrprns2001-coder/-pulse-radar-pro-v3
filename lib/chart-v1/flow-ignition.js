'use strict';
const DQ=require('../coin-report/modules/data-quality.js');

const VERSION='FLOW_IGNITION_CAUSAL_v1.0.0';
const ALLOWED=new Set(['15m','1h','4h','1d']);
function n(v){if(v==null||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function round(v,d=4){return v==null||!Number.isFinite(v)?null:Number(v.toFixed(d))}
function mean(x){const a=x.filter(Number.isFinite);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function pct(a,b){return a!=null&&b>0?(a/b-1)*100:null}
function sum(x){return x.reduce((s,v)=>s+v,0)}
function source(rows,defaultSource){return rows?._source||defaultSource}
function alignedFlow(spotRows,futureRows,{tf='4h',nowMs=Date.now()}={}){
  const s=DQ.normalizeFrame(spotRows,{tf,nowMs}),f=DQ.normalizeFrame(futureRows,{tf,nowMs}),fs=source(spotRows,'BINANCE_SPOT'),ff=source(futureRows,'unknown_futures');
  const sx=new Map(s.bars.map(b=>[b.t,b])),match=[];
  for(const b of f.bars){const x=sx.get(b.t);if(x&&(x.ct??null)===(b.ct??null))match.push({time:b.ct,spot:x,futures:b})}
  const recent=match.slice(-3),end=match.at(-1)?.time??null,spotVol=recent.map(x=>x.spot.q),futureVol=recent.map(x=>x.futures.q);
  const volumeComparable=recent.length>=3&&spotVol.every(v=>v!=null&&v>=0)&&futureVol.every(v=>v!=null&&v>=0);
  const ratio=volumeComparable&&sum(futureVol)>0?sum(spotVol)/sum(futureVol):null;
  const last=match.at(-1),priceDeviation=last&&last.futures.c>0?Math.abs(last.spot.c/last.futures.c-1)*100:null;
  const spreadOk=priceDeviation!=null&&priceDeviation<=2;
  const venueComparable=fs.includes('BINANCE')&&ff.includes('BINANCE')?'same_venue':'cross_venue';
  const spotBuyShare=recent.length===3&&recent.every(x=>x.spot.buyQ!=null&&x.spot.q>0)?sum(recent.map(x=>x.spot.buyQ))/sum(spotVol):null;
  const futBuyShare=recent.length===3&&recent.every(x=>x.futures.buyQ!=null&&x.futures.q>0)?sum(recent.map(x=>x.futures.buyQ))/sum(futureVol):null;
  const fresh=end!=null&&(nowMs-end)<=2*(DQ.TF_MS[tf]||14400000);
  const status=!match.length?'unavailable':recent.length<3||!volumeComparable?'partial':!fresh?'stale':!spreadOk?'suspect':'available';
  const spotConfirmed=status==='available'&&spotBuyShare!=null&&spotBuyShare>=.53&&volumeComparable&&venueComparable==='same_venue';
  const reasons=[];
  if(!s.bars.length)reasons.push('spot_candles_unavailable');
  if(!f.bars.length)reasons.push('futures_candles_unavailable');
  if(match.length<3)reasons.push('insufficient_matched_closed_candles');
  if(!volumeComparable)reasons.push('quote_volume_missing');
  if(!fresh)reasons.push('aligned_data_stale');
  if(!spreadOk&&priceDeviation!=null)reasons.push('price_divergence_gt_2pct');
  if(venueComparable==='cross_venue')reasons.push('cross_venue_volume_not_directly_comparable');
  if(spotBuyShare==null)reasons.push('spot_taker_buy_quote_unavailable');
  return{status,timeframe:tf,source:{spot:fs,futures:ff},venue_comparability:venueComparable,spot_market_verified:fs==='BINANCE_SPOT',futures_market_verified:/FUTURES|LINEAR|SWAP|USDT/.test(ff),matched_closed_candles:match.length,latest_common_closed_at:end,latest_spot_closed_at:s.lastClosedAt,latest_futures_closed_at:f.lastClosedAt,quote_volume_last_3:{spot_usdt:volumeComparable?round(sum(spotVol),2):null,futures_usdt:volumeComparable?round(sum(futureVol),2):null,spot_to_futures_ratio:round(ratio,4)},last_close_price_difference_pct:round(priceDeviation,3),spot_taker_buy_share:round(spotBuyShare,4),futures_taker_buy_share:round(futBuyShare,4),spot_buy_confirmation:spotConfirmed?'confirmed':spotBuyShare==null?'unknown':'not_confirmed',missing_data:[...new Set(reasons)],confidence:status==='available'&&venueComparable==='same_venue'?'medium':status==='available'?'limited':'unknown'}
}
function oiAsOf(rows,asOf,{windowMs=4*3600000,freshMs=2*3600000}={}){
 const data=(Array.isArray(rows)?rows:[]).map(x=>({time:n(x.timestamp),open_interest:n(x.sumOpenInterest),source:x._fallbackSource||x.source||null})).filter(x=>x.time!=null&&x.open_interest!=null&&x.open_interest>=0&&x.time<=asOf).sort((a,b)=>a.time-b.time);
 const end=data.at(-1);
 if(!end)return{status:'unavailable',as_of:null,delta_pct:null,source:null,reason:'no_historical_oi_at_candle_close'};
 const prev=data.filter(x=>x.time<=end.time-windowMs).at(-1);
 if(asOf-end.time>freshMs)return{status:'stale',as_of:end.time,delta_pct:null,source:end.source,reason:'oi_observation_stale'};
 if(!prev||!prev.open_interest)return{status:'partial',as_of:end.time,delta_pct:null,source:end.source,reason:'oi_baseline_missing'};
 if(!prev.source||!end.source||prev.source!==end.source)return{status:'partial',as_of:end.time,delta_pct:null,source:end.source,reason:'oi_provider_mismatch'};
 const actual=end.time-prev.time;
 if(actual>windowMs*1.6)return{status:'partial',as_of:end.time,delta_pct:null,source:end.source,reason:'oi_history_gap'};
 return{status:'available',as_of:end.time,baseline_at:prev.time,delta_pct:round(pct(end.open_interest,prev.open_interest),4),source:end.source,window_ms:actual}
}
function fundingAsOf(rows,asOf){
 const data=(Array.isArray(rows)?rows:[]).map(x=>({time:n(x.time??x.fundingTime??x.fundingRateTimestamp),rate:n(x.ratePct??x.fundingRatePct??(x.fundingRate==null?null:Number(x.fundingRate)*100)),source:x.source??x.venue??null})).filter(x=>x.time!=null&&x.time<=asOf&&x.rate!=null).sort((a,b)=>a.time-b.time),end=data.at(-1);
 const stale=end!=null&&asOf-end.time>24*3600000;
 return{status:end?(stale?'stale':'available'):'unavailable',as_of:end?.time??null,rate_pct:stale?null:end?.rate??null,source:end?.source??null,reason:stale?'funding_observation_stale':end?null:'funding_as_of_missing'}
}
function emaLast(x,period){if(x.length<period)return null;const a=2/(period+1);let e=mean(x.slice(0,period));for(let i=period;i<x.length;i++)e+=a*(x[i]-e);return e}
function preIgnition(rows,{tf='4h',nowMs=Date.now(),flow=null,oi=null,funding=null}={}){
 const q=DQ.normalizeFrame(rows,{tf,nowMs}),bars=q.bars,at=q.lastClosedAt,missing=[];
 if(bars.length<95)return{stage:'insufficient_data',type:'unclassified',as_of:at,confidence:'unknown',missing_data:['95_closed_candles_required'],confirmed:false};
 const closes=bars.map(x=>x.c),last=bars.at(-1),look=bars.slice(-21,-1),volumeMean=mean(look.map(x=>x.v));
 const rvol=volumeMean>0?last.v/volumeMean:null;
 const emas=[14,28,57,92].map(i=>emaLast(closes,i)),width=Math.max(...emas)-Math.min(...emas),compression=width/last.c*100;
 const step=DQ.TF_MS[tf]||14400000,n24=Math.max(1,Math.round(86400000/step)),chg24=pct(last.c,bars.at(-1-n24)?.c);
 const high12=Math.max(...bars.slice(-13,-1).map(x=>x.h)),breakout=last.c>high12;
 const extended=chg24!=null&&chg24>=20;
 const flowConfirmed=flow?.spot_buy_confirmation==='confirmed';
 const flowUsable=flow?.status==='available'&&flow?.spot_market_verified===true;
 const oiUp=oi?.status==='available'&&oi.delta_pct!=null&&oi.delta_pct>=1;
 const volumeIgnited=rvol!=null&&rvol>=1.5;
 const ema14Above=last.c>emas[0],quiet=chg24!=null&&Math.abs(chg24)<=10&&compression<=10;
 if(!flowUsable)missing.push('verified_time_aligned_spot_futures_flow');
 if(oi?.status!=='available')missing.push('point_in_time_oi');
 if(funding?.status!=='available')missing.push('funding_as_of');
 const type=oiUp&&volumeIgnited?'A+B':oiUp?'A':volumeIgnited?'B':'unclassified';
 let stage='watch',confirmation=[];
 if(extended)stage='extended';
 else if(quiet&&ema14Above&&(oiUp||flowConfirmed))stage='pre';
 if(!extended&&breakout&&volumeIgnited&&flowConfirmed&&ema14Above)stage='early_ignition';
 if(!extended&&breakout&&volumeIgnited&&!flowConfirmed)stage='needs_spot_confirmation';
 if(q.state==='stale'||q.state==='invalid'||q.state==='suspect')stage='data_unreliable';
 if(quiet)confirmation.push('ema_compression','24h_no_extension');
 if(oiUp)confirmation.push('oi_rise_confirmed');
 if(volumeIgnited)confirmation.push('rvol_above_1_5');
 if(flowConfirmed)confirmation.push('aligned_spot_buy_flow');
 if(breakout)confirmation.push('12bar_close_breakout');
 return{stage,type,as_of:at,timeframe:tf,confirmed:false,score_label:'observation_only',features:{last_close:last.c,ema_width_pct:round(compression,3),change_24h_pct:round(chg24,3),rvol20:round(rvol,3),ema14_reclaimed:ema14Above,breakout_12bar_close:breakout,oi_delta_pct:oi?.status==='available'?oi.delta_pct:null,spot_buy_confirmation:flow?.spot_buy_confirmation||'unknown',funding_pct:funding?.rate_pct??null},confirmation,missing_data:missing,confidence:q.state!=='valid'?'limited':flowUsable&&oi?.status==='available'?'medium':'limited',invalidation:'확정봉 기준 EMA14 이탈 또는 최근 스윙 저점 이탈 시 PRE 관찰 무효. 실제 진입 판단은 별도 검증 필요.',warning:'점화 전 후보 구조 분류입니다. 상승을 보장하거나 매수 지시를 뜻하지 않습니다.'}
}
function createFlowIgnitionService({provider,now=()=>Date.now(),ttlMs=90000}={}){
 const cache=new Map();
 async function get(symbol,{timeframe='4h'}={}){
  const sym=String(symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,''),tf=String(timeframe||'4h').toLowerCase();
  if(!/^[A-Z0-9]{2,25}USDT$/.test(sym)||!ALLOWED.has(tf))throw Error('invalid symbol/timeframe');
  const stamp=now(),key=sym+':'+tf,old=cache.get(key);if(old&&old.until>stamp)return old.data;
  const [spotResult,futResult,oiResult,fundingResult]=await Promise.allSettled([
   provider.getSpotKlines(sym,tf,130),
   provider.getFuturesKlines(sym,tf,130),
   typeof provider.getV2OiProfile==='function'?provider.getV2OiProfile(sym):Promise.resolve({rows:[]}),
   typeof provider.getFundingHistory==='function'?provider.getFundingHistory(sym,{limit:50}):Promise.resolve([])
  ]);
  const spot=spotResult.status==='fulfilled'?spotResult.value:null,future=futResult.status==='fulfilled'?futResult.value:null;
  const strictSpot=spot&&Array.isArray(spot)?spot:null,strictFuture=future&&Array.isArray(future)?future:null;
  if(strictSpot&&strictSpot._source==null)Object.defineProperty(strictSpot,'_source',{value:'BINANCE_SPOT',configurable:true});
  const alignment=alignedFlow(strictSpot,strictFuture,{tf,nowMs:stamp});
  const asOf=DQ.normalizeFrame(strictFuture,{tf,nowMs:stamp}).lastClosedAt??null;
  const oi=asOf!=null?oiAsOf(oiResult.status==='fulfilled'?oiResult.value?.rows:[],asOf):{status:'unavailable',delta_pct:null,as_of:null};
  const funding=asOf!=null?fundingAsOf(fundingResult.status==='fulfilled'?fundingResult.value:[],asOf):{status:'unavailable',rate_pct:null,as_of:null};
  const candidate=preIgnition(strictFuture,{tf,nowMs:stamp,flow:alignment,oi,funding});
  const result={symbol:sym,timeframe:tf,as_of:asOf,calculated_at:stamp,spot_futures:alignment,open_interest:oi,funding,candidate,algorithm_version:VERSION,quality:{spot_status:spotResult.status==='fulfilled'?'available':'unavailable',futures_status:futResult.status==='fulfilled'?'available':'unavailable',errors:{spot:spotResult.status==='rejected'?String(spotResult.reason).slice(0,140):null,futures:futResult.status==='rejected'?String(futResult.reason).slice(0,140):null},historical_alignment_required:true}};
  cache.set(key,{until:stamp+ttlMs,data:result});if(cache.size>80)cache.delete(cache.keys().next().value);
  return result
 }
 return{get}
}
module.exports={VERSION,n,alignedFlow,oiAsOf,fundingAsOf,preIgnition,createFlowIgnitionService};

'use strict';
// Read-only Binance USD-M historical funding audit. No private endpoints/orders.
// Independent code; observational settlements are not proof of exhaustive funding coverage.
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const validSymbol=x=>/^[A-Z0-9]{2,25}USDT$/.test(String(x||'').toUpperCase());
function fundingEvent(raw,symbol,start,end){
 const time=finite(raw?.fundingTime),rate=finite(raw?.fundingRate),markPrice=finite(raw?.markPrice);
 if(String(raw?.symbol||'').toUpperCase()!==symbol||time===null||rate===null||
    time<start||time>end||Math.abs(rate)>1)return null;
 return {time,rate,markPrice:markPrice>0?markPrice:null,
   type:raw?.rateType==='Special'?'Special':raw?.rateType==='Regular'||raw?.rateType==null?'Regular':'UNKNOWN'};
}
async function fetchBinanceFundingWindow({symbol,startTime,endTime,fetchImpl=globalThis.fetch,base='https://fapi.binance.com',limit=1000,maxPages=10}={}){
 const s=String(symbol||'').toUpperCase(),start=finite(startTime),end=finite(endTime),
   header={version:'BINANCE_FUNDING_WINDOW_v1',symbol:s,source:'BINANCE_FUTURES',startTime:start,endTime:end};
 if(!validSymbol(s)||start===null||end===null||start<0||end<start||end>Date.now()+86400000||
   typeof fetchImpl!=='function'||!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(maxPages)||maxPages<1||maxPages>100)
   return {...header,status:'INVALID_INPUT',events:[]};
 let cursor=start,pageCount=0,stopped=false;const events=new Map();
 try{
  while(cursor<=end&&pageCount<maxPages){
   const qs=new URLSearchParams({symbol:s,startTime:String(Math.floor(cursor)),endTime:String(Math.floor(end)),limit:String(limit)});
   const res=await fetchImpl(base+'/fapi/v1/fundingRate?'+qs.toString(),{headers:{accept:'application/json'}});
   if(!res?.ok)throw new Error('BINANCE_HTTP_'+String(res?.status??'ERR'));
   const body=await res.json();
   if(!Array.isArray(body))throw new Error('INVALID_BINANCE_FUNDING_PAYLOAD');
   pageCount++;
   let mostRecent=null;
   for(const raw of body){
    const evt=fundingEvent(raw,s,start,end);
    if(!evt)throw new Error('INVALID_BINANCE_FUNDING_ROW');
    if(events.has(evt.time)&&JSON.stringify(events.get(evt.time))!==JSON.stringify(evt))
     throw new Error('CONFLICTING_FUNDING_ROW');
    events.set(evt.time,evt);mostRecent=Math.max(mostRecent??-Infinity,evt.time);
   }
   if(!body.length||body.length<limit){stopped=true;break}
   if(!Number.isFinite(mostRecent)||mostRecent<cursor)throw new Error('FUNDING_PAGINATION_STALLED');
   cursor=mostRecent+1;
  }
  const rows=[...events.values()].sort((a,b)=>a.time-b.time);
  return {...header,status:stopped||cursor>end?'READY':'INCOMPLETE_PAGE_LIMIT',
   eventCount:rows.length,pageCount,events:rows,
   coverage:'API_RANGE_ONLY_NOT_PROOF_OF_SETTLEMENT_CONTINUITY'};
 }catch(e){return{...header,status:'UNAVAILABLE',eventCount:events.size,pageCount,
   error:String(e?.message||e).slice(0,180),events:[],
   coverage:'UNAVAILABLE_NOT_ZERO'};}
}
// Positive funding rates require longs to pay; negative rates are a credit.
// Uses markPrice at settlement instead of falsely assuming position notional remains constant.
function auditFundingForTrades({symbol,trades,window}={}){
 const s=String(symbol||'').toUpperCase(),head={version:'FUNDING_SETTLEMENT_AUDIT_v1',source:'BINANCE_FUTURES',
   symbol:s,shadowOnly:true,tradeMode:'HYPOTHETICAL_LONG',cashflow:'MARK_PRICE_TIMES_QUANTITY',verifiedNet:false};
 if(!validSymbol(s)||!Array.isArray(trades)||window?.symbol!==s||window?.source!=='BINANCE_FUTURES')
   return{...head,status:'INVALID_INPUT',trades:[]};
 if(window.status!=='READY')return{...head,status:'UNAVAILABLE',trades:[],reason:'Funding time series unavailable or partial'};
 const rows=Array.isArray(window.events)?window.events:null;
 if(!rows)return{...head,status:'UNAVAILABLE',trades:[],reason:'Missing funding data'};
 const entries=[];let incomplete=0;
 for(const t of trades){
  const entry=finite(t?.entryTime),exit=finite(t?.exitTime),filledEntry=finite(t?.entryFillEstimate),
    total=finite(t?.estimatedAfterCostsExFundingPct),price=finite(t?.entryReferencePrice);
  if(t?.status!=='SIMULATED'||t?.symbol!==s||entry===null||exit===null||exit<=entry||
     filledEntry===null||filledEntry<=0||price===null||price<=0||total===null){
   entries.push({entryTime:entry,status:'INVALID_TRADE',estimatedAfterCostsAndObservedFundingPct:null});incomplete++;continue;
  }
  if(entry<window.startTime||exit>window.endTime){
   entries.push({entryTime:entry,status:'OUTSIDE_FETCHED_WINDOW',estimatedAfterCostsAndObservedFundingPct:null});incomplete++;continue;
  }
  const settlements=rows.filter(e=>e.time>entry&&e.time<=exit);
  if(!settlements.length||settlements.some(e=>!Number.isFinite(e.markPrice)||e.markPrice<=0||e.type==='UNKNOWN')){
   entries.push({entryTime:entry,status:'UNKNOWN_SETTLEMENT_COVERAGE_OR_MARK',settlementCount:settlements.length,
     estimatedAfterCostsAndObservedFundingPct:null});incomplete++;continue;
  }
  const deltas=settlements.slice(1).map((x,i)=>(x.time-settlements[i].time)/3600000);
  const summedRate=settlements.reduce((n,e)=>n+e.rate,0);
  const signedFundingPct=-100*settlements.reduce((n,e)=>n+e.markPrice*e.rate/filledEntry,0);
  const knownAfter=total+signedFundingPct;
  entries.push({entryTime:entry,exitTime:exit,status:'OBSERVED_SETTLEMENTS_ONLY',
    settlementCount:settlements.length,firstFundingTime:settlements[0].time,lastFundingTime:settlements.at(-1).time,
    maxObservedGapHours:deltas.length?Math.max(...deltas):null,hasPossibleGap:deltas.some(v=>v>8),
    signedFundingRateSum:summedRate,signedFundingCashflowPct:signedFundingPct,
    estimatedAfterCostsExFundingPct:total,
    estimatedAfterCostsAndObservedFundingPct:knownAfter,
    caution:'Potential missing/variable funding intervals; cannot call fully net without historic funding schedule verification'});
 }
 return {...head,status:incomplete?'PARTIAL':'OBSERVED_ONLY',tradeCount:entries.length,
   incompleteCount:incomplete,trades:entries,
   caveat:'Funding interval can change; historical rate rows alone cannot prove complete settlements. PnL remains provisional.'};
}
module.exports={fetchBinanceFundingWindow,fundingEvent,auditFundingForTrades};

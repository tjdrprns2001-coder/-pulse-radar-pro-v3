'use strict';

const VERSION='RESEARCH_OUTCOME_v3';
const HORIZONS=Object.freeze([1,3,6,12,24,72]);
const UPS=Object.freeze([3,5,8,10,15]);
const DOWNS=Object.freeze([-2,-3,-5]);

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function pct(from,to){return from>0&&Number.isFinite(to)?(to/from-1)*100:null}

function normalizeCandle(row){
  if(Array.isArray(row))return{
    openTime:n(row[0]),open:n(row[1]),high:n(row[2]),low:n(row[3]),close:n(row[4]),
    closeTime:n(row[6])
  };
  if(!row||typeof row!=='object')return null;
  return{
    openTime:n(row.openTime??row.t??row.time),
    open:n(row.open??row.o),high:n(row.high??row.h),low:n(row.low??row.l),close:n(row.close??row.c),
    closeTime:n(row.closeTime??row.T??row.endTime)
  };
}
function confirmedCandles(rows=[],now=Date.now()){
  return rows.map(normalizeCandle).filter(Boolean).filter(x=>
    [x.openTime,x.closeTime,x.open,x.high,x.low,x.close].every(Number.isFinite)&&x.closeTime<=now
  ).sort((a,b)=>a.openTime-b.openTime);
}
function firstCloseAtOrAfter(rows,target,maxLagMs=65*60*1000){
  const x=rows.find(c=>c.closeTime>=target&&c.closeTime-target<=maxLagMs);
  return x||null;
}
function pathBetween(rows,start,end){
  return rows.filter(c=>c.openTime>=start&&c.closeTime<=end);
}
function firstBarrierEvent(rows,entry,tpPct=5,slPct=-3){
  const tp=entry*(1+tpPct/100),sl=entry*(1+slPct/100);
  for(const c of rows){
    const hitTp=c.high>=tp,hitSl=c.low<=sl;
    if(hitTp&&hitSl)return{status:'AMBIGUOUS_SAME_CANDLE',at:c.closeTime,tp,sl};
    if(hitTp)return{status:'TP_FIRST',at:c.closeTime,tp,sl};
    if(hitSl)return{status:'SL_FIRST',at:c.closeTime,tp,sl};
  }
  return{status:'NONE',at:null,tp,sl};
}
function thresholdMap(rows,entry){
  const up={},down={};
  for(const t of UPS){
    const price=entry*(1+t/100),hit=rows.find(c=>c.high>=price);
    up['plus'+t]=hit?{hit:true,at:hit.closeTime}:{hit:false,at:null};
  }
  for(const t of DOWNS){
    const price=entry*(1+t/100),hit=rows.find(c=>c.low<=price);
    down['minus'+Math.abs(t)]=hit?{hit:true,at:hit.closeTime}:{hit:false,at:null};
  }
  return{up,down};
}

function nextEntry(rows,asOf){
  const bar=rows.find(c=>c.openTime>asOf);
  return bar&&Number.isFinite(bar.open)?{price:bar.open,entryTime:bar.openTime,bar}:null;
}
function failureType({labelStatus,barriers,horizons,mfePct,maePct}={}){
  if(labelStatus==='AMBIGUOUS')return'AMBIGUOUS_SAMPLE';
  if(barriers?.status==='SL_FIRST')return'FAIL_TIMING';
  const h24=horizons?.h24?.returnPct,h72=horizons?.h72?.returnPct;
  if(Number.isFinite(h72)&&h72<=0&&Number(mfePct)<3)return'FAIL_TRIGGER';
  if(Number.isFinite(h24)&&h24<0&&Number(maePct)<=-3)return'FAIL_BREAKOUT';
  return null;
}

function resolveObservation(observation,candles,{now=Date.now(),tpPct=5,slPct=-3,maxLagMs=65*60*1000}={}){
  const signalPrice=n(observation?.signalClose,n(observation?.price)),asOf=n(observation?.asOf);
  if(!(signalPrice>0)||!Number.isFinite(asOf))return{version:VERSION,status:'INVALID_OBSERVATION',confirmed:false};
  const all=confirmedCandles(candles,now);
  const useNextOpen=String(observation?.entryPolicy||observation?.integrity?.contract?.entryPolicy||'')==='NEXT_CONFIRMED_OPEN';
  const entryInfo=useNextOpen?nextEntry(all,asOf):{price:n(observation?.price),entryTime:asOf};
  if(!entryInfo?.price)return{version:VERSION,status:'PENDING_ENTRY',confirmed:false,signalPrice,asOf,entryPolicy:useNextOpen?'NEXT_CONFIRMED_OPEN':'SIGNAL_PRICE'};
  const entry=entryInfo.price,entryTime=entryInfo.entryTime;
  const rows=all.filter(c=>c.closeTime>entryTime);
  const horizons={};let confirmedCount=0;
  for(const hours of HORIZONS){
    const target=entryTime+hours*3600000,bar=firstCloseAtOrAfter(rows,target,maxLagMs);
    if(!bar){horizons['h'+hours]={status:'PENDING_OR_GAP',targetAt:target,closeAt:null,returnPct:null};continue}
    horizons['h'+hours]={status:'CONFIRMED',targetAt:target,closeAt:bar.closeTime,returnPct:pct(entry,bar.close)};confirmedCount++;
  }
  const end=entryTime+72*3600000,path=pathBetween(rows,entryTime,end);
  const maxHigh=path.length?Math.max(...path.map(x=>x.high)):null,minLow=path.length?Math.min(...path.map(x=>x.low)):null;
  const mfePct=maxHigh==null?null:pct(entry,maxHigh),maePct=minLow==null?null:pct(entry,minLow);
  const barriers=firstBarrierEvent(path,entry,tpPct,slPct),thresholds=thresholdMap(path,entry);
  const firstSurge=path.find(c=>UPS.some(t=>c.high>=entry*(1+t/100)));
  const label=barriers.status==='TP_FIRST'?1:barriers.status==='SL_FIRST'?0:null;
  const labelStatus=barriers.status==='AMBIGUOUS_SAME_CANDLE'?'AMBIGUOUS':label==null?(confirmedCount===HORIZONS.length?'AMBIGUOUS':'UNRESOLVED'):'RESOLVED';
  const type=failureType({labelStatus,barriers,horizons,mfePct,maePct});
  return{
    version:VERSION,status:confirmedCount?'PARTIAL_OR_CONFIRMED':'PENDING',confirmed:confirmedCount===HORIZONS.length,
    signalPrice,entryPrice:entry,entryTime,entryPolicy:useNextOpen?'NEXT_CONFIRMED_OPEN':'SIGNAL_PRICE',asOf,horizons,mfePct,maePct,barriers,thresholds,
    firstSurgeHours:firstSurge?(firstSurge.closeTime-entryTime)/3600000:null,
    label,labelStatus,sampleLabel:label===1?'POSITIVE_SAMPLE':label===0?'NEGATIVE_SAMPLE':labelStatus==='AMBIGUOUS'?'AMBIGUOUS_SAMPLE':'PENDING',
    failureType:type,evaluatedAt:now,confirmedBars:path.length
  };
}
function applyOutcome(observation,outcome){
  const next={...observation,outcomeV2:outcome};
  for(const h of HORIZONS){
    const r=outcome?.horizons?.['h'+h];
    next['outcome'+h+'hPct']=r?.status==='CONFIRMED'?r.returnPct:null;
  }
  next.mfe72hPct=outcome?.mfePct??null;
  next.mae72hPct=outcome?.maePct??null;
  next.tpSlOrder=outcome?.barriers?.status||null;
  next.label=outcome?.label??null;
  next.labelStatus=outcome?.labelStatus||null;
  return next;
}

module.exports={VERSION,HORIZONS,UPS,DOWNS,normalizeCandle,confirmedCandles,firstCloseAtOrAfter,pathBetween,firstBarrierEvent,thresholdMap,nextEntry,failureType,resolveObservation,applyOutcome};

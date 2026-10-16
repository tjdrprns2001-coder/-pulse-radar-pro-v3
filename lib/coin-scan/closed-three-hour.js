'use strict';

// Binance does not expose native 3H kline intervals. Reconstruct complete,
// UTC-aligned 3H candles from exactly three consecutive CLOSED 1H candles.
// Missing, duplicate, partially closed or future source bars never contribute.
const HOUR_MS=3600000,THREE_HOUR_MS=3*HOUR_MS;
const number=v=>v==null||v===''||typeof v==='boolean'||typeof v==='object'?null:(Number.isFinite(Number(v))?Number(v):null);
function synthesizeThreeHour(oneHourRows=[],{asOf=Date.now()}={}){
  const now=number(asOf),groups=new Map();
  const diagnostics={source:'1h',timeframe:'3h',method:'UTC_ALIGNED_THREE_CLOSED_1H',sourceBars:0,completeBuckets:0,droppedBuckets:0};
  if(now==null||!Array.isArray(oneHourRows))return{rows:[],status:'INVALID_INPUT',diagnostics};
  for(const r of oneHourRows){
    if(!Array.isArray(r)||r.length<7)continue;
    const openTime=number(r[0]),open=number(r[1]),high=number(r[2]),low=number(r[3]),close=number(r[4]),vol=number(r[5]),closeTime=number(r[6]);
    if(openTime==null||openTime<0||openTime%HOUR_MS!==0||closeTime!==openTime+HOUR_MS-1||closeTime>=now)continue;
    if([open,high,low,close,vol].some(x=>x==null)||open<=0||low<=0||vol<0||high<Math.max(open,low,close)||low>Math.min(open,close))continue;
    const bucket=Math.floor(openTime/THREE_HOUR_MS)*THREE_HOUR_MS;
    if(!groups.has(bucket))groups.set(bucket,[]);
    groups.get(bucket).push({r,openTime,open,high,low,close,vol});
    diagnostics.sourceBars++;
  }
  const rows=[];
  function sumOptional(bars,index){
    const values=bars.map(b=>number(b.r[index]));
    return values.every(v=>v!=null)?values.reduce((s,v)=>s+v,0):null;
  }
  for(const [start,bars] of [...groups].sort((a,b)=>a[0]-b[0])){
    bars.sort((a,b)=>a.openTime-b.openTime);
    const complete=bars.length===3&&bars.every((b,i)=>b.openTime===start+i*HOUR_MS);
    if(!complete||start+THREE_HOUR_MS-1>=now){diagnostics.droppedBuckets++;continue}
    rows.push([start,bars[0].open,Math.max(...bars.map(b=>b.high)),Math.min(...bars.map(b=>b.low)),bars[2].close,
      bars.reduce((s,b)=>s+b.vol,0),start+THREE_HOUR_MS-1,
      sumOptional(bars,7),sumOptional(bars,8),sumOptional(bars,9),sumOptional(bars,10),null]);
    diagnostics.completeBuckets++;
  }
  rows._source='SYNTHETIC_3H_FROM_CLOSED_1H';
  return{rows,status:rows.length?'OBSERVED':'NO_COMPLETE_BUCKET',diagnostics};
}
module.exports={HOUR_MS,THREE_HOUR_MS,synthesizeThreeHour};

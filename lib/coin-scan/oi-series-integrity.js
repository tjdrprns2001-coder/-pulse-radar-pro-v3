'use strict';

// OI history is not an order flow signal unless each observation has a
// timestamp and the requested horizon consists of contiguous source periods.
function finite(v){if(v==null||typeof v==='boolean'||typeof v==='object'||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function auditOiSeries(rows=[],{asOf=Date.now(),periodMs=900000,maxAgeMs=periodMs*2.5,maxSkewMs=2000}={}){
  const now=finite(asOf),period=finite(periodMs),ageLimit=finite(maxAgeMs),skew=finite(maxSkewMs);
  const out=(status,extra={})=>({status,available:false,lastTs:null,ageMs:null,contiguous:[],deltas:{},...extra});
  if(!(now>0&&period>0&&ageLimit>0&&skew>=0))return out('INVALID_CONFIG');
  if(!Array.isArray(rows)||rows.length<2)return out('MISSING');
  const pts=rows.map(x=>({ts:finite(x?.timestamp??x?.ts),value:finite(x?.sumOpenInterest??x?.openInterest??x?.oi??x?.value),raw:x}));
  if(pts.some(x=>x.ts==null||x.ts<=0||x.value==null||x.value<=0))return out('INVALID_SOURCE');
  pts.sort((a,b)=>a.ts-b.ts);
  if(pts.some((x,i)=>i>0&&x.ts-pts[i-1].ts<period-skew))return out('DUPLICATE_OR_OVERLAP');
  const last=pts.at(-1),age=now-last.ts;
  if(age< -skew)return out('FUTURE',{lastTs:last.ts,ageMs:age});
  if(age>ageLimit)return out('STALE',{lastTs:last.ts,ageMs:age});
  const tail=[last];
  for(let i=pts.length-2;i>=0;i--){
    if(Math.abs(tail[0].ts-pts[i].ts-period)>skew)break;
    tail.unshift(pts[i]);
  }
  if(tail.length<2)return out('GAP',{lastTs:last.ts,ageMs:age});
  const deltas={};
  for(const steps of [1,4,8,12,16,24,32,48,96]){
    deltas[steps]=tail.length>=steps+1?(last.value/tail[tail.length-1-steps].value-1)*100:null;
  }
  const values=tail.map(x=>x.value),peak=Math.max(...values);
  return{status:'OBSERVED',available:true,lastTs:last.ts,ageMs:age,periodMs:period,
    totalSamples:pts.length,contiguousSamples:tail.length,contiguous:tail.map(x=>x.raw),
    deltas,drawdownPct:peak>0?(last.value/peak-1)*100:null};
}
module.exports={finite,auditOiSeries};

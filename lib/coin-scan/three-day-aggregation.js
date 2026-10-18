'use strict';
const DAY=86400000,D3=3*DAY;
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function normalizeDaily(row){
 if(!Array.isArray(row))return null;
 const t=finite(row[0]),o=finite(row[1]),h=finite(row[2]),l=finite(row[3]),c=finite(row[4]),v=finite(row[5]);
 if([t,o,h,l,c,v].some(x=>x==null)||o<=0||h<=0||l<=0||c<=0||v<0||h<Math.max(o,c,l)||l>Math.min(o,c,h))return null;
 return{t,o,h,l,c,v,q:finite(row[7])};
}
function sameCandle(a,b){return a.o===b.o&&a.h===b.h&&a.l===b.l&&a.c===b.c&&a.v===b.v&&a.q===b.q}
function aggregateThreeDay(dailyRows,{asOf=Date.now(),anchorMs}={}){
 const anchor=finite(anchorMs),now=finite(asOf);
 if(anchor==null||!Number.isInteger(anchor)||anchor<0||anchor>=D3||anchor%DAY!==0)throw new Error('aggregateThreeDay requires a verified UTC-midnight anchorMs');
 if(now==null)throw new Error('aggregateThreeDay requires asOf');
 const dropped={invalid:0,offMidnight:0,unclosed:0,conflict:0,incompleteBuckets:0,unclosedBuckets:0};
 const buckets=new Map(),bad=new Set();
 for(const raw of Array.isArray(dailyRows)?dailyRows:[]){
  const c=normalizeDaily(raw);
  if(!c){dropped.invalid++;const t=Array.isArray(raw)?finite(raw[0]):null;if(t!=null&&t%DAY===0)bad.add(anchor+Math.floor((t-anchor)/D3)*D3);continue}
  if(c.t%DAY!==0){dropped.offMidnight++;continue}
  if(c.t+DAY>now){dropped.unclosed++;continue}
  const b=anchor+Math.floor((c.t-anchor)/D3)*D3;
  let g=buckets.get(b);if(!g){g=new Map();buckets.set(b,g)}
  const prev=g.get(c.t);
  if(prev&&!sameCandle(prev,c)){bad.add(b);dropped.conflict++;continue}
  g.set(c.t,c);
 }
 const rows=[];
 for(const [b,g] of [...buckets].sort((x,y)=>x[0]-y[0])){
  if(bad.has(b))continue;
  if(b+D3>now){dropped.unclosedBuckets++;continue}
  const days=[0,1,2].map(i=>g.get(b+i*DAY));
  if(days.some(d=>!d)){dropped.incompleteBuckets++;continue}
  const q=days.every(d=>d.q!=null)?days.reduce((s,d)=>s+d.q,0):null;
  rows.push([b,String(days[0].o),String(Math.max(...days.map(d=>d.h))),String(Math.min(...days.map(d=>d.l))),String(days[2].c),String(days.reduce((s,d)=>s+d.v,0)),b+D3-1,q==null?null:String(q),null,null,null]);
 }
 return{rows,dropped,anchorMs:anchor};
}
module.exports={DAY,D3,aggregateThreeDay,normalizeDaily};

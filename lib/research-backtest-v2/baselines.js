'use strict';

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function close(r){return n(Array.isArray(r)?r[4]:r?.close)}
function emaSeries(values,p){const out=Array(values.length).fill(null);if(values.length<p)return out;let e=values.slice(0,p).reduce((a,b)=>a+b,0)/p;out[p-1]=e;const k=2/(p+1);for(let i=p;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e}return out}
function buyHold(rows,startIndex=0,endIndex=null){
 const end=endIndex==null?rows.length-1:Math.min(rows.length-1,endIndex),a=close(rows[startIndex]),b=close(rows[end]);
 return a>0&&b>0?{type:'buy-hold',returnPct:(b/a-1)*100,startIndex,endIndex}:{type:'buy-hold',returnPct:null,startIndex,endIndex};
}
function emaCrossBaseline(rows,{fast=20,slow=60,startIndex=0,endIndex=null}={}){
 const c=rows.map(close),f=emaSeries(c,fast),s=emaSeries(c,slow),end=endIndex==null?rows.length-1:Math.min(rows.length-1,endIndex);
 let inPos=false,entry=null,ret=1,trades=0;
 for(let i=Math.max(startIndex,slow);i<=end;i++){
   if(!inPos&&f[i-1]!=null&&s[i-1]!=null&&f[i-1]<=s[i-1]&&f[i]>s[i]){inPos=true;entry=c[i];trades++}
   else if(inPos&&f[i-1]>=s[i-1]&&f[i]<s[i]){if(entry>0&&c[i]>0)ret*=c[i]/entry;inPos=false;entry=null}
 }
 if(inPos&&entry>0&&c[end]>0)ret*=c[end]/entry;
 return{type:'ema-cross',fast,slow,returnPct:(ret-1)*100,trades};
}
function classifyRegime(rows,index,lookback=60){
 const i=Math.trunc(index),start=Math.max(0,i-lookback+1),c=rows.slice(start,i+1).map(close).filter(Number.isFinite);if(c.length<20)return'unknown';
 const r=(c.at(-1)/c[0]-1)*100,rets=[];for(let j=1;j<c.length;j++)rets.push((c[j]/c[j-1]-1)*100);
 const avg=rets.reduce((a,b)=>a+b,0)/rets.length,vol=Math.sqrt(rets.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,rets.length-1));
 if(vol>=4)return'high-vol';if(r>=8)return'bull';if(r<=-8)return'bear';return'sideways';
}
function regimePerformance(trades=[],rows=[]){
 const out={bull:[],bear:[],sideways:[],'high-vol':[],unknown:[]};
 for(const t of trades||[]){if(t?.status!=='filled')continue;const reg=classifyRegime(rows,t.entryIndex);(out[reg]||out.unknown).push(Number(t.netReturnPct))}
 const stats={};for(const [k,v] of Object.entries(out)){const a=v.filter(Number.isFinite);stats[k]={count:a.length,meanReturnPct:a.length?a.reduce((s,x)=>s+x,0)/a.length:null,winRate:a.length?a.filter(x=>x>0).length/a.length:null}}
 return stats;
}
module.exports={buyHold,emaCrossBaseline,classifyRegime,regimePerformance};

'use strict';
function n(v){const x=Number(v);return v===null||v===undefined||v===''||!Number.isFinite(x)?null:x}
function close(r){return n(Array.isArray(r)?r[4]:r?.close)}
function high(r){return n(Array.isArray(r)?r[2]:r?.high)}
function low(r){return n(Array.isArray(r)?r[3]:r?.low)}
function volume(r){return n(Array.isArray(r)?r[5]:r?.volume)}
function closeTime(r){return n(Array.isArray(r)?r[6]:r?.closeTime)}
function ema(values,p){if(values.length<p)return null;const a=2/(p+1);let e=values[0];for(let i=1;i<values.length;i++)e=values[i]*a+e*(1-a);return e}
function atr(rows,index,p=14){if(index<p)return null;const xs=[];for(let i=index-p+1;i<=index;i++){const h=high(rows[i]),l=low(rows[i]),pc=close(rows[i-1]);if(h==null||l==null||pc==null)return null;xs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return xs.reduce((a,b)=>a+b,0)/p}
function qualifiesIntersection(f){return n(f?.volume_ratio_12h)>=3&&n(f?.ribbon_width_atr)<=1.5&&n(f?.price_distance_atr)<=2}
function compute1hIntersectionFeatures(rows,index){
  const xs=Array.isArray(rows)?rows:[];if(!xs[index])return{qualifies:false};
  const closes=xs.slice(0,index+1).map(close);const cur=close(xs[index]),a=atr(xs,index,14);
  const e14=ema(closes,14),e28=ema(closes,28),e92=ema(closes,92);
  const prevVol=xs.slice(Math.max(0,index-12),index).map(volume).filter(v=>v!=null);
  const mean12=prevVol.length===12?prevVol.reduce((s,v)=>s+v,0)/12:null,cv=volume(xs[index]);
  const f={
    volume_ratio_12h:mean12&&cv!=null?cv/mean12:null,
    ema14:e14,ema28:e28,ema92:e92,atr14:a,
    ribbon_width_atr:a&&e14!=null&&e92!=null?Math.abs(e14-e92)/a:null,
    price_distance_atr:a&&cur!=null&&e28!=null?Math.abs(cur-e28)/a:null,
    close:cur,closeTime:closeTime(xs[index])
  };
  return{...f,qualifies:qualifiesIntersection(f)};
}
function findFirst1hIntersection(rows,{afterTs,maxCompletedBars=72}={}){
  const xs=Array.isArray(rows)?rows:[],after=n(afterTs),cap=Math.max(1,Math.min(1000,Number(maxCompletedBars)||72));
  const candidates=[];for(let i=0;i<xs.length;i++){const ct=closeTime(xs[i]);if(ct!=null&&after!=null&&ct>after)candidates.push(i)}
  const examined=candidates.slice(0,cap),hits=[];
  for(const i of examined){const f=compute1hIntersectionFeatures(xs,i);if(f.qualifies)hits.push({index:i,signalCloseTs:closeTime(xs[i]),entryPrice:close(xs[i]),features:f})}
  return{primary:hits[0]||null,repeats:hits.slice(1),examinedBars:examined.length,windowExhausted:candidates.length>=cap};
}
module.exports={compute1hIntersectionFeatures,qualifiesIntersection,findFirst1hIntersection,ema,atr};

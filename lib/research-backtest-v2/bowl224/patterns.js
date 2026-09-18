'use strict';
const {buildBowlFeatureAt}=require('./daily-features.js');
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);for(const x of Object.values(v))if(x&&typeof x==='object'&&!Object.isFrozen(x))freeze(x)}return v}
function detect3A(series,index){
  const rows=Array.isArray(series)?series:[],cur=rows[index],prev=rows[index-1];if(!cur||!prev)return null;
  const f=buildBowlFeatureAt(rows,index);
  const pc=finite(prev.close),pm=finite(prev.ma224),cc=finite(cur.close),cm=finite(cur.ma224);
  if(!f.strict_bowl_120d||pc==null||pm==null||cc==null||cm==null)return null;
  if(!(pc<=pm&&cc>cm))return null;
  return freeze({
    type:'3A',is_3a:true,signalIndex:index,signalOpenTs:cur.openTime,signalCloseTs:cur.closeTime,entryPrice:cc,
    strict_bowl_120d:true,cross_pct:cm?((cc/cm)-1)*100:null,close_to_ma224_atr:f.distance_to_ma224_atr,
    bowlFeatures:{...f}
  });
}
function annotate3B(series,event){
  const rows=Array.isArray(series)?series:[],start=Number(event?.signalIndex);if(!Number.isInteger(start))throw new Error('3A event required');
  const next=rows.slice(start+1,start+4);
  if(next.length<3)return{type:'3B',is_3b:null,status:'unavailable',aboveCount:null,confirmationIndex:null,confirmationTs:null};
  let count=0,confirmationIndex=null;
  for(let k=0;k<3;k++){
    const r=next[k],c=finite(r.close),m=finite(r.ma224);
    if(c!=null&&m!=null&&c>m){count++;if(count===2&&confirmationIndex==null)confirmationIndex=start+1+k}
  }
  const ok=count>=2;
  return{type:'3B',is_3b:ok,status:'evaluated',aboveCount:count,confirmationIndex:ok?confirmationIndex:null,confirmationTs:ok?rows[confirmationIndex]?.closeTime:null,windowEndIndex:start+3};
}
function annotate3C(series,event){
  const rows=Array.isArray(series)?series:[],start=Number(event?.signalIndex);if(!Number.isInteger(start))throw new Error('3A event required');
  const available=Math.min(14,Math.max(0,rows.length-(start+1)));
  for(let offset=1;offset<=available;offset++){
    const i=start+offset,r=rows[i],prev=rows[i-1];
    const c=finite(r?.close),l=finite(r?.low),m=finite(r?.ma224),atr=finite(r?.atr14),pc=finite(prev?.close);
    if(c==null||l==null||m==null||atr==null||atr<=0||pc==null)continue;
    const closeDist=(c-m)/atr,lowDist=(l-m)/atr;
    const near=Math.abs(closeDist)<=1||Math.abs(lowDist)<=1;
    if(near&&c>m&&c>pc)return{type:'3C',is_3c:true,status:'evaluated',confirmationIndex:i,confirmationTs:r.closeTime,days_3a_to_3c:offset,retest_distance_atr:Math.min(Math.abs(closeDist),Math.abs(lowDist)),retest_low_distance_atr:lowDist,retest_close_distance_atr:closeDist};
  }
  if(available<14)return{type:'3C',is_3c:null,status:'unavailable',confirmationIndex:null,confirmationTs:null,days_3a_to_3c:null};
  return{type:'3C',is_3c:false,status:'evaluated',confirmationIndex:null,confirmationTs:null,days_3a_to_3c:null};
}
module.exports={detect3A,annotate3B,annotate3C};

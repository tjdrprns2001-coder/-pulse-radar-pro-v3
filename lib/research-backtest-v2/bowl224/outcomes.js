'use strict';
function n(v){const x=Number(v);return v===null||v===undefined||v===''||!Number.isFinite(x)?null:x}
function o(r){return n(Array.isArray(r)?r[0]:r?.openTime)}
function h(r){return n(Array.isArray(r)?r[2]:r?.high)}
function l(r){return n(Array.isArray(r)?r[3]:r?.low)}
function c(r){return n(Array.isArray(r)?r[4]:r?.close)}
function ct(r){return n(Array.isArray(r)?r[6]:r?.closeTime)}
function pct(entry,v){if(!(entry>0)||v==null)return null;return Math.round((((v/entry)-1)*100)*1e10)/1e10}
const H=3600000;
const HORIZONS=Object.freeze({h24:24*H,h72:72*H,d7:168*H});
const LABELS=Object.freeze({
 Hit_24H_10pct:['h24',10],
 Hit_72H_10pct:['h72',10],
 Hit_7D_10pct:['d7',10],
 Hit_72H_15pct:['h72',15],
 Hit_72H_20pct:['h72',20],
 Hit_7D_15pct:['d7',15],
 Hit_7D_20pct:['d7',20]
});
function horizonRows(event,bars,ms){
  const start=n(event.signalCloseTs??event.signalCandleCloseTs),target=start+ms;
  const all=(Array.isArray(bars)?bars:[]).filter(r=>o(r)>start&&ct(r)>start).sort((a,b)=>ct(a)-ct(b));
  const rows=all.filter(r=>ct(r)<=target);
  const last=rows[rows.length-1];
  const complete=Boolean(last&&ct(last)>=target-1);
  return{rows,target,complete};
}
function evalH(event,bars,ms){
  const entry=n(event.entryPrice),x=horizonRows(event,bars,ms);
  if(!x.complete)return{status:'unavailable',target_end_ts:x.target,return_pct:null,mfe_pct:null,mae_pct:null,rr:null,max_ts:null,min_ts:null};
  let max=-Infinity,min=Infinity,maxTs=null,minTs=null;
  for(const r of x.rows){const hv=h(r),lv=l(r);if(hv!=null&&hv>max){max=hv;maxTs=ct(r)}if(lv!=null&&lv<min){min=lv;minTs=ct(r)}}
  const ret=pct(entry,c(x.rows[x.rows.length-1])),mfe=pct(entry,max),mae=pct(entry,min);
  return{status:'evaluated',target_end_ts:x.target,return_pct:ret,mfe_pct:mfe,mae_pct:mae,rr:mae<0?mfe/Math.abs(mae):null,max_ts:maxTs,min_ts:minTs};
}
function hitDetail(event,bars,horizonMs,threshold){
  const entry=n(event.entryPrice),x=horizonRows(event,bars,horizonMs);
  if(!x.complete)return{hit:null,time_to_hit_ms:null,time_to_hit_bars:null,mae_before_hit_pct:null,mae_through_hit_bar_pct:null};
  const target=entry*(1+threshold/100);let hitIndex=-1;
  for(let i=0;i<x.rows.length;i++){if(h(x.rows[i])>=target-1e-10){hitIndex=i;break}}
  if(hitIndex<0)return{hit:false,time_to_hit_ms:null,time_to_hit_bars:null,mae_before_hit_pct:null,mae_through_hit_bar_pct:null};
  const start=n(event.signalCloseTs??event.signalCandleCloseTs);
  const pre=x.rows.slice(0,hitIndex),through=x.rows.slice(0,hitIndex+1);
  const minLow=arr=>arr.length?Math.min(...arr.map(l).filter(v=>v!=null)):entry;
  return{hit:true,time_to_hit_ms:ct(x.rows[hitIndex])-start,time_to_hit_bars:hitIndex+1,mae_before_hit_pct:pct(entry,minLow(pre)),mae_through_hit_bar_pct:pct(entry,minLow(through))};
}
function evaluateBowlOutcome({event,futureBars}={}){
  if(!event||!n(event.entryPrice))throw new Error('event entryPrice required');
  const horizons={};for(const [k,ms] of Object.entries(HORIZONS))horizons[k]=evalH(event,futureBars,ms);
  const labels={},hits={};
  for(const [name,[hk,thr]] of Object.entries(LABELS)){
    const detail=hitDetail(event,futureBars,HORIZONS[hk],thr);labels[name]=detail.hit;hits[name]=detail;
  }
  return{eventId:event.eventId,symbol:event.symbol,labels,hits,horizons};
}
module.exports={HORIZONS,LABELS,evaluateBowlOutcome};

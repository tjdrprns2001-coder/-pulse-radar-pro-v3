'use strict';
const {finite,OUTCOME_SCHEMA_VERSION}=require('./contracts.js');

const HOUR=3600000;
const HORIZONS=Object.freeze({h3:3*HOUR,h6:6*HOUR,h12:12*HOUR,h24:24*HOUR,d3:72*HOUR});
function openTs(r){return finite(Array.isArray(r)?r[0]:r?.openTime)}
function high(r){return finite(Array.isArray(r)?r[2]:r?.high)}
function low(r){return finite(Array.isArray(r)?r[3]:r?.low)}
function close(r){return finite(Array.isArray(r)?r[4]:r?.close)}
function closeTs(r){return finite(Array.isArray(r)?r[6]:r?.closeTime)}
function pct(entry,v){if(!(entry>0)||v==null)return null;const x=((v/entry)-1)*100;return Math.round(x*1e10)/1e10}
function evaluateHorizon(event,bars,key,ms){
  const start=finite(event.signalCandleCloseTs),entry=finite(event.entryPrice),target=start+ms;
  const rows=(Array.isArray(bars)?bars:[]).filter(r=>{
    const o=openTs(r),c=closeTs(r);return o!=null&&c!=null&&o>start&&c>start&&c<=target;
  }).sort((a,b)=>closeTs(a)-closeTs(b));
  const last=rows[rows.length-1],complete=last&&closeTs(last)>=target;
  if(!complete)return{status:'unavailable',targetEndTs:target,returnPct:null,mfePct:null,maePct:null,rr:null,noAdverseExcursion:null,maxPrice:null,minPrice:null,maxPriceTs:null,minPriceTs:null};
  let maxPrice=-Infinity,minPrice=Infinity,maxPriceTs=null,minPriceTs=null;
  for(const r of rows){
    const h=high(r),l=low(r),t=closeTs(r);
    if(h!=null&&h>maxPrice){maxPrice=h;maxPriceTs=t}
    if(l!=null&&l<minPrice){minPrice=l;minPriceTs=t}
  }
  const point=close(last),mfe=pct(entry,maxPrice),mae=pct(entry,minPrice);
  const noAdverse=mae===0;const rr=mae!=null&&mae<0&&mfe!=null?mfe/Math.abs(mae):null;
  return{status:'evaluated',targetEndTs:target,marketTs:closeTs(last),returnPct:pct(entry,point),mfePct:mfe,maePct:mae,rr,noAdverseExcursion:noAdverse,maxPrice,minPrice,maxPriceTs,minPriceTs};
}
function evaluateEvent({event,futureBars}={}){
  if(!event?.eventId)throw new Error('event required');
  const entry=finite(event.entryPrice);if(entry==null||entry<=0)throw new Error('entryPrice required');
  const horizons={};for(const [key,ms] of Object.entries(HORIZONS))horizons[key]=evaluateHorizon(event,futureBars,key,ms);
  const within=(ms)=>(Array.isArray(futureBars)?futureBars:[]).filter(r=>openTs(r)>event.signalCandleCloseTs&&closeTs(r)<=event.signalCandleCloseTs+ms);
  const maxWithin=(ms)=>{const vals=within(ms).map(high).filter(v=>v!=null);return vals.length?Math.max(...vals):null};
  const hitPct=(v,threshold)=>v==null?null:pct(entry,v)>=threshold-1e-10;
  const labels={
    Hit_6H_8pct:horizons.h6.status==='evaluated'?hitPct(horizons.h6.maxPrice,8):null,
    Hit_24H_12pct:horizons.h24.status==='evaluated'?hitPct(horizons.h24.maxPrice,12):null
  };
  return{eventId:event.eventId,symbol:event.symbol,outcomeSchemaVersion:event.outcomeSchemaVersion||OUTCOME_SCHEMA_VERSION,signalCandleCloseTs:event.signalCandleCloseTs,labels,horizons};
}
function createOutcomeEvaluator({provider,store,maxEventsPerRun=20}={}){
  if(!provider||typeof provider.getKlinesAt!=='function')throw new Error('provider getKlinesAt required');
  if(!store||typeof store.listEvents!=='function')throw new Error('research store required');
  const cap=Math.max(1,Math.min(200,Number(maxEventsPerRun)||20));
  async function run({runId=null,limit=cap}={}){
    const events=await store.listEvents();let evaluated=0,skipped=0;const errors=[];
    for(const event of events.slice().sort((a,b)=>a.signalCandleCloseTs-b.signalCandleCloseTs)){
      if(evaluated>=Math.min(cap,Math.max(1,Number(limit)||cap)))break;
      if(await store.getOutcome(event.eventId)){skipped++;continue}
      try{
        const bars=await provider.getKlinesAt(event.symbol,'15m',{endTime:event.signalCandleCloseTs+HORIZONS.d3,rows:320});
        const outcome=evaluateEvent({event,futureBars:bars});
        await store.putOutcome(event.eventId,{...outcome,runId});
        evaluated++;
      }catch(e){errors.push(event.eventId+':'+String(e?.message||e))}
    }
    return{evaluated,skipped,errors};
  }
  return{run};
}
module.exports={HORIZONS,evaluateEvent,createOutcomeEvaluator};

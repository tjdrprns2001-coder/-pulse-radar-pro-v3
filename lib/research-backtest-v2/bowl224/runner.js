'use strict';
const crypto=require('crypto');
const {buildDailySeries}=require('./daily-features.js');
const {detect3A,annotate3B,annotate3C}=require('./patterns.js');
const {findFirst1hIntersection}=require('./intersection.js');
const {build4hContext}=require('./context4h.js');
const {evaluateBowlOutcome}=require('./outcomes.js');
const DAY=86400000,HOUR=3600000;
function hash(s){return crypto.createHash('sha256').update(s).digest('hex')}
function selectFormalSymbols({symbols=[],hypothesisRegistry=[]}={}){
 const blocked=new Set(hypothesisRegistry.map(s=>String(s).toUpperCase()));
 const orderedCandidates=[...new Set(symbols.map(s=>String(s).toUpperCase()).filter(Boolean))].filter(s=>!blocked.has(s)).sort((a,b)=>hash('bowl224-v1|'+a).localeCompare(hash('bowl224-v1|'+b)));
 return{orderedCandidates,selected:orderedCandidates.slice(0,10),shortfall:Math.max(0,10-orderedCandidates.length)};
}
function eventId(symbol,cohort,ts){return String(symbol).toUpperCase()+':bowl224:'+cohort+':'+String(ts)}
function eventRecord({symbol,cohort,signalCloseTs,entryPrice,parentEventId=null,group='B',features={}}){
 return{eventId:eventId(symbol,cohort,signalCloseTs),symbol:String(symbol).toUpperCase(),cohort,signalCloseTs,entryPrice,parentEventId,group,source:'bowl224-formal',bowlRuleVersion:'bowl-224-rules-v1-strict120',intersectionFormulaVersion:'bowl-1h-vrp-v1',features,createdAt:Date.now()};
}
function createBowl224Runner({provider,store,now=()=>Date.now()}={}){
 if(!provider||typeof provider.getKlinesRange!=='function')throw new Error('getKlinesRange provider required');if(!store)throw new Error('store required');
 async function runBatch({runId,startTs,endTs,symbols=[],hypothesisRegistry=[]}={}){
  if(!runId)throw new Error('runId required');const selection=selectFormalSymbols({symbols,hypothesisRegistry});
  const run={runId,orderedCandidates:selection.orderedCandidates,selectedSymbols:selection.selected,selectionShortfall:selection.shortfall,startTs,endTs,updatedAt:now(),status:'running'};await store.putRun(runId,run);
  let eventCount=0;const errors=[];
  for(const symbol of selection.selected){
   try{
    const dailyFetch=await provider.getKlinesRange(symbol,'1d',{startTime:startTs-400*DAY,endTime:endTs+14*DAY,minBars:344,maxRequests:20});
    const daily=buildDailySeries(dailyFetch.rows,{cutoffTs:endTs+14*DAY});
    for(let i=0;i<daily.length;i++){
      const row=daily[i];if(row.closeTime<startTs||row.closeTime>endTs)continue;
      const a=detect3A(daily,i);if(!a)continue;
      const e3a=eventRecord({symbol,cohort:'3A',signalCloseTs:a.signalCloseTs,entryPrice:a.entryPrice,group:'B',features:{...a.bowlFeatures,cross_pct:a.cross_pct,close_to_ma224_atr:a.close_to_ma224_atr}});
      if(await store.putEvent(e3a))eventCount++;
      const b3=annotate3B(daily,a),c3=annotate3C(daily,a);const ann={eventId:e3a.eventId,b3,c3,dailyCoverage:dailyFetch.coverage};
      if(b3.is_3b===true){
        const br=daily[b3.confirmationIndex],e3b=eventRecord({symbol,cohort:'3B',signalCloseTs:b3.confirmationTs,entryPrice:br.close,parentEventId:e3a.eventId,group:'B',features:{aboveCount:b3.aboveCount}});
        if(await store.putEvent(e3b))eventCount++;
        const oneH=await provider.getKlinesRange(symbol,'1h',{startTime:b3.confirmationTs-500*HOUR,endTime:b3.confirmationTs+72*HOUR,minBars:500,maxRequests:4});
        const ix=findFirst1hIntersection(oneH.rows,{afterTs:b3.confirmationTs,maxCompletedBars:72});
        const h4=await provider.getKlinesRange(symbol,'4h',{startTime:b3.confirmationTs-240*4*HOUR,endTime:(ix.primary?.signalCloseTs||b3.confirmationTs),minBars:240,maxRequests:4});
        ann.intersection=ix;ann.context4h_at_3b=build4hContext(h4.rows,{cutoffTs:b3.confirmationTs});
        if(ix.primary){
          ann.context4h_at_intersection=build4hContext(h4.rows,{cutoffTs:ix.primary.signalCloseTs});
          const ec=eventRecord({symbol,cohort:'3B1H',signalCloseTs:ix.primary.signalCloseTs,entryPrice:ix.primary.entryPrice,parentEventId:e3b.eventId,group:'C',features:ix.primary.features});
          if(await store.putEvent(ec))eventCount++;
        }
      }
      if(c3.is_3c===true){
        const cr=daily[c3.confirmationIndex],e3c=eventRecord({symbol,cohort:'3C',signalCloseTs:c3.confirmationTs,entryPrice:cr.close,parentEventId:e3a.eventId,group:'B',features:{days_3a_to_3c:c3.days_3a_to_3c,retest_distance_atr:c3.retest_distance_atr}});
        if(await store.putEvent(e3c))eventCount++;
      }
      await store.putAnnotation(e3a.eventId,ann);
    }
   }catch(e){errors.push(symbol+':'+String(e?.message||e))}
  }
  await store.putRun(runId,{...run,status:errors.length?'partial':'complete',eventCount,errors,updatedAt:now()});
  return{status:errors.length?'partial':'complete',runId,selectedSymbols:selection.selected,eventCount,errors};
 }
 async function evaluateBatch({runId,limit=20}={}){
   const events=await store.listEvents();let evaluated=0,skipped=0;const errors=[];
   for(const e of events){
     if(evaluated>=Math.max(1,Math.min(200,Number(limit)||20)))break;
     if(await store.getOutcome(e.eventId)){skipped++;continue}
     try{
       const fut=await provider.getKlinesRange(e.symbol,'1h',{startTime:e.signalCloseTs+1,endTime:e.signalCloseTs+168*HOUR,minBars:168,maxRequests:3});
       const out=evaluateBowlOutcome({event:e,futureBars:fut.rows});await store.putOutcome(e.eventId,{...out,runId,coverage:fut.coverage});evaluated++;
     }catch(err){errors.push(e.eventId+':'+String(err?.message||err))}
   }
   return{evaluated,skipped,errors};
 }
 return{runBatch,evaluateBatch};
}
module.exports={selectFormalSymbols,createBowl224Runner,eventId};
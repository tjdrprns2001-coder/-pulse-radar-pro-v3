'use strict';
const crypto=require('crypto');
const {buildDailySeries}=require('./daily-features.js');
const {detect3A,annotate3B,annotate3C}=require('./patterns.js');
const {findFirst1hIntersection,compute1hIntersectionFeatures}=require('./intersection.js');
const {build4hContext}=require('./context4h.js');
const {selectBaseline}=require('./groups.js');
const {evaluateBowlOutcome}=require('./outcomes.js');
const DAY=86400000,HOUR=3600000;
function hash(s){return crypto.createHash('sha256').update(s).digest('hex')}
function selectFormalSymbols({symbols=[],hypothesisRegistry=[]}={}){
 const blocked=new Set(hypothesisRegistry.map(s=>String(s).toUpperCase()));
 const orderedCandidates=[...new Set(symbols.map(s=>String(s).toUpperCase()).filter(Boolean))].filter(s=>!blocked.has(s)).sort((a,b)=>hash('bowl224-v1|'+a).localeCompare(hash('bowl224-v1|'+b)));
 return{orderedCandidates,selected:orderedCandidates.slice(0,10),shortfall:Math.max(0,10-orderedCandidates.length)};
}
async function discoverFormalSymbols({provider,symbols=[],hypothesisRegistry=[],asOfTs,maxSelected=10}={}){
 const base=selectFormalSymbols({symbols,hypothesisRegistry}).orderedCandidates,selected=[];let universeLCount=0,universeNCount=0,checked=0;const eligibility=[];
 for(const symbol of base){
  const daily=await provider.getKlinesRange(symbol,'1d',{startTime:Number(asOfTs)-400*DAY,endTime:Number(asOfTs),minBars:224,maxRequests:3});
  const completed=(daily.rows||[]).filter(r=>Number(r[6])<=Number(asOfTs)).length,isL=completed>=224;checked++;
  eligibility.push({symbol,completedDailyCount:completed,universe:isL?'L':'N',coverage:daily.coverage});
  if(isL){universeLCount++;selected.push(symbol)}else universeNCount++;
  if(selected.length>=maxSelected)break;
 }
 return{orderedCandidates:base,selected,shortfall:Math.max(0,maxSelected-selected.length),universeLCount,universeNCount,checkedCount:checked,eligibility,universeDiscoveryExhaustive:checked===base.length};
}
function collectStandalone1hSignals(rows,{startTs,endTs,bowlWindows=[]}={}){
 const xs=Array.isArray(rows)?rows:[],out=[];
 for(let i=0;i<xs.length;i++){
  const ts=Number(xs[i]?.[6]);if(!Number.isFinite(ts)||ts<startTs||ts>endTs)continue;
  if(bowlWindows.some(w=>ts>=Number(w.startTs)&&ts<=Number(w.endTs)))continue;
  const f=compute1hIntersectionFeatures(xs,i);if(f.qualifies)out.push({index:i,signalCloseTs:ts,entryPrice:Number(xs[i][4]),features:f});
 }
 return out;
}
function eventId(symbol,cohort,ts,suffix=''){return String(symbol).toUpperCase()+':bowl224:'+cohort+':'+String(ts)+(suffix?':'+suffix:'')}
function eventRecord({symbol,cohort,signalCloseTs,entryPrice,parentEventId=null,group='B',features={},matchedToEventId=null}){
 return{eventId:eventId(symbol,cohort,signalCloseTs,matchedToEventId?hash(matchedToEventId).slice(0,8):''),symbol:String(symbol).toUpperCase(),cohort,signalCloseTs,entryPrice,parentEventId,matchedToEventId,group,source:'bowl224-formal',bowlRuleVersion:'bowl-224-rules-v1-strict120',intersectionFormulaVersion:'bowl-1h-vrp-v1',features,createdAt:Date.now()};
}
function rowCloseTime(r){return Number(Array.isArray(r)?r[6]:r?.closeTime)}
function rowClose(r){return Number(Array.isArray(r)?r[4]:r?.close)}
async function processSymbol({symbol,startTs,endTs,provider,store}){
 const dailyFetch=await provider.getKlinesRange(symbol,'1d',{startTime:startTs-400*DAY,endTime:endTs+14*DAY,minBars:344,maxRequests:20});
 const daily=buildDailySeries(dailyFetch.rows,{cutoffTs:endTs+14*DAY});
 const base3a=[],annotations=[],events=[];
 for(let i=0;i<daily.length;i++){
  const row=daily[i];if(row.closeTime<startTs||row.closeTime>endTs)continue;
  const a=detect3A(daily,i);if(!a)continue;
  const e3a=eventRecord({symbol,cohort:'3A',signalCloseTs:a.signalCloseTs,entryPrice:a.entryPrice,group:'B',features:{...a.bowlFeatures,cross_pct:a.cross_pct,close_to_ma224_atr:a.close_to_ma224_atr}});
  events.push(e3a);base3a.push({a,e3a,b3:annotate3B(daily,a),c3:annotate3C(daily,a)});
 }
 const hourly=await provider.getKlinesRange(symbol,'1h',{startTime:startTs-500*HOUR,endTime:endTs+168*HOUR,minBars:500,maxRequests:30});
 const h4=await provider.getKlinesRange(symbol,'4h',{startTime:startTs-240*4*HOUR,endTime:endTs+168*HOUR,minBars:240,maxRequests:12});
 const bowlWindows=[];
 for(const x of base3a){
  const ann={eventId:x.e3a.eventId,b3:x.b3,c3:x.c3,dailyCoverage:dailyFetch.coverage,h1Coverage:hourly.coverage,h4Coverage:h4.coverage};
  if(x.b3.is_3b===true&&Number(x.b3.confirmationTs)<=endTs){
   const br=daily[x.b3.confirmationIndex],e3b=eventRecord({symbol,cohort:'3B',signalCloseTs:x.b3.confirmationTs,entryPrice:br.close,parentEventId:x.e3a.eventId,group:'B',features:{aboveCount:x.b3.aboveCount}});
   events.push(e3b);bowlWindows.push({startTs:x.b3.confirmationTs,endTs:x.b3.confirmationTs+72*HOUR});
   const ix=findFirst1hIntersection(hourly.rows,{afterTs:x.b3.confirmationTs,maxCompletedBars:72});ann.intersection=ix;ann.context4h_at_3b=build4hContext(h4.rows,{cutoffTs:x.b3.confirmationTs});
   if(ix.primary&&ix.primary.signalCloseTs<=endTs){
    ann.context4h_at_intersection=build4hContext(h4.rows,{cutoffTs:ix.primary.signalCloseTs});
    events.push(eventRecord({symbol,cohort:'3B1H',signalCloseTs:ix.primary.signalCloseTs,entryPrice:ix.primary.entryPrice,parentEventId:e3b.eventId,group:'C',features:ix.primary.features}));
   }
  }
  if(x.c3.is_3c===true&&Number(x.c3.confirmationTs)<=endTs){
   const cr=daily[x.c3.confirmationIndex];events.push(eventRecord({symbol,cohort:'3C',signalCloseTs:x.c3.confirmationTs,entryPrice:cr.close,parentEventId:x.e3a.eventId,group:'B',features:{days_3a_to_3c:x.c3.days_3a_to_3c,retest_distance_atr:x.c3.retest_distance_atr}}));
  }
  annotations.push(ann);
 }
 const standalone=collectStandalone1hSignals(hourly.rows,{startTs,endTs,bowlWindows});
 for(const s of standalone)events.push(eventRecord({symbol,cohort:'1H',signalCloseTs:s.signalCloseTs,entryPrice:s.entryPrice,group:'A',features:s.features}));
 const unique=new Map(events.map(e=>[e.eventId,e]));const primaryEvents=[...unique.values()];
 const signalTs=new Set(primaryEvents.map(e=>Number(e.signalCloseTs))),used=new Set();
 const hourlyCandidates=(hourly.rows||[]).map((r,i)=>({ts:rowCloseTime(r),price:rowClose(r),index:i})).filter(x=>x.ts>=startTs&&x.ts<=endTs&&x.index>=92&&!signalTs.has(x.ts));
 const byTs=new Map(hourlyCandidates.map(x=>[x.ts,x]));
 const baselines=[];
 for(const e of primaryEvents){
  const b=selectBaseline({symbol,signalEventId:e.eventId,signalTs:e.signalCloseTs,candidateTimestamps:hourlyCandidates.map(x=>x.ts),usedTimestamps:used,isValid:ts=>byTs.has(ts)});
  if(b.timestamp==null)continue;used.add(b.timestamp);const row=byTs.get(b.timestamp);
  const de=eventRecord({symbol,cohort:'BASELINE',signalCloseTs:b.timestamp,entryPrice:row.price,group:'D',matchedToEventId:e.eventId,features:{matchScope:b.matchScope,matchHash:b.hash}});
  primaryEvents.push(de);baselines.push({baselineEventId:de.eventId,matchedToEventId:e.eventId,...b});
 }
 for(const e of primaryEvents)await store.putEvent(e);
 for(const a of annotations)await store.putAnnotation(a.eventId,a);
 for(const b of baselines)await store.putBaseline(b.baselineEventId,b);
 return{eventCount:primaryEvents.length,annotationCount:annotations.length,baselineCount:baselines.length,coverage:{daily:dailyFetch.coverage,h1:hourly.coverage,h4:h4.coverage}};
}
function createBowl224Runner({provider,store,now=()=>Date.now()}={}){
 if(!provider||typeof provider.getKlinesRange!=='function')throw new Error('getKlinesRange provider required');if(!store)throw new Error('store required');
 async function runBatch({runId,startTs,endTs,symbols=[],hypothesisRegistry=[],maxSymbolsPerRun=1}={}){
  if(!runId)throw new Error('runId required');let run=await store.getRun(runId);
  if(!run){
   const selection=await discoverFormalSymbols({provider,symbols,hypothesisRegistry,asOfTs:startTs,maxSelected:10});
   run={runId,orderedCandidates:selection.orderedCandidates,selectedSymbols:selection.selected,selectionShortfall:selection.shortfall,universeLCount:selection.universeLCount,universeNCount:selection.universeNCount,universeCheckedCount:selection.checkedCount,universeDiscoveryExhaustive:selection.universeDiscoveryExhaustive,eligibility:selection.eligibility,startTs,endTs,nextSymbolIndex:0,eventCount:0,status:'running',updatedAt:now()};await store.putRun(runId,run);
  }else if(Number(run.startTs)!==Number(startTs)||Number(run.endTs)!==Number(endTs))throw new Error('run window cannot change');
  let processed=0,eventCount=Number(run.eventCount)||0;const errors=[...(run.errors||[])],cap=Math.max(1,Math.min(10,Number(maxSymbolsPerRun)||1));
  while(run.nextSymbolIndex<run.selectedSymbols.length&&processed<cap){
   const symbol=run.selectedSymbols[run.nextSymbolIndex];
   try{const r=await processSymbol({symbol,startTs,endTs,provider,store});eventCount+=r.eventCount;run.nextSymbolIndex++;processed++;run.lastCoverage=r.coverage}
   catch(e){errors.push(symbol+':'+String(e?.message||e));break}
   run={...run,eventCount,errors,updatedAt:now(),status:run.nextSymbolIndex>=run.selectedSymbols.length?'complete':'partial'};await store.putRun(runId,run);
  }
  run={...run,eventCount,errors,updatedAt:now(),status:run.nextSymbolIndex>=run.selectedSymbols.length?'complete':'partial'};await store.putRun(runId,run);
  return{status:run.status,runId,selectedSymbols:run.selectedSymbols,nextSymbolIndex:run.nextSymbolIndex,eventCount,errors};
 }
 async function evaluateBatch({runId,limit=20}={}){
  const events=await store.listEvents();let evaluated=0,skipped=0;const errors=[];
  for(const e of events){
   if(evaluated>=Math.max(1,Math.min(200,Number(limit)||20)))break;
   const prior=await store.getOutcome(e.eventId);if(prior?.horizons?.d7?.status==='evaluated'){skipped++;continue}
   try{const fut=await provider.getKlinesRange(e.symbol,'1h',{startTime:e.signalCloseTs+1,endTime:e.signalCloseTs+168*HOUR,minBars:168,maxRequests:3});const out=evaluateBowlOutcome({event:e,futureBars:fut.rows});await store.putOutcome(e.eventId,{...out,runId,coverage:fut.coverage});evaluated++}
   catch(err){errors.push(e.eventId+':'+String(err?.message||err))}
  }
  return{evaluated,skipped,errors};
 }
 return{runBatch,evaluateBatch};
}
module.exports={selectFormalSymbols,discoverFormalSymbols,collectStandalone1hSignals,createBowl224Runner,eventId,processSymbol};

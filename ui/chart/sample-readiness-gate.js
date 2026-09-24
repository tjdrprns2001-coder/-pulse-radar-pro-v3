(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseSampleReadinessGate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='SAMPLE_READINESS_GATE_v1';
const SCHEMA_VERSION=1;
const STORAGE_KEY='pulse-sample-readiness-gate-v1';
const DAY_MS=86400000;
const MAX_ARCHIVE=1500;
const DEFAULT_PARAMS=Object.freeze({
  analysisKind:'SAME_BAR_WOULD_CONFIRM',
  primaryHorizon:'h24',
  discoveryMinEligibleN:200,
  discoveryMinElapsedMs:14*DAY_MS,
  validationMinNewEligibleN:50,
  validationMinElapsedMs:7*DAY_MS,
  minDiscoveryNPerTf:30,
  minValidationNPerTf:30,
  minEligibleTfCount:2,
  excludeTf:['5m'],
  tfEligibilityMode:'DISCOVERY_VALIDATION_INTERSECTION',
  eligibilityFreezeAtValidationCutoff:true,
  allowLateTfEntryIntoRound:false,
  materialConflictPctPoint:10,
  maxDolRateDeltaPctPoint:10,
  rejectMfeDirectionFlip:true,
  rejectMaeDirectionFlip:true,
  observationClock:'ELAPSED_EPOCH_MS',
  discoveryTimeOrigin:'FIRST_ELIGIBLE_EVENT_CONFIRMED_AT',
  validationTimeOrigin:'DISCOVERY_CUTOFF_CONFIRMED_AT',
  discoveryCutoffInclusivity:'LTE',
  validationCutoffInclusivity:'GT',
  timezoneDependent:false
});
const finite=v=>Number.isFinite(Number(v));
const n=(v,d=null)=>finite(v)?Number(v):d;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function stableStringify(obj){
  if(obj==null||typeof obj!=='object')return JSON.stringify(obj);
  if(Array.isArray(obj))return '['+obj.map(stableStringify).join(',')+']';
  return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')+'}';
}
function fnv1a(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16).padStart(8,'0')}
function mergeParams(p={}){
  const out={...DEFAULT_PARAMS,...p};
  out.excludeTf=[...new Set((Array.isArray(out.excludeTf)?out.excludeTf:[]).map(x=>String(x).toLowerCase()))].sort();
  for(const k of ['discoveryMinEligibleN','validationMinNewEligibleN','minDiscoveryNPerTf','minValidationNPerTf','minEligibleTfCount'])out[k]=Math.max(1,Math.round(n(out[k],DEFAULT_PARAMS[k])));
  for(const k of ['discoveryMinElapsedMs','validationMinElapsedMs','materialConflictPctPoint','maxDolRateDeltaPctPoint'])out[k]=Math.max(0,n(out[k],DEFAULT_PARAMS[k]));
  return out;
}
function gateParamsHash(p={}){return 'srg1-'+fnv1a(stableStringify(mergeParams(p)))}
function emptyStore(){return{schemaVersion:SCHEMA_VERSION,version:VERSION,observations:[],rounds:[]}}
function normalizeStore(v){return v&&Array.isArray(v.observations)&&Array.isArray(v.rounds)?{...emptyStore(),...v}:emptyStore()}
function createMemoryStore(initial=emptyStore()){
  let db=clone(normalizeStore(initial));
  return{read(){return clone(db)},write(next){db=clone(normalizeStore(next));return true},clear(){db=emptyStore();return true},export(){return clone(db)}};
}
function createLocalStorageStore(storage,key=STORAGE_KEY){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error('localStorage adapter required');
  const read=()=>{try{return normalizeStore(JSON.parse(storage.getItem(key)||'null'))}catch{return emptyStore()}};
  return{read(){return clone(read())},write(next){storage.setItem(key,JSON.stringify(normalizeStore(next)));return true},clear(){storage.removeItem(key);return true},export(){return clone(read())}};
}
function median(values=[]){
  const a=values.filter(finite).map(Number).sort((x,y)=>x-y);if(!a.length)return null;
  const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function sign(v){return !finite(v)||Number(v)===0?0:(Number(v)>0?1:-1)}
function groupStats(rows=[]){
  const results=rows.map(x=>x.horizonResult),reached=results.filter(x=>x==='REACHED').length,invalid=results.filter(x=>x==='INVALIDATED_BEFORE_REACH').length,expired=results.filter(x=>x==='EXPIRED').length,ambiguous=results.filter(x=>x==='AMBIGUOUS').length,decidable=reached+invalid+expired;
  return{
    n:rows.length,decidableN:decidable,reached,invalidated:invalid,expired,ambiguous,
    dolRatePct:decidable?reached/decidable*100:null,
    ambiguousRatePct:rows.length?ambiguous/rows.length*100:null,
    medianMfePct:median(rows.map(x=>x.mfePct)),
    medianMaePct:median(rows.map(x=>x.maePct)),
    sameBarRatePct:rows.length?rows.filter(x=>x.sameBarWouldConfirm===true).length/rows.length*100:null,
    medianDeadZoneBars:median(rows.map(x=>x.deadZoneBars)),
    medianConfirmationBars:median(rows.map(x=>x.confirmationBarsAfterTouch))
  };
}
function cohortStats(rows=[]){
  const exposed=rows.filter(x=>x.sameBarWouldConfirm===true),control=rows.filter(x=>x.sameBarWouldConfirm!==true),all=groupStats(rows),a=groupStats(exposed),b=groupStats(control);
  const dol=finite(a.dolRatePct)&&finite(b.dolRatePct)?a.dolRatePct-b.dolRatePct:null;
  const mfe=finite(a.medianMfePct)&&finite(b.medianMfePct)?a.medianMfePct-b.medianMfePct:null;
  const mae=finite(a.medianMaePct)&&finite(b.medianMaePct)?b.medianMaePct-a.medianMaePct:null;
  return{all,exposed:a,control:b,effect:{dolRateDeltaPp:dol,mfeMedianDeltaPct:mfe,maeAdvantagePct:mae}};
}
function tfCounts(rows=[]){const o={};for(const x of rows)o[x.timeframe]=(o[x.timeframe]||0)+1;return o}
function eligibleTfs(rows,minN,exclude=[]){
  const ex=new Set(exclude),counts=tfCounts(rows);
  return Object.keys(counts).filter(tf=>!ex.has(tf)&&counts[tf]>=minN).sort();
}
function extractObservations(journalDb={},params={}){
  const P=mergeParams(params),snapshots=new Map((journalDb.snapshots||[]).map(x=>[x.id,x])),outcomes=new Map((journalDb.outcomes||[]).map(x=>[x.snapshotId,x])),out=[];
  for(const e of (journalDb.events||[])){
    if(e?.eventType!=='TL_RETEST_TOUCH'||!e.eventId)continue;
    const s=snapshots.get(e.snapshotId);if(!s)continue;
    const tf=String(e.timeframe||s.timeframe||'').toLowerCase();if(P.excludeTf.includes(tf))continue;
    const t=s.trendline?.telemetry||{},o=outcomes.get(s.id)||{},h=o.horizons?.[P.primaryHorizon]||{};
    out.push({
      eventId:e.eventId,snapshotId:s.id,sequenceId:s.sequenceId||e.sequenceId||null,symbol:s.symbol||e.symbol||null,timeframe:tf,
      confirmedAt:n(e.confirmedAt,e.candleTime),paramsHash:e.paramsHash||s.trendline?.paramsHash||s.params?.trendlineParamsHash||null,
      sameBarWouldConfirm:t.sameBarWouldConfirm===true,sameBarConfirmed:t.sameBarConfirmed===true,
      deadZoneBars:n(t.deadZoneBars,0),confirmationBarsAfterTouch:n(t.confirmationBarsAfterTouch),retestLatencyBars:n(t.retestLatencyBars),
      horizonStatus:h.status||'PENDING',horizonResult:h.result||null,mfePct:n(h.mfePct),maePct:n(h.maePct),
      analysisReady:h.status==='FINALIZED',outcomeUpdatedAt:n(o.updatedAt),sourceVersion:s.version||null
    });
  }
  return out.filter(x=>finite(x.confirmedAt)).sort((a,b)=>(a.confirmedAt-b.confirmedAt)||String(a.eventId).localeCompare(String(b.eventId)));
}
function mergeObservationArchive(existing=[],incoming=[],maxArchive=MAX_ARCHIVE){
  const m=new Map((existing||[]).map(x=>[x.eventId,clone(x)]));
  for(const x of incoming||[]){
    const old=m.get(x.eventId);
    if(!old||x.analysisReady||n(x.outcomeUpdatedAt,0)>=n(old.outcomeUpdatedAt,0))m.set(x.eventId,{...old,...clone(x)});
  }
  return [...m.values()].sort((a,b)=>(a.confirmedAt-b.confirmedAt)||String(a.eventId).localeCompare(String(b.eventId))).slice(-Math.max(300,Number(maxArchive)||MAX_ARCHIVE));
}
function readyObservations(archive=[],params={}){
  const P=mergeParams(params),ex=new Set(P.excludeTf);
  return (archive||[]).filter(x=>x&&x.analysisReady===true&&finite(x.confirmedAt)&&!ex.has(String(x.timeframe).toLowerCase()))
    .sort((a,b)=>(a.confirmedAt-b.confirmedAt)||String(a.eventId).localeCompare(String(b.eventId)))
    .map((x,i)=>({...x,ordinal:i+1}));
}
function groupThroughTime(rows,time){return rows.filter(x=>x.confirmedAt<=time)}
function findDiscoveryCutoff(rows=[],params={}){
  const P=mergeParams(params);if(!rows.length)return null;const first=rows[0].confirmedAt,times=[...new Set(rows.map(x=>x.confirmedAt))].sort((a,b)=>a-b);
  for(const time of times){
    const cohort=groupThroughTime(rows,time);
    if(cohort.length>=P.discoveryMinEligibleN&&time-first>=P.discoveryMinElapsedMs){
      const sameTime=cohort.filter(x=>x.confirmedAt===time),last=sameTime.at(-1);
      return{cutoffConfirmedAt:time,cutoffEventId:last?.eventId||null,cutoffOrdinal:last?.ordinal??cohort.length,cohort,elapsedMs:time-first};
    }
  }
  return null;
}
function classifyTfEffect(discoveryEffect,validationEffect,params={}){
  const P=mergeParams(params),threshold=P.materialConflictPctPoint;
  if(!finite(validationEffect))return{classification:'NEUTRAL',reason:'EFFECT_UNAVAILABLE'};
  if(Math.abs(Number(validationEffect))<=threshold)return{classification:'NEUTRAL',reason:'WITHIN_MATERIAL_THRESHOLD'};
  if(!finite(discoveryEffect)||Math.abs(Number(discoveryEffect))<=threshold)return{classification:'NEUTRAL',reason:'DISCOVERY_NEUTRAL'};
  return sign(discoveryEffect)===sign(validationEffect)?{classification:'SUPPORTIVE',reason:'SAME_DIRECTION'}:{classification:'CONFLICT',reason:'MATERIAL_DIRECTION_REVERSAL'};
}
function tfConsistency(discoveryRows,validationRows,roundTfs,params={}){
  const out={};
  for(const tf of roundTfs){
    const d=cohortStats(discoveryRows.filter(x=>x.timeframe===tf)),v=cohortStats(validationRows.filter(x=>x.timeframe===tf)),c=classifyTfEffect(d.effect.dolRateDeltaPp,v.effect.dolRateDeltaPp,params);
    out[tf]={discoveryN:d.all.n,validationN:v.all.n,discoveryEffect:d.effect,validationEffect:v.effect,...c};
  }
  return out;
}
function directionFlipped(a,b){return finite(a)&&finite(b)&&sign(a)!==0&&sign(b)!==0&&sign(a)!==sign(b)}
function stabilityAssessment(discoveryStats,validationStats,tfResult,params={}){
  const P=mergeParams(params),issues=[],d=discoveryStats.effect,v=validationStats.effect;
  if(finite(d.dolRateDeltaPp)&&finite(v.dolRateDeltaPp)&&Math.abs(v.dolRateDeltaPp-d.dolRateDeltaPp)>P.maxDolRateDeltaPctPoint)issues.push('DOL_RATE_DRIFT');
  if(P.rejectMfeDirectionFlip&&directionFlipped(d.mfeMedianDeltaPct,v.mfeMedianDeltaPct))issues.push('MFE_DIRECTION_FLIP');
  if(P.rejectMaeDirectionFlip&&directionFlipped(d.maeAdvantagePct,v.maeAdvantagePct))issues.push('MAE_DIRECTION_FLIP');
  if(Object.values(tfResult||{}).some(x=>x.classification==='CONFLICT'))issues.push('TF_MATERIAL_CONFLICT');
  return{stable:issues.length===0,issues,dolRateDeltaDriftPp:finite(d.dolRateDeltaPp)&&finite(v.dolRateDeltaPp)?v.dolRateDeltaPp-d.dolRateDeltaPp:null};
}
function findValidationCutoff(allRows,round,params={}){
  const P=mergeParams(params),after=allRows.filter(x=>x.confirmedAt>round.discovery.cutoffConfirmedAt),times=[...new Set(after.map(x=>x.confirmedAt))].sort((a,b)=>a-b);
  let baseReady=false,lastProbe=null;
  for(const time of times){
    const cohort=after.filter(x=>x.confirmedAt<=time),elapsed=time-round.discovery.cutoffConfirmedAt;
    if(cohort.length<P.validationMinNewEligibleN||elapsed<P.validationMinElapsedMs)continue;
    baseReady=true;
    const validationEligibleTf=eligibleTfs(cohort,P.minValidationNPerTf,P.excludeTf),roundEligibleTf=round.discovery.eligibleTf.filter(tf=>validationEligibleTf.includes(tf));
    lastProbe={cutoffConfirmedAt:time,cohort,elapsedMs:elapsed,validationEligibleTf,roundEligibleTf};
    if(roundEligibleTf.length>=P.minEligibleTfCount){
      const sameTime=cohort.filter(x=>x.confirmedAt===time),last=sameTime.at(-1);
      return{ready:true,baseReady,...lastProbe,cutoffEventId:last?.eventId||null,cutoffOrdinal:last?.ordinal??null};
    }
  }
  return{ready:false,baseReady,...(lastProbe||{cohort:after,elapsedMs:after.length?(after.at(-1).confirmedAt-round.discovery.cutoffConfirmedAt):0,validationEligibleTf:eligibleTfs(after,P.minValidationNPerTf,P.excludeTf),roundEligibleTf:[]})};
}
function freezeDiscovery(cutoff,params,now){
  const P=mergeParams(params),stats=cohortStats(cutoff.cohort),eligibleTf=eligibleTfs(cutoff.cohort,P.minDiscoveryNPerTf,P.excludeTf),hash=gateParamsHash(P);
  const id='SRG-'+fnv1a(stableStringify({hash,cutoffEventId:cutoff.cutoffEventId,cutoffConfirmedAt:cutoff.cutoffConfirmedAt}));
  return{
    roundId:id,status:'REVIEWABLE_INITIAL',createdAt:now,gateParamsHash:hash,gateParams:clone(P),
    discovery:{
      frozen:true,firstEligibleConfirmedAt:cutoff.cohort[0]?.confirmedAt||null,cutoffConfirmedAt:cutoff.cutoffConfirmedAt,cutoffEventId:cutoff.cutoffEventId,cutoffOrdinal:cutoff.cutoffOrdinal,
      elapsedMs:cutoff.elapsedMs,eligibleN:cutoff.cohort.length,eventIds:cutoff.cohort.map(x=>x.eventId),eligibleTf,tfCounts:tfCounts(cutoff.cohort),stats
    },
    validation:null,decision:null
  };
}
function evaluateGate({journalDb={},store,params={},now=Date.now(),maxArchive=MAX_ARCHIVE}={}){
  if(!store||typeof store.read!=='function'||typeof store.write!=='function')throw new Error('gate store required');
  const P=mergeParams(params),hash=gateParamsHash(P),db=store.read(),incoming=extractObservations(journalDb,P),archive=mergeObservationArchive(db.observations,incoming,maxArchive),rows=readyObservations(archive,P),rounds=clone(db.rounds||[]);
  let round=rounds.at(-1)||null;
  const first=rows[0]?.confirmedAt||null,last=rows.at(-1)?.confirmedAt||null,progress={eligibleN:rows.length,elapsedMs:first!=null&&last!=null?last-first:0,observationDays:first!=null&&last!=null?(last-first)/DAY_MS:0,pendingArchived:archive.filter(x=>!x.analysisReady).length,archiveN:archive.length};
  if(round&&round.gateParamsHash!==hash)return{state:'PARAMS_CHANGED',gateParamsHash:hash,storedGateParamsHash:round.gateParamsHash,round,progress,rolling:cohortStats(rows)};
  if(round&&['REVIEWABLE_VALIDATED','REVIEWABLE_UNSTABLE'].includes(round.status)){
    store.write({...db,version:VERSION,schemaVersion:SCHEMA_VERSION,observations:archive,rounds});
    return{state:round.status,gateParamsHash:hash,round,progress,rolling:cohortStats(rows),automaticActivation:false};
  }
  if(!round){
    const cutoff=findDiscoveryCutoff(rows,P);
    if(!cutoff){
      const state=rows.length<100?'INSUFFICIENT':'OBSERVING';
      store.write({...db,version:VERSION,schemaVersion:SCHEMA_VERSION,observations:archive,rounds});
      return{state,gateParamsHash:hash,round:null,progress,rolling:cohortStats(rows),automaticActivation:false};
    }
    round=freezeDiscovery(cutoff,P,now);rounds.push(round);
    store.write({...db,version:VERSION,schemaVersion:SCHEMA_VERSION,observations:archive,rounds});
    return{state:'REVIEWABLE_INITIAL',gateParamsHash:hash,round:clone(round),progress,rolling:cohortStats(rows),automaticActivation:false};
  }
  if(round.status==='REVIEWABLE_INITIAL'){round.status='VALIDATING';round.validationStartedAt=now;rounds[rounds.length-1]=round}
  const probe=findValidationCutoff(rows,round,P);
  if(!probe.ready){
    round.status=probe.baseReady?'INSUFFICIENT_VALIDATION':'VALIDATING';
    round.validationProgress={eligibleN:probe.cohort?.length||0,elapsedMs:probe.elapsedMs||0,eligibleTf:probe.validationEligibleTf||[],roundEligibleTf:probe.roundEligibleTf||[],updatedAt:now};
    rounds[rounds.length-1]=round;store.write({...db,version:VERSION,schemaVersion:SCHEMA_VERSION,observations:archive,rounds});
    return{state:round.status,gateParamsHash:hash,round:clone(round),progress,rolling:cohortStats(rows),automaticActivation:false};
  }
  const discoveryRows=rows.filter(x=>round.discovery.eventIds.includes(x.eventId)),validationRows=probe.cohort,validationStats=cohortStats(validationRows),tfResult=tfConsistency(discoveryRows,validationRows,probe.roundEligibleTf,P),stability=stabilityAssessment(round.discovery.stats,validationStats,tfResult,P);
  round.validation={
    frozen:true,cutoffConfirmedAt:probe.cutoffConfirmedAt,cutoffEventId:probe.cutoffEventId,cutoffOrdinal:probe.cutoffOrdinal,elapsedMs:probe.elapsedMs,eligibleN:validationRows.length,eventIds:validationRows.map(x=>x.eventId),
    eligibleTf:probe.validationEligibleTf,roundEligibleTf:probe.roundEligibleTf,excludedTf:Object.fromEntries([...new Set([...round.discovery.eligibleTf,...probe.validationEligibleTf])].filter(tf=>!probe.roundEligibleTf.includes(tf)).map(tf=>[tf,!round.discovery.eligibleTf.includes(tf)?'DISCOVERY_N_BELOW_MIN':'VALIDATION_N_BELOW_MIN'])),
    tfCounts:tfCounts(validationRows),stats:validationStats,tfConsistency:tfResult,cutoffFrozenAt:now
  };
  round.decision={state:stability.stable?'REVIEWABLE_VALIDATED':'REVIEWABLE_UNSTABLE',reviewOnly:true,automaticActivation:false,stability,decidedAt:now};
  round.status=round.decision.state;rounds[rounds.length-1]=round;
  store.write({...db,version:VERSION,schemaVersion:SCHEMA_VERSION,observations:archive,rounds});
  return{state:round.status,gateParamsHash:hash,round:clone(round),progress,rolling:cohortStats(rows),automaticActivation:false};
}
return{VERSION,SCHEMA_VERSION,STORAGE_KEY,DAY_MS,MAX_ARCHIVE,DEFAULT_PARAMS,mergeParams,gateParamsHash,createMemoryStore,createLocalStorageStore,extractObservations,mergeObservationArchive,readyObservations,groupStats,cohortStats,tfCounts,eligibleTfs,findDiscoveryCutoff,classifyTfEffect,tfConsistency,stabilityAssessment,findValidationCutoff,evaluateGate};
});
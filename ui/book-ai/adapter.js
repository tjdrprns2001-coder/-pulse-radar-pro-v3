(function(root,factory){
  const Contract=typeof module==='object'&&module.exports?require('./contract.js'):root?.PulseBookAiContract;
  const api=factory(Contract);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Contract){'use strict';

if(!Contract)throw new Error('PulseBookAiContract required');

const VERSION='BOOK_AI_ADAPTER_v1';
const ENGINE_NAMES=Object.freeze(['scanner','presurge','ict','structure','forexBook','journal','gate','trendline']);
const SOURCE_FRESHNESS_POLICY_VERSION='BOOK_AI_SOURCE_FRESHNESS_v2';
const DEFAULT_STALE_AFTER_MS=Object.freeze({
  scanner:30*60*1000,
  presurge:30*60*1000,
  ict:5*60*60*1000,
  structure:5*60*60*1000,
  forexBook:5*60*60*1000,
  journal:6*60*60*1000,
  gate:24*60*60*1000,
  trendline:6*60*60*1000
});
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const number=(v,name)=>{if(!finite(v))throw new Error(name+' must be finite');return Number(v)};
const text=v=>String(v??'').trim();
const ms=v=>{if(!finite(v))return null;const n=Number(v);return n>0&&n<1e12?n*1000:n};

function latestFinite(values=[]){
  const xs=values.map(ms).filter(Number.isFinite);
  return xs.length?Math.max(...xs):null;
}
function latestArrayTime(rows=[],fields=[]){
  let best=null;
  for(const row of Array.isArray(rows)?rows:[]){
    for(const field of fields){
      const v=ms(row?.[field]);
      if(v!=null&&(best==null||v>best))best=v;
    }
  }
  return best;
}
function inferObservedAt(name,data){
  if(data==null)return null;
  const direct=latestFinite([
    data.observedAt,data.generatedAt,data.updatedAt,data.timestamp,data.capturedAt,data.capturedBarTime,
    data.round?.decision?.decidedAt,data.round?.validation?.cutoffFrozenAt,data.round?.createdAt,
    data.progress?.updatedAt
  ]);
  if(direct!=null)return direct;
  if(name==='journal'){
    return latestFinite([
      latestArrayTime(data.snapshots,['capturedBarTime','capturedAt']),
      latestArrayTime(data.events,['confirmedAt','candleTime']),
      latestArrayTime(data.outcomes,['updatedAt','resolvedAt'])
    ]);
  }
  if(data.frames&&typeof data.frames==='object'){
    const times=[];
    for(const rows of Object.values(data.frames)){
      const last=Array.isArray(rows)?rows.at(-1):null;
      if(Array.isArray(last))times.push(last[6]??last[0]);
      else if(last)times.push(last.closeTime??last.closedAt??last.time??last.openTime);
    }
    return latestFinite(times);
  }
  return null;
}

function sanitizeJournal(data,symbol,analysisAsOf){
  const db=data&&typeof data==='object'?data:{};
  const sym=text(symbol).toUpperCase();
  const snapshots=(Array.isArray(db.snapshots)?db.snapshots:[]).filter(x=>{
    if(sym&&text(x?.symbol).toUpperCase()!==sym)return false;
    const t=ms(x?.capturedBarTime??x?.capturedAt);
    return t==null||t<=analysisAsOf;
  }).map(clone);
  const snapshotIds=new Set(snapshots.map(x=>x.id).filter(Boolean));
  const events=(Array.isArray(db.events)?db.events:[]).filter(x=>{
    if(sym&&text(x?.symbol).toUpperCase()!==sym)return false;
    const t=ms(x?.confirmedAt??x?.candleTime);
    return (t==null||t<=analysisAsOf)&&(!x?.snapshotId||snapshotIds.has(x.snapshotId));
  }).map(x=>({...clone(x),provenance:'PERSISTED_JOURNAL'}));
  const eventIds=new Set(events.map(x=>x.eventId).filter(Boolean));
  const outcomes=(Array.isArray(db.outcomes)?db.outcomes:[]).filter(x=>{
    if(x?.snapshotId&&!snapshotIds.has(x.snapshotId))return false;
    const t=ms(x?.updatedAt??x?.resolvedAt);
    return t==null||t<=analysisAsOf;
  }).map(clone);
  for(const s of snapshots)if(Array.isArray(s.eventIds))s.eventIds=s.eventIds.filter(id=>eventIds.has(id));
  snapshots.sort((a,b)=>(ms(b.capturedBarTime??b.capturedAt)||0)-(ms(a.capturedBarTime??a.capturedAt)||0));
  const latest=snapshots[0]||null;
  return{
    schemaVersion:db.schemaVersion??null,
    version:db.version??null,
    snapshots,
    events,
    outcomes,
    latestSnapshotId:latest?.id||null,
    latestSequenceId:latest?.sequenceId||null
  };
}

function sanitizeSourceData(name,data,{symbol,analysisAsOf}){
  if(data==null)return null;
  if(name==='journal')return sanitizeJournal(data,symbol,analysisAsOf);
  return clone(data);
}

function normalizeLiveEvidence(input,{analysisAsOf,symbol}){
  if(input==null)return null;
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('liveEvidence must be object');
  if(input.provenance!=='LIVE_EPHEMERAL')throw new Error('liveEvidence provenance must be LIVE_EPHEMERAL');
  const snapshot=input.snapshot&&typeof input.snapshot==='object'?clone(input.snapshot):null;
  const events=Array.isArray(input.events)?input.events.map(clone):[];
  if(snapshot){
    if(!String(snapshot.id||'').startsWith('LIVE-'))throw new Error('live snapshot id must use LIVE- namespace');
    if(snapshot.provenance!=='LIVE_EPHEMERAL'||snapshot.closedOnly!==true)throw new Error('live snapshot must be CLOSED_ONLY LIVE_EPHEMERAL');
    if(symbol&&text(snapshot.symbol).toUpperCase()!==symbol)throw new Error('live snapshot symbol mismatch');
    const t=ms(snapshot.capturedBarTime??snapshot.capturedAt);
    if(t!=null&&t>analysisAsOf)throw new Error('live snapshot after analysisAsOf');
  }
  for(const e of events){
    if(!String(e.eventId||'').startsWith('LIVE-'))throw new Error('live eventId must use LIVE- namespace');
    if(e.provenance!=='LIVE_EPHEMERAL')throw new Error('live event provenance mismatch');
    if(e.closedOnly!==true)throw new Error('live event must be CLOSED_ONLY');
    if(symbol&&text(e.symbol).toUpperCase()!==symbol)throw new Error('live event symbol mismatch');
    const t=ms(e.confirmedAt??e.candleTime);
    if(t!=null&&t>analysisAsOf)throw new Error('live event after analysisAsOf');
  }
  return{
    version:input.version==null?null:String(input.version),
    provenance:'LIVE_EPHEMERAL',
    observedAt:input.observedAt==null?null:ms(input.observedAt),
    snapshot,
    events
  };
}

function normalizeSource(name,source,{analysisAsOf,symbol,policy}){
  const raw=source&&typeof source==='object'&&!Array.isArray(source)?source:{data:source};
  const staleAfterMs=raw.staleAfterMs==null?policy[name]:number(raw.staleAfterMs,name+'.staleAfterMs');
  if(staleAfterMs<0)throw new Error(name+'.staleAfterMs must be >= 0');
  const data=sanitizeSourceData(name,raw.data,{symbol,analysisAsOf});
  const explicitObservedAt=raw.observedAt==null?null:ms(raw.observedAt);
  if(explicitObservedAt!=null&&explicitObservedAt>analysisAsOf)throw new Error(name+' observedAt after analysisAsOf');
  const observedAt=explicitObservedAt??inferObservedAt(name,data);
  if(observedAt!=null&&observedAt>analysisAsOf)throw new Error(name+' inferred observedAt after analysisAsOf');
  const ageMs=observedAt==null?null:Math.max(0,analysisAsOf-observedAt);
  const version=raw.version??data?.version??data?.analysisVersion??null;
  const journalEmpty=name==='journal'&&data!=null&&!((data.snapshots?.length||0)+(data.events?.length||0)+(data.outcomes?.length||0));
  const freshnessRequired=name==='journal'||name==='gate';
  let status,reason=null;
  if(raw.error){
    status='ERROR';
    reason=text(raw.reason)||text(raw.error?.code)||text(raw.error?.message)||text(raw.error)||'SOURCE_ERROR';
  }else if(data==null){
    status='MISSING';
    reason=text(raw.reason)||'NOT_PROVIDED';
  }else if(journalEmpty){
    status='MISSING';
    reason=text(raw.reason)||'NO_SYMBOL_JOURNAL_DATA';
  }else if(freshnessRequired&&observedAt==null){
    status='MISSING';
    reason=text(raw.reason)||'OBSERVED_AT_UNAVAILABLE';
  }else if(observedAt!=null&&ageMs>staleAfterMs){
    status='STALE';
    reason=text(raw.reason)||'AGE_EXCEEDED';
  }else{
    status='AVAILABLE';
    reason=text(raw.reason)||(observedAt==null?'FRESHNESS_UNKNOWN':null);
  }
  const meta={
    status,
    version:version==null?null:String(version),
    observedAt,
    staleAfterMs,
    ageMs,
    reason,
    dataAvailable:data!=null&&status!=='MISSING'
  };
  Contract.normalizeEngineSources({[name]:meta},analysisAsOf);
  return{meta,data};
}

function scannerStage(data){
  const candidates=[data?.stage?.code,data?.effectiveType,data?.type,data?.scanType,data?.v3?.effectiveType];
  return candidates.map(text).find(Boolean)||null;
}
function scannerBias(data){
  const candidates=[data?.bias?.value,data?.bias,data?.structure,data?.v3?.bias];
  return candidates.map(text).find(Boolean)||null;
}
function ictBias(data){
  const candidates=[data?.topDown,data?.bias,data?.directional,data?.fractal?.topDown];
  return candidates.map(text).find(Boolean)||null;
}
function inheritedFacts(engineSources,sources){
  const scanner=sources.scanner?.data,ict=sources.ict?.data;
  const stageCode=scannerStage(scanner);
  const biasValue=scannerBias(scanner)||ictBias(ict);
  return{
    bias:biasValue?{
      value:biasValue,
      source:scannerBias(scanner)?'scanner':'ict',
      paramsHash:scanner?.paramsHash??scanner?.v3?.paramsHash??null
    }:null,
    stage:stageCode?{
      code:stageCode,
      source:'scanner',
      paramsHash:scanner?.paramsHash??scanner?.v3?.paramsHash??null
    }:null,
    presurge:sources.presurge?.data==null?null:clone(sources.presurge.data)
  };
}

function coverage(engineSources){
  const counts={AVAILABLE:0,MISSING:0,STALE:0,ERROR:0};
  for(const x of Object.values(engineSources))if(counts[x.status]!=null)counts[x.status]++;
  return{
    total:ENGINE_NAMES.length,
    ...counts,
    freshRatio:ENGINE_NAMES.length?counts.AVAILABLE/ENGINE_NAMES.length:0,
    hasBlockingError:counts.ERROR>0,
    hasMissing:counts.MISSING>0,
    hasStale:counts.STALE>0
  };
}

function adaptBookAiInput(input={}){
  const analysisAsOf=ms(input.analysisAsOf);
  if(analysisAsOf==null)throw new Error('analysisAsOf required');
  const symbol=text(input.symbol).toUpperCase();
  if(!symbol)throw new Error('symbol required');
  const policy={...DEFAULT_STALE_AFTER_MS,...(input.freshnessPolicy||{})};
  const sourceRows={},engineSources={};
  const liveEvidence=normalizeLiveEvidence(input.liveEvidence,{analysisAsOf,symbol});
  const provided=input.sources&&typeof input.sources==='object'?input.sources:{};
  for(const name of ENGINE_NAMES){
    const normalized=normalizeSource(name,provided[name],{analysisAsOf,symbol,policy});
    sourceRows[name]=normalized;
    engineSources[name]=normalized.meta;
  }
  const inherited=inheritedFacts(engineSources,sourceRows);
  Contract.assertPresurgeReadOnly(
    sourceRows.presurge.data,
    inherited.presurge
  );
  const result={
    adapterVersion:VERSION,
    freshnessPolicyVersion:SOURCE_FRESHNESS_POLICY_VERSION,
    analysisAsOf,
    symbol,
    exchange:text(input.exchange||'BINANCE').toUpperCase(),
    marketType:text(input.marketType||'perpetual'),
    engineSources,
    sources:Object.fromEntries(ENGINE_NAMES.map(name=>[name,sourceRows[name].data])),
    inherited,
    liveEvidence,
    coverage:coverage(engineSources)
  };
  return Contract.deepFreeze(result);
}

return{
  VERSION,ENGINE_NAMES,SOURCE_FRESHNESS_POLICY_VERSION,DEFAULT_STALE_AFTER_MS,
  inferObservedAt,sanitizeJournal,normalizeLiveEvidence,normalizeSource,inheritedFacts,coverage,adaptBookAiInput
};
});
'use strict';

const STATUS=Object.freeze({OK:'OK',DEGRADED:'DEGRADED',RATE_LIMITED:'RATE_LIMITED',AUTH_REQUIRED:'AUTH_REQUIRED',SCHEMA_CHANGED:'SCHEMA_CHANGED',SEQUENCE_GAP:'SEQUENCE_GAP',UNAVAILABLE:'UNAVAILABLE'});
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function createSequenceGuard({now=()=>Date.now(),maxAgeMs=300000}={}){
  const sources=new Map();
  function ensure(source){const key=String(source||'unknown');if(!sources.has(key))sources.set(key,{source:key,status:STATUS.OK,lastSequence:null,lastEventTime:null,lastObservedAt:null,gapCount:0,recoveryRequired:false,lastError:null});return sources.get(key)}
  function observe(source,{sequence,eventTime,observedAt=now()}={}){
    const s=ensure(source),seq=finite(sequence),evt=finite(eventTime),obs=finite(observedAt)??now();
    if(seq!=null&&s.lastSequence!=null&&seq>s.lastSequence+1){s.status=STATUS.SEQUENCE_GAP;s.gapCount++;s.recoveryRequired=true}
    if(seq!=null&&(s.lastSequence==null||seq>s.lastSequence))s.lastSequence=seq;
    if(evt!=null&&(s.lastEventTime==null||evt>s.lastEventTime))s.lastEventTime=evt;
    s.lastObservedAt=obs;
    if(!s.recoveryRequired)s.status=STATUS.OK;
    return snapshot(source);
  }
  function fail(source,status,error=null){const s=ensure(source);s.status=Object.values(STATUS).includes(status)?status:STATUS.UNAVAILABLE;s.lastError=error?String(error):null;s.lastObservedAt=now();return snapshot(source)}
  function beginRecovery(source){const s=ensure(source);s.recoveryRequired=true;s.status=STATUS.DEGRADED;return snapshot(source)}
  function recover(source,{snapshotSequence,eventTime,observedAt=now()}={}){
    const s=ensure(source),seq=finite(snapshotSequence);
    if(seq==null)throw new Error('snapshotSequence required');
    s.lastSequence=seq;s.lastEventTime=finite(eventTime)??s.lastEventTime;s.lastObservedAt=finite(observedAt)??now();s.recoveryRequired=false;s.status=STATUS.OK;s.lastError=null;return snapshot(source);
  }
  function snapshot(source){
    const s={...ensure(source)},age=s.lastObservedAt==null?null:Math.max(0,now()-s.lastObservedAt);
    if(age!=null&&age>maxAgeMs&&s.status===STATUS.OK)s.status=STATUS.DEGRADED;
    return{...s,ageMs:age,fresh:age==null?false:age<=maxAgeMs};
  }
  function all(){return[...sources.keys()].map(snapshot)}
  return{STATUS,observe,fail,beginRecovery,recover,snapshot,all};
}
module.exports={STATUS,createSequenceGuard};

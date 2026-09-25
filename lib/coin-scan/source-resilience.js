'use strict';

const STATES=Object.freeze(['FRESH','DEGRADED','STALE','UNKNOWN','CONFLICTED']);
const BUDGETS=Object.freeze({
  trade:{freshMs:2000,warnMs:5000,stopMs:15000},
  bidAsk:{freshMs:2000,warnMs:5000,stopMs:15000},
  orderBook:{freshMs:5000,warnMs:15000,stopMs:30000},
  ohlcv1m:{freshMs:15000,warnMs:60000,stopMs:180000},
  ohlcv5m:{freshMs:30000,warnMs:120000,stopMs:300000},
  fundingOi:{freshMs:60000,warnMs:180000,stopMs:600000},
  liquidation:{freshMs:10000,warnMs:30000,stopMs:120000},
  officialAnnouncement:{freshMs:300000,warnMs:900000,stopMs:3600000},
  projectRss:{freshMs:900000,warnMs:1800000,stopMs:7200000},
  macroCalendar:{freshMs:21600000,warnMs:86400000,stopMs:172800000},
  unlockSchedule:{freshMs:43200000,warnMs:86400000,stopMs:172800000}
});
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function ts(v){const x=n(v);if(x!=null)return x;const d=new Date(v);return Number.isFinite(d.getTime())?d.getTime():null}
function classifyLatency(kind,{sourceTime,receivedTime,availableTime,decisionTime=Date.now()}={}){
  const b=BUDGETS[kind];if(!b)return{status:'UNKNOWN',reason:'UNKNOWN_BUDGET',kind};
  const s=ts(sourceTime),r=ts(receivedTime),a=ts(availableTime),d=ts(decisionTime);
  if(s==null||d==null)return{status:'UNKNOWN',reason:'MISSING_SOURCE_TIME',kind};
  const dataAge=d-s,transportLag=r!=null?r-s:null,processingLag=r!=null&&a!=null?a-r:null,availabilityAge=a!=null?d-a:null;
  let status='FRESH';if(dataAge>b.stopMs)status='STALE';else if(dataAge>b.warnMs)status='DEGRADED';
  return{status,kind,dataAge,transportLag,processingLag,availabilityAge,budget:b};
}
function aggregateHealth(rows=[]){
  if(!rows.length)return{status:'UNKNOWN',sources:[],blocking:true};
  const statuses=rows.map(x=>x.status);
  if(statuses.includes('CONFLICTED'))return{status:'CONFLICTED',sources:rows,blocking:true};
  if(statuses.includes('STALE'))return{status:'STALE',sources:rows,blocking:true};
  if(statuses.includes('UNKNOWN'))return{status:'UNKNOWN',sources:rows,blocking:true};
  if(statuses.includes('DEGRADED'))return{status:'DEGRADED',sources:rows,blocking:false};
  return{status:'FRESH',sources:rows,blocking:false};
}
function classifyRestFailure({status,error,retryAfterMs=null}={}){
  const code=Number(status)||null,err=String(error||'');
  if(code===429)return{action:'RETRY',class:'RATE_LIMIT',retryAfterMs:n(retryAfterMs),useBackoff:false};
  if(code>=500&&code<600)return{action:'RETRY',class:'SERVER_ERROR',useBackoff:true};
  if(code===400)return{action:'DLQ',class:'BAD_REQUEST',useBackoff:false};
  if(/schema|parse|unexpected field|invalid json/i.test(err))return{action:'DLQ',class:'SCHEMA_MISMATCH',useBackoff:false};
  if(/timeout|aborted|network/i.test(err))return{action:'RETRY',class:'TIMEOUT',useBackoff:true};
  return{action:'DEGRADED',class:'UNKNOWN',useBackoff:false};
}
function backoffMs(attempt,{capMs=30000,jitter=0}={}){
  const base=Math.min(capMs,1000*Math.pow(2,Math.max(0,Number(attempt||1)-1)));
  if(!jitter)return base;
  const span=base*Math.max(0,Math.min(1,Number(jitter)));return Math.round(base-span/2+Math.random()*span);
}
function createCircuitBreaker({failureThreshold=5,windowMs=60000,failureRate=.5,openMs=30000,now=()=>Date.now()}={}){
  let state='CLOSED',openedAt=0,events=[];
  function prune(){const t=now()-windowMs;events=events.filter(x=>x.at>=t)}
  function record(ok){
    prune();events.push({at:now(),ok:Boolean(ok)});
    const fails=events.filter(x=>!x.ok).length,rate=events.length?fails/events.length:0;
    if(!ok&&(fails>=failureThreshold||events.length>=failureThreshold&&rate>=failureRate)){state='OPEN';openedAt=now()}
    if(ok&&state==='HALF_OPEN'){state='CLOSED';events=[]}
    return snapshot();
  }
  function canRequest(){
    if(state==='OPEN'&&now()-openedAt>=openMs)state='HALF_OPEN';
    return state!=='OPEN';
  }
  function snapshot(){prune();const fails=events.filter(x=>!x.ok).length;return{state,failures:fails,total:events.length,failureRate:events.length?fails/events.length:0,openedAt:openedAt||null}}
  return{recordSuccess:()=>record(true),recordFailure:()=>record(false),canRequest,snapshot};
}
function sequenceGuard({lastSequence=null,nextSequence=null}={}){
  const a=n(lastSequence),b=n(nextSequence);
  if(a==null||b==null)return{status:'UNKNOWN',gap:false};
  if(b===a+1)return{status:'LIVE',gap:false};
  if(b<=a)return{status:'OUT_OF_ORDER',gap:true,expected:a+1,received:b};
  return{status:'RESYNC_REQUIRED',gap:true,expected:a+1,received:b};
}
function calendarHealth({lastObservedAt,decisionTime=Date.now()}={}){
  const age=(ts(decisionTime)??Date.now())-(ts(lastObservedAt)??0);
  if(!lastObservedAt)return{status:'UNKNOWN',blocking:true};
  if(age>86400000)return{status:'STALE',blocking:true,ageMs:age};
  return{status:'FRESH',blocking:false,ageMs:age};
}
function onchainFinalityGate(event={}){
  const s=String(event.finality_status||'MISSING').toUpperCase();
  if(s==='FINAL')return{usable:true,status:'FINAL'};
  if(s==='CONFIRMED')return{usable:false,auxiliary:true,status:'CONFIRMED'};
  if(s==='REORGED')return{usable:false,auxiliary:false,status:'REORGED'};
  return{usable:false,auxiliary:false,status:s};
}
module.exports={STATES,BUDGETS,classifyLatency,aggregateHealth,classifyRestFailure,backoffMs,createCircuitBreaker,sequenceGuard,calendarHealth,onchainFinalityGate};

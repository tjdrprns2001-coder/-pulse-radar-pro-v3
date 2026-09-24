(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiSetupState=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='BOOK_AI_SETUP_STATE_v1';
const STATES=Object.freeze(['NO_SETUP','WATCH','READY','CONFIRMED','INVALIDATED']);
const DEGRADED_SOURCE_STATES=new Set(['MISSING','STALE','ERROR']);
const TERMINAL_OUTCOMES=new Set(['INVALIDATED_BEFORE_REACH','EXPIRED']);

const txt=v=>String(v??'').trim();
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(x=>txt(x)).filter(Boolean))];
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

function currentSequence(ruleResult={},adapter={}){
  const ruleSeq=uniq((ruleResult.bookSetups||[]).map(x=>x.sequenceId)).filter(Boolean);
  return ruleSeq[0]||adapter?.sources?.journal?.latestSequenceId||adapter?.sources?.journal?.snapshots?.[0]?.sequenceId||null;
}
function sourceDegradation(adapter={}){
  const critical=['scanner','journal'];
  const blocking=[];
  for(const name of critical){
    const state=adapter?.engineSources?.[name]?.status;
    if(DEGRADED_SOURCE_STATES.has(state))blocking.push({name,status:state,reason:adapter?.engineSources?.[name]?.reason||null});
  }
  return{degraded:blocking.length>0,blocking};
}
function explicitLifecycleSignals(ruleResult={},adapter={},sequenceId=null){
  const facts=ruleResult.evidenceFacts||[];
  const invalidationFacts=facts.filter(x=>x.factType==='RETEST_FAILED'&&(!sequenceId||!x.sequenceId||x.sequenceId===sequenceId));
  const outcomes=(adapter?.sources?.journal?.outcomes||[]).filter(x=>!sequenceId||!x.sequenceId||x.sequenceId===sequenceId);
  const invalidationOutcomes=outcomes.filter(x=>x.status==='INVALIDATED_BEFORE_REACH');
  const expiredOutcomes=outcomes.filter(x=>x.status==='EXPIRED');
  return{
    invalidated:invalidationFacts.length>0||invalidationOutcomes.length>0,
    expired:expiredOutcomes.length>0,
    invalidationEventIds:uniq(invalidationFacts.map(x=>x.eventId)),
    invalidationOutcomeIds:uniq(invalidationOutcomes.map(x=>x.outcomeId)),
    expiredOutcomeIds:uniq(expiredOutcomes.map(x=>x.outcomeId))
  };
}
function deriveState(ruleResult={}){
  const rules=ruleResult.bookSetups||[];
  const confirmed=rules.filter(x=>x.status==='CONFIRMED');
  const candidates=rules.filter(x=>x.status==='CANDIDATE');
  const eventBackedCandidates=candidates.filter(x=>(x.evidenceEventIds||[]).length>0);
  const evidenceCount=(ruleResult.evidenceFacts||[]).length;
  if(confirmed.length)return{state:'CONFIRMED',reason:'CONFIRMED_RULE_PRESENT',confirmedCount:confirmed.length,candidateCount:candidates.length,eventBackedCandidateCount:eventBackedCandidates.length};
  if(candidates.length>=2&&eventBackedCandidates.length>=1)return{state:'READY',reason:'MULTI_RULE_READY',confirmedCount:0,candidateCount:candidates.length,eventBackedCandidateCount:eventBackedCandidates.length};
  if(candidates.length||evidenceCount)return{state:'WATCH',reason:candidates.length?'CANDIDATE_PRESENT':'EVIDENCE_ONLY',confirmedCount:0,candidateCount:candidates.length,eventBackedCandidateCount:eventBackedCandidates.length};
  return{state:'NO_SETUP',reason:'NO_ACTIVE_EVIDENCE',confirmedCount:0,candidateCount:0,eventBackedCandidateCount:0};
}
function appendPath(previous,pathState){
  const prior=Array.isArray(previous?.transitionPath)?previous.transitionPath:[];
  const out=prior.slice(-49);
  if(!out.length||out.at(-1)!==pathState)out.push(pathState);
  return out;
}
function resolveSetupState({adapter={},ruleResult={},previous=null}={}){
  const asOf=Number(adapter.analysisAsOf);
  if(!Number.isFinite(asOf))throw new Error('analysisAsOf required');
  const sequenceId=currentSequence(ruleResult,adapter);
  const previousState=previous?.currentState||previous?.state||null;
  if(previousState&&!STATES.includes(previousState))throw new Error('invalid previous setup state');
  const previousSequenceId=previous?.sequenceId||null;
  const newSequence=Boolean(previousSequenceId&&sequenceId&&previousSequenceId!==sequenceId);
  const data=sourceDegradation(adapter);
  const signals=explicitLifecycleSignals(ruleResult,adapter,sequenceId);
  const derived=deriveState(ruleResult);

  let currentState=derived.state,reason=derived.reason,held=false;

  if(!newSequence&&previousState==='INVALIDATED'){
    currentState='INVALIDATED';reason='TERMINAL_INVALIDATED_HOLD';held=true;
  }else if(signals.invalidated){
    currentState='INVALIDATED';reason='EXPLICIT_INVALIDATION';
  }else if(!newSequence&&previousState==='CONFIRMED'){
    if(signals.expired){
      currentState='NO_SETUP';reason='SEQUENCE_EXPIRED';
    }else{
      currentState='CONFIRMED';
      if(data.degraded&&derived.state!=='CONFIRMED'){reason='DATA_DEGRADED_HOLD';held=true}
      else if(derived.state!=='CONFIRMED'){reason='CONFIRMED_STICKY_SAME_SEQUENCE';held=true}
      else reason='CONFIRMED_STILL_SUPPORTED';
    }
  }else if(!newSequence&&previousState&&data.degraded&&['WATCH','READY'].includes(previousState)&&derived.state!==previousState){
    currentState=previousState;reason='DATA_DEGRADED_HOLD';held=true;
  }else if(newSequence){
    reason='NEW_SEQUENCE_'+derived.reason;
  }else if(previousState==='READY'&&derived.state==='NO_SETUP'){
    reason='FRESH_SETUP_DISSOLVED';
  }else if(previousState==='READY'&&derived.state==='WATCH'){
    reason='FRESH_READINESS_LOST';
  }else if(previousState==='WATCH'&&derived.state==='READY'){
    reason='FRESH_READINESS_GAINED';
  }else if(previousState==='WATCH'&&derived.state==='NO_SETUP'){
    reason='FRESH_SETUP_DISSOLVED';
  }

  const transition={
    from:previousState,
    to:currentState,
    at:asOf,
    reason,
    sequenceId,
    previousSequenceId,
    newSequence,
    held,
    derivedState:derived.state
  };
  const pathBase=newSequence?null:previous;
  return Object.freeze({
    version:VERSION,
    currentState,
    previousState,
    sequenceId,
    previousSequenceId,
    analysisAsOf:asOf,
    dataState:data.degraded?'DEGRADED':'FRESH',
    blockingSources:clone(data.blocking),
    signals:clone(signals),
    derived:clone(derived),
    transition,
    transitionPath:appendPath(pathBase,currentState),
    terminal:currentState==='INVALIDATED'
  });
}

return{VERSION,STATES,DEGRADED_SOURCE_STATES,TERMINAL_OUTCOMES,currentSequence,sourceDegradation,explicitLifecycleSignals,deriveState,resolveSetupState};
});
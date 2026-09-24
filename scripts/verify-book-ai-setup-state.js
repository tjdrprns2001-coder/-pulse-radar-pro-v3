'use strict';
const assert=require('assert');
const S=require('../ui/book-ai/setup-state.js');
const ASOF=1000000;
function adapter(statuses={},outcomes=[]){
  return{
    analysisAsOf:ASOF,
    engineSources:{
      scanner:{status:statuses.scanner||'AVAILABLE'},
      journal:{status:statuses.journal||'AVAILABLE'}
    },
    sources:{journal:{latestSequenceId:'q1',snapshots:[{id:'s1',sequenceId:'q1'}],outcomes}}
  };
}
function rules({confirmed=0,candidates=0,eventBackedCandidates=candidates,facts=1,failed=false,seq='q1'}={}){
  const bookSetups=[];
  for(let i=0;i<confirmed;i++)bookSetups.push({ruleId:'C'+i,status:'CONFIRMED',sequenceId:seq,evidenceEventIds:['ec'+i]});
  for(let i=0;i<candidates;i++)bookSetups.push({ruleId:'K'+i,status:'CANDIDATE',sequenceId:seq,evidenceEventIds:i<eventBackedCandidates?['ek'+i]:[]});
  const evidenceFacts=Array.from({length:facts},(_,i)=>({factId:'f'+i,factType:'X',sequenceId:seq}));
  if(failed)evidenceFacts.push({factId:'ff',factType:'RETEST_FAILED',eventId:'efail',sequenceId:seq,provenance:'PERSISTED_JOURNAL',eventStatus:'CONFIRMED'});
  return{bookSetups,evidenceFacts};
}
function prev(state,seq='q1'){return{currentState:state,sequenceId:seq,transitionPath:[state]};}

assert.equal(S.deriveState(rules({confirmed:1})).state,'CONFIRMED');
assert.equal(S.deriveState(rules({candidates:2,eventBackedCandidates:1})).state,'READY');
assert.equal(S.deriveState(rules({candidates:1})).state,'WATCH');
assert.equal(S.deriveState(rules({candidates:0,facts:0})).state,'NO_SETUP');

{
  const r=S.resolveSetupState({adapter:adapter(),ruleResult:rules({candidates:1}),previous:prev('READY')});
  assert.equal(r.currentState,'WATCH');assert.equal(r.transition.reason,'FRESH_READINESS_LOST');
}
{
  const r=S.resolveSetupState({adapter:adapter(),ruleResult:rules({candidates:2,eventBackedCandidates:1}),previous:prev('WATCH')});
  assert.equal(r.currentState,'READY');assert.equal(r.transition.reason,'FRESH_READINESS_GAINED');
}
{
  const r=S.resolveSetupState({adapter:adapter({scanner:'STALE'}),ruleResult:rules({candidates:0,facts:0}),previous:prev('READY')});
  assert.equal(r.currentState,'READY');assert.equal(r.transition.reason,'DATA_DEGRADED_HOLD');
}
{
  const r=S.resolveSetupState({adapter:adapter(),ruleResult:rules({candidates:0,facts:0}),previous:prev('READY')});
  assert.equal(r.currentState,'NO_SETUP');assert.equal(r.transition.reason,'FRESH_SETUP_DISSOLVED');
}
{
  const r=S.resolveSetupState({adapter:adapter(),ruleResult:rules({candidates:0,facts:0}),previous:prev('CONFIRMED')});
  assert.equal(r.currentState,'CONFIRMED');assert.equal(r.transition.reason,'CONFIRMED_STICKY_SAME_SEQUENCE');
}
{
  const r=S.resolveSetupState({adapter:adapter(),ruleResult:rules({failed:true}),previous:prev('CONFIRMED')});
  assert.equal(r.currentState,'INVALIDATED');assert.equal(r.transition.reason,'EXPLICIT_INVALIDATION');
}
{
  const r=S.resolveSetupState({adapter:adapter(),ruleResult:rules({confirmed:1}),previous:prev('INVALIDATED')});
  assert.equal(r.currentState,'INVALIDATED');assert.equal(r.transition.reason,'TERMINAL_INVALIDATED_HOLD');
}
{
  const r=S.resolveSetupState({adapter:adapter({},[{outcomeId:'o1',sequenceId:'q1',status:'EXPIRED'}]),ruleResult:rules({candidates:0,facts:0}),previous:prev('CONFIRMED')});
  assert.equal(r.currentState,'NO_SETUP');assert.equal(r.transition.reason,'SEQUENCE_EXPIRED');
}
{
  const rr=rules({candidates:2,eventBackedCandidates:1,seq:'q2'});
  const ad=adapter();ad.sources.journal.latestSequenceId='q2';ad.sources.journal.snapshots=[{id:'s2',sequenceId:'q2'}];
  const r=S.resolveSetupState({adapter:ad,ruleResult:rr,previous:prev('INVALIDATED','q1')});
  assert.equal(r.currentState,'READY');assert(r.transition.newSequence);assert.equal(r.transitionPath[0],'READY');
}
{
  const rr=rules({candidates:1});
  rr.evidenceFacts.push({factId:'live-fail',factType:'RETEST_FAILED',eventId:'LIVE-efail',sequenceId:'q1',provenance:'LIVE_EPHEMERAL',eventStatus:'CONFIRMED'});
  const r=S.resolveSetupState({adapter:adapter(),ruleResult:rr,previous:prev('CONFIRMED')});
  assert.equal(r.currentState,'CONFIRMED','ephemeral failure may not invalidate persisted lifecycle');
  assert.notEqual(r.transition.reason,'EXPLICIT_INVALIDATION');
}
console.log('book ai setup state PASS');
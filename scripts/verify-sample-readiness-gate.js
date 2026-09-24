'use strict';
const assert=require('assert');
const G=require('../ui/chart/sample-readiness-gate.js');
const D=G.DAY_MS,H=3600000;
const P=G.mergeParams();
function obs(i,{tf='1h',time=i*H,same=false,result='REACHED',mfe=2,mae=1}={}){
  return{eventId:'e'+i,snapshotId:'s'+i,sequenceId:'q'+i,symbol:'T',timeframe:tf,confirmedAt:time,paramsHash:'p',sameBarWouldConfirm:same,sameBarConfirmed:false,deadZoneBars:i%3,confirmationBarsAfterTouch:1,retestLatencyBars:1,horizonStatus:'FINALIZED',horizonResult:result,mfePct:mfe,maePct:mae,analysisReady:true,outcomeUpdatedAt:time};
}
function journal(rows){
  const snapshots=[],events=[],outcomes=[];
  for(const x of rows){
    snapshots.push({id:x.snapshotId,sequenceId:x.sequenceId,symbol:x.symbol,timeframe:x.timeframe,version:'J',trendline:{paramsHash:x.paramsHash,telemetry:{sameBarWouldConfirm:x.sameBarWouldConfirm,sameBarConfirmed:x.sameBarConfirmed,deadZoneBars:x.deadZoneBars,confirmationBarsAfterTouch:x.confirmationBarsAfterTouch,retestLatencyBars:x.retestLatencyBars}}});
    events.push({eventId:x.eventId,eventType:'TL_RETEST_TOUCH',snapshotId:x.snapshotId,sequenceId:x.sequenceId,symbol:x.symbol,timeframe:x.timeframe,confirmedAt:x.confirmedAt,paramsHash:x.paramsHash});
    outcomes.push({snapshotId:x.snapshotId,updatedAt:x.outcomeUpdatedAt,horizons:{h24:{status:x.horizonStatus,result:x.horizonResult,mfePct:x.mfePct,maePct:x.maePct}}});
  }
  return{snapshots,events,outcomes};
}
function spaced(n,start=0,end=14*D,tfs=['15m','1h','4h']){
  const out=[];for(let i=0;i<n;i++){const time=start+(n===1?0:Math.round(end*i/(n-1))),tf=tfs[i%tfs.length],same=i%2===0,result=same?(i%10<6?'REACHED':'EXPIRED'):(i%10<5?'REACHED':'EXPIRED');out.push(obs(i,{tf,time,same,result,mfe:same?2.2:2,mae:same?.9:1}))}return out;
}
assert.equal(G.gateParamsHash(P),G.gateParamsHash({...P}));
assert.notEqual(G.gateParamsHash(P),G.gateParamsHash({...P,minEligibleTfCount:3}));
assert.equal(P.observationClock,'ELAPSED_EPOCH_MS');assert.equal(P.validationTimeOrigin,'DISCOVERY_CUTOFF_CONFIRMED_AT');assert.equal(P.allowLateTfEntryIntoRound,false);
{
  const rows=spaced(199,0,14*D),store=G.createMemoryStore(),r=G.evaluateGate({journalDb:journal(rows),store,now:15*D});
  assert.equal(r.state,'OBSERVING');assert.equal(r.progress.eligibleN,199);
}
{
  const rows=spaced(200,0,14*D-1),store=G.createMemoryStore(),r=G.evaluateGate({journalDb:journal(rows),store,now:15*D});
  assert.equal(r.state,'OBSERVING');
}
{
  const rows=spaced(198,0,13*D);rows.push(obs(198,{tf:'15m',time:14*D,same:true}),obs(199,{tf:'1h',time:14*D,same:false}),obs(200,{tf:'4h',time:14*D,same:true}));
  const store=G.createMemoryStore(),r=G.evaluateGate({journalDb:journal(rows),store,now:14*D});
  assert.equal(r.state,'REVIEWABLE_INITIAL');assert.equal(r.round.discovery.cutoffConfirmedAt,14*D);assert.equal(r.round.discovery.eligibleN,201);
  const again=G.evaluateGate({journalDb:journal(rows),store,now:14*D+1});assert.equal(again.state,'VALIDATING');
}
{
  const rows=spaced(200,0,14*D).concat([obs(999,{tf:'5m',time:15*D})]),store=G.createMemoryStore(),r=G.evaluateGate({journalDb:journal(rows),store,now:15*D});
  assert.equal(r.progress.eligibleN,200);assert(!r.round.discovery.eligibleTf.includes('5m'));
}
{
  const store=G.createMemoryStore(),a=spaced(150,0,10*D),b=spaced(100,0,5*D).map((x,i)=>({...x,eventId:'b'+i,snapshotId:'bs'+i,confirmedAt:10*D+x.confirmedAt}));
  G.evaluateGate({journalDb:journal(a),store,now:10*D});G.evaluateGate({journalDb:journal(b),store,now:16*D});
  assert(store.export().observations.length>=250);
}
{
  const discovery=spaced(210,0,14*D,['15m','1h','4h']),store=G.createMemoryStore();
  let r=G.evaluateGate({journalDb:journal(discovery),store,now:14*D});assert.equal(r.state,'REVIEWABLE_INITIAL');
  r=G.evaluateGate({journalDb:journal(discovery),store,now:14*D+1});assert.equal(r.state,'VALIDATING');
  const dcut=r.round.discovery.cutoffConfirmedAt,vals=[];
  for(let i=0;i<49;i++){const tf=i%2===0?'15m':'1h',same=i%2===0;vals.push(obs(1000+i,{tf,time:dcut+7*D+i*1000,same,result:same?'REACHED':'EXPIRED'}))}
  r=G.evaluateGate({journalDb:journal(discovery.concat(vals)),store,now:dcut+8*D});assert.equal(r.state,'VALIDATING');
}
{
  const discovery=spaced(210,0,14*D,['15m','1h','4h']),store=G.createMemoryStore();
  G.evaluateGate({journalDb:journal(discovery),store,now:14*D});G.evaluateGate({journalDb:journal(discovery),store,now:14*D+1});
  const dcut=store.export().rounds[0].discovery.cutoffConfirmedAt,vals=[];
  for(let i=0;i<50;i++)vals.push(obs(2000+i,{tf:i<35?'15m':'1h',time:dcut+7*D+i*1000,same:i%2===0,result:i%2===0?'REACHED':'EXPIRED'}));
  const r=G.evaluateGate({journalDb:journal(discovery.concat(vals)),store,now:dcut+8*D});
  assert.equal(r.state,'INSUFFICIENT_VALIDATION');assert.equal(r.round.validationProgress.roundEligibleTf.length,1);
}
{
  const discovery=spaced(210,0,14*D,['15m','1h','4h']),store=G.createMemoryStore();
  G.evaluateGate({journalDb:journal(discovery),store,now:14*D});G.evaluateGate({journalDb:journal(discovery),store,now:14*D+1});
  const dcut=store.export().rounds[0].discovery.cutoffConfirmedAt,vals=[];
  for(let i=0;i<64;i++){const tf=i%2===0?'15m':'1h',same=i%2===0;vals.push(obs(3000+i,{tf,time:dcut+7*D+i*1000,same,result:same?(i%10<6?'REACHED':'EXPIRED'):(i%10<5?'REACHED':'EXPIRED'),mfe:same?2.1:2,mae:same?.9:1}))}
  let r=G.evaluateGate({journalDb:journal(discovery.concat(vals)),store,now:dcut+8*D});
  assert(['REVIEWABLE_VALIDATED','REVIEWABLE_UNSTABLE'].includes(r.state));assert.deepEqual(r.round.validation.roundEligibleTf,['15m','1h']);
  const frozen=JSON.stringify(r.round.validation.roundEligibleTf),late=[];
  for(let i=0;i<40;i++)late.push(obs(4000+i,{tf:'4h',time:dcut+9*D+i*1000,same:i%2===0,result:'REACHED'}));
  r=G.evaluateGate({journalDb:journal(discovery.concat(vals,late)),store,now:dcut+10*D});
  assert.equal(JSON.stringify(r.round.validation.roundEligibleTf),frozen);
}
{
  assert.equal(G.classifyTfEffect(20,-10,P).classification,'NEUTRAL');
  assert.equal(G.classifyTfEffect(20,-10.01,P).classification,'CONFLICT');
  assert.equal(G.classifyTfEffect(20,12,P).classification,'SUPPORTIVE');
}
{
  const discovery=spaced(210,0,14*D,['15m','1h','4h']),store=G.createMemoryStore();
  G.evaluateGate({journalDb:journal(discovery),store,now:14*D});G.evaluateGate({journalDb:journal(discovery),store,now:14*D+1});
  const dcut=store.export().rounds[0].discovery.cutoffConfirmedAt,vals=[];
  for(let i=0;i<64;i++){const tf=i%2===0?'15m':'1h',same=i%2===0;vals.push(obs(5000+i,{tf,time:dcut+7*D+i*1000,same,result:same?'REACHED':'EXPIRED',mfe:same?2.1:2,mae:same?.9:1}))}
  const r1=G.evaluateGate({journalDb:journal(discovery.concat(vals)),store,now:dcut+8*D}),frozen=JSON.stringify(r1.round);
  const extra=Array.from({length:100},(_,i)=>obs(6000+i,{tf:'4h',time:dcut+20*D+i*1000,same:true,result:'EXPIRED'}));
  const r2=G.evaluateGate({journalDb:journal(discovery.concat(vals,extra)),store,now:dcut+21*D});
  assert.equal(JSON.stringify(r2.round),frozen);assert.equal(r2.automaticActivation,false);
}
console.log('sample readiness gate v1 PASS');
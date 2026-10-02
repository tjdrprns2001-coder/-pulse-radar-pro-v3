'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const O=require('./chartbro-oos-service.js');

const M5=300000,H=3600000;
function k(t,o,h,l,c){return[t,o,h,l,c,100,t+M5-1,10000,10,50,5000]}
function path(start,entry,dir=1,count=300){
  const out=[];let p=entry;
  for(let i=0;i<count;i++){const next=p+dir*2;out.push(k(start+i*M5,p,Math.max(p,next)+1,Math.min(p,next)-1,next));p=next}
  return out;
}
test('ChartBro stages preserve the execution sequence',()=>{
  assert.equal(O.stageOf({status:'WAIT_SWEEP'}),'ACCUMULATION');
  assert.equal(O.stageOf({status:'WAIT_RECLAIM'}),'SWEEP_DETECTED');
  assert.equal(O.stageOf({status:'WAIT_DISPLACEMENT'}),'MSS_CONFIRMED');
  assert.equal(O.stageOf({status:'WAIT_RETRACE'}),'RETRACE_WAIT');
  assert.equal(O.stageOf({status:'LONG_READY'}),'READY');
  assert.equal(O.stageOf({status:'INVALID'}),'INVALIDATED');
});
test('forward evaluator records 1h/4h/12h/24h MFE MAE and target-first outcome',()=>{
  const t=Date.parse('2026-10-01T00:00:00Z');
  const o={id:'x',symbol:'AAAUSDT',side:'LONG',capturedAt:t,entry:100,stop:95,risk:5,selectedTargetPrice:107.5,
    outcomes:Object.fromEntries(Object.entries(O.HORIZONS).map(([k,ms])=>[k,{status:'PENDING',targetAt:t+ms}])),barrier:null,finalLabel:null};
  const changed=O.evaluateObservation(o,{'5m':path(t+M5,100,1,310)},t+25*H);
  assert.equal(changed,true);
  assert.equal(o.outcomes.h1.status,'EVALUATED');
  assert.equal(o.outcomes.h24.status,'EVALUATED');
  assert(o.outcomes.h1.mfeR>0);
  assert.equal(o.barrier.status,'TARGET_FIRST');
  assert.equal(o.finalLabel,'SUCCESS_TARGET');
});
test('failure taxonomy covers structural, RR, macro, crowding and conflict failures',()=>{
  assert.equal(O.failureType({status:'WAIT_MSS',side:'LONG'},{status:'INVALID'},{}),'SWEEP_NO_MSS');
  assert.equal(O.failureType({status:'WAIT_DISPLACEMENT',side:'LONG'},{status:'INVALID'},{}),'MSS_NO_DISPLACEMENT');
  assert.equal(O.failureType({side:'LONG'},{status:'NO_LONG_RR'},{}),'NO_1_5R_SPACE');
  assert.equal(O.failureType({side:'LONG'},{status:'BLOCKED_CONFLICT'},{}),'TWO_SIDED_LIQUIDITY');
  assert.equal(O.failureType({side:'LONG'},{status:'BLOCKED_REVIEW'},{reviews:{macro:{status:'WATCH'},longDerivatives:{status:'CLEAR'},execution:{status:'CLEAR'}}}),'MACRO_EVENT_RISK');
  assert.equal(O.failureType({side:'LONG'},{status:'BLOCKED_REVIEW'},{reviews:{macro:{status:'CLEAR'},longDerivatives:{status:'BLOCKED'},execution:{status:'CLEAR'}}}),'OI_FUNDING_CROWDING');
});
test('production ranking stays shadow until the 30-event multi-session OOS gate passes',()=>{
  const rows=[];
  for(let i=0;i<30;i++)rows.push({finalLabel:i<18?'SUCCESS_TARGET':'FAIL_STOP',session:i%2?'LONDON':'NEW_YORK',side:'LONG',riskReward:i%3===0?2.2:1.7,mssTf:i%2?'15m':'5m',ipdaPosition:'DISCOUNT',outcomes:{h24:{returnPct:i<18?2:-1,mfeR:i<18?2:.3,maeR:i<18?-.3:-1}}});
  const gate=O.productionGate(rows);
  assert.equal(gate.passed,true);
  assert.equal(gate.rankWeight,O.POLICY.maxRankingAdjustment);
  const comp=O.challengeStats(rows);
  assert.equal(comp.champion.evaluated,30);
  assert.equal(comp.challengers.length,4);
});

'use strict';
const assert=require('assert/strict');
const {finite,normalizeSystemOne}=require('../lib/pulse-ai/decision-audit.js');
const {buildQuestions,candidateState,createTypeSafeJudgment}=require('../lib/pulse-ai/typesafe-judgment.js');
const sample={symbol:'AAAUSDT',candidateScore:61,preIgnitionScore:52,priceChange24h:2.1,oiChangePct:1.5,dataState:'live'};
const valid={
  model:'kev-test',
  answers:{
    marketMode:{choice:'selective',confidence:.6,probabilities:{risk_on:.1,selective:.6,defensive:.2,insufficient:.1}},
    ready_AAAUSDT:{score:2.9,confidence:.72},
    chase_AAAUSDT:{noul:.25}
  }
};
const copy=x=>JSON.parse(JSON.stringify(x));
function fakeResponse(data,status=200){return{ok:status>=200&&status<300,status,async json(){return data}}}
function verifyAudit(){
  assert.equal(finite(null),null);
  assert.equal(finite(''),null);
  assert.equal(finite(undefined),null);
  assert.equal(finite(false),null);
  assert.equal(finite(0),0);
  assert.equal(candidateState({symbol:' A/A ' ,oiChangePct:null}).oiChangePct,null);
  const questions=buildQuestions([sample]);
  assert.equal(questions.marketMode.type,'choice');
  assert.equal(questions.ready_AAAUSDT.type,'score');
  assert.equal(questions.chase_AAAUSDT.type,'noul');
  const good=normalizeSystemOne(valid,[sample],{provider:'kev'});
  assert.equal(good.status,'ok');
  assert.equal(good.provider,'kev');
  assert.equal(good.candidates[0].readinessScore,2.9);
  assert.equal(good.candidates[0].chaseRisk,.25);
  assert.equal(good.candidates[0].readinessLevel,null,'ordinal expectation is not an argmax level');
  assert.equal(good.candidates[0].disposition,'RESEARCH_ONLY');
  assert.equal(good.shadowOnly,true);
  assert(good.probabilityMeaning.includes('not-market-event'));
  const risky=copy(valid);risky.answers.chase_AAAUSDT.noul=.91;
  assert.equal(normalizeSystemOne(risky,[sample]).candidates[0].disposition,'CHASE_RISK_REVIEW');
  const broken=copy(valid);delete broken.answers.chase_AAAUSDT.noul;
  const incomplete=normalizeSystemOne(broken,[sample]);
  assert.equal(incomplete.status,'partial');
  assert.equal(incomplete.candidates[0].valid,false);
  assert.equal(incomplete.candidates[0].chaseRisk,null);
  const nullScore=copy(valid);nullScore.answers.ready_AAAUSDT.score=null;
  assert.equal(normalizeSystemOne(nullScore,[sample]).candidates[0].readinessScore,null,'null must never become 0');
  const futureTruncated={...valid,truncated:true};
  assert.equal(normalizeSystemOne(futureTruncated,[sample]).status,'invalid');
  assert.equal(normalizeSystemOne({answers:{marketMode:valid.answers.marketMode}},[sample]).status,'partial');
  const sparse=normalizeSystemOne(valid,[{symbol:'AAAUSDT'}]);
  assert.equal(sparse.candidates[0].disposition,'ABSTAIN');
  assert.equal(sparse.candidates[0].readinessScore,null);
  const invalidChoice=copy(valid);invalidChoice.answers.marketMode.choice='BUY_NOW';
  assert.equal(normalizeSystemOne(invalidChoice,[sample]).status,'partial');
  const badProb=copy(valid);badProb.answers.marketMode.probabilities.selective=10;
  assert.equal(normalizeSystemOne(badProb,[sample]).market.probabilities,null);
}
async function verifyRuntime(){
  let called=0,requested=null;
  const config={
    apiKey:'local-secret',baseURL:'https://model.example',model:'kev-test',providerName:'kev',
    fetchImpl:async(url,opts)=>{called++;requested={url,opts};return fakeResponse(valid)}
  };
  const svc=createTypeSafeJudgment(config);
  const context={updatedAt:Date.now(),symbols:[sample]};
  const out=await svc.evaluate(context);
  assert.equal(out.status,'ok');assert.equal(out.available,true);
  assert.equal(out.provider,'kev');assert.equal(out.shadowOnly,true);
  assert.equal(out.candidates[0].readinessScore,2.9);
  assert.equal(requested.url,'https://model.example/v1/systemone');
  assert.equal(JSON.parse(requested.opts.body).state.candidates[0].symbol,'AAAUSDT');
  assert(requested.opts.headers.Authorization.includes('local-secret'));
  assert.equal(svc.health().provider,'kev');
  assert.equal(svc.health().circuitOpen,false);
  called=0;
  const stale=await svc.evaluate({...context,updatedAt:Date.now()-3600000});
  assert.equal(stale.status,'abstain');assert.equal(called,0);
  const excluded=await svc.evaluate({updatedAt:Date.now(),symbols:[{...sample,dataState:'blocked'}]});
  assert.equal(excluded.status,'abstain');assert.equal(called,0);
  const disabled=createTypeSafeJudgment({...config,apiKey:''});
  assert.equal(disabled.health().available,false);
  assert.equal((await disabled.evaluate(context)).status,'disabled');
  let failures=0;
  const broken=createTypeSafeJudgment({...config,fetchImpl:async()=>{failures++;return fakeResponse({},429)}});
  for(let i=0;i<3;i++)await assert.rejects(()=>broken.evaluate(context),e=>e.statusCode===429);
  assert.equal(broken.health().circuitOpen,true);
  assert.equal((await broken.evaluate(context)).status,'cooldown');
  assert.equal(failures,3,'circuit breaker prevents repeated failed requests');
}
(async()=>{verifyAudit();await verifyRuntime();console.log('decision layer audit/runtime PASS')})().catch(e=>{console.error(e);process.exitCode=1});

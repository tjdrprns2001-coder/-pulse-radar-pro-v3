'use strict';
const assert=require('node:assert/strict');
const {createPulseAIGateway}=require('../lib/pulse-ai/openai-gateway.js');

const ok=({model,summary='Gemini 응답 정상',role=null,symbol='AAAUSDT'})=>({
 ok:true,status:200,json:async()=>({modelVersion:model,candidates:[{content:{parts:[{text:JSON.stringify(
  role?{role,symbol,stance:'NEUTRAL',summary:'현재 수급 근거에 불확실성이 있어 추가 확인이 필요합니다.',evidenceFields:['oiChangePct']}:
    {summary,highlights:[],watch:[],dataWarnings:[],sources:[]}
 )}]}}]})
});
(async()=>{
 // The configured 3.8 Flash is rate limited: fail over to supported cost-conscious Flash-Lite.
 let requests=[],clock=1000000;
 const client=createPulseAIGateway({apiKey:'mock-secret',now:()=>clock,model:'gemini-3.8-flash',
  fallbackModels:['gemini-3.5-flash-lite','gemini-3.5-flash'],
  fetchImpl:async(url,options)=>{
   const model=decodeURIComponent(url.split('/models/')[1].split(':')[0]);requests.push(model);
   assert.equal(options.headers['x-goog-api-key'],'mock-secret');
   assert(!String(options.body).includes('mock-secret'));
   if(model==='gemini-3.8-flash')return{ok:false,status:429,text:async()=>JSON.stringify({error:{message:'Resource has been exhausted (per-model RPM)'}})};
   return ok({model});
  }});
 const first=await client.brief({context:{symbols:[]}});
 assert.equal(first.model,'gemini-3.5-flash-lite');
 assert.deepEqual(requests,['gemini-3.8-flash','gemini-3.5-flash-lite']);
 assert.equal(client.health().switchCount,1);
 assert.deepEqual(client.health().limitedModels,['gemini-3.8-flash']);
 const second=await client.brief({context:{symbols:[]}});
 assert.equal(second.model,'gemini-3.5-flash-lite');
 assert.deepEqual(requests,['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.5-flash-lite'],'cooldown prevents repeated 429');
 clock+=121000;
 assert.equal((await client.brief({context:{symbols:[]}})).model,'gemini-3.5-flash-lite');
 assert.equal(requests.at(-2),'gemini-3.8-flash','primary is reprobed after cooldown');
 // Role-level requests share the same routing; report the actual used model.
 requests=[];clock=1000000;
 const roleClient=createPulseAIGateway({apiKey:'mock-secret',now:()=>clock,
  fetchImpl:async(url,options)=>{
   const model=decodeURIComponent(url.split('/models/')[1].split(':')[0]),body=JSON.parse(options.body);
   requests.push({model,role:JSON.parse(body.contents[0].parts[0].text).role});
   if(model==='gemini-3.8-flash')return{ok:false,status:429,text:async()=>''};
   return ok({model,role:JSON.parse(body.contents[0].parts[0].text).role});
  }});
 const role=await roleClient.reviewRole({role:'bull',symbol:'AAAUSDT',asOf:clock,
  evidence:[{field:'oiChangePct',value:1.7},{field:'takerRatio',value:1.3}],previous:[]});
 assert.equal(role._usedModel,'gemini-3.5-flash-lite');
 assert.equal(Object.prototype.propertyIsEnumerable.call(role,'_usedModel'),false);
 assert.equal(role.role,'bull');
 assert.deepEqual(requests.map(x=>x.model),['gemini-3.8-flash','gemini-3.5-flash-lite']);
 // Two failing endpoints then a third cheap Flash; upper bound of three total.
 requests=[];
 const chain=createPulseAIGateway({apiKey:'mock-secret',now:()=>clock,
  fallbackModels:['gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.6-flash'],
  fetchImpl:async(url)=>{
   const name=url.split('/models/')[1].split(':')[0];requests.push(name);
   return requests.length<3?{ok:false,status:404,text:async()=>''}:ok({model:name});
  }});
 assert.equal((await chain.brief({context:{}})).model,'gemini-3.5-flash');
 assert.equal(requests.length,3);
 // Project-wide quota or billing error is NOT safely bypassable by cycling models.
 let calls=0;
 const project=createPulseAIGateway({apiKey:'mock-secret',fetchImpl:async()=>{
  calls++;return{ok:false,status:429,text:async()=>JSON.stringify({error:{message:'Project quota exhausted for billing account'}})};
 }});
 await assert.rejects(project.brief({context:{}}),e=>e.statusCode===429&&!String(e).includes('mock-secret'));
 assert.equal(calls,1,'stop when explicitly project quota is exhausted');
 // Other project-level auth errors, bad input: do not fall back to alternate models.
 for(const status of [400,401,403]){
  let total=0;
  const bad=createPulseAIGateway({apiKey:'mock-secret',fetchImpl:async()=>{
   total++;return{ok:false,status,text:async()=>''};
  }});
  await assert.rejects(bad.brief({context:{}}),e=>e.statusCode===status);
  assert.equal(total,1);
 }
 // All model quotas fail. Fail closed and skip further calls until cooldown.
 let failures=0;
 const fully=createPulseAIGateway({apiKey:'mock-secret',now:()=>clock,fetchImpl:async()=>{
  failures++;return{ok:false,status:429,text:async()=>''};
 }});
 await assert.rejects(fully.brief({context:{}}),e=>e.statusCode===429);
 assert.equal(failures,3,'one attempt per model, no retry storm');
 await assert.rejects(fully.brief({context:{}}),e=>e.statusCode===429);
 assert.equal(failures,3,'all exhausted: cooldown and deterministic fallback');
 // Grounding restriction: one plain retry on 403 but no further models if plain succeeds.
 let grounded=[];
 const grounding=createPulseAIGateway({apiKey:'mock-secret',fetchImpl:async(url,opts)=>{
  const req=JSON.parse(opts.body);grounded.push(Boolean(req.tools));
  return req.tools?{ok:false,status:403,text:async()=>''}:ok({model:'gemini-3.8-flash'});
 }});
 const reply=await grounding.chat({context:{},question:'안녕하세요'});
 assert.equal(reply.usedWeb,false);
 assert.deepEqual(grounded,[true,false]);
 console.log('Gemini safe automatic 429 model failover, cooldown, roles, project-wide quota, auth gate and search fallback PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

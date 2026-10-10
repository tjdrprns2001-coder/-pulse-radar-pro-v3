'use strict';
const assert=require('node:assert/strict');
const {createMultiProviderGateway,PROVIDERS}=require('../lib/pulse-ai/multi-provider-gateway.js');
const {approveAnswer}=require('../lib/pulse-ai/llm-role-debate.js');
const {providerEnvironmentHealth}=require('../lib/pulse-ai/provider-config-health.js');

const allEnv={GEMINI_API_KEY:'mock-gemini-private'};
for(const p of PROVIDERS)allEnv[p.env]='mock-'+p.id+'-private';
allEnv.CLOUDFLARE_ACCOUNT_ID='c'.repeat(32);
const clock=()=>1234567890000;
const shape={role:'bull',symbol:'AAAUSDT',asOf:clock()-5000,deterministicReadiness:'RESEARCH_WATCH',
 evidence:[{field:'oiChangePct',value:1.3,unit:'percent'},{field:'takerRatio',value:1.3,unit:'ratio'}],
 previous:[]};
const roleReply={role:'bull',symbol:'AAAUSDT',stance:'NEUTRAL',summary:'입력된 미결제약정과 체결 비율은 추가 확인이 필요합니다.',evidenceFields:['oiChangePct'],missingChecks:['장기 확인']};
const briefReply={summary:'입력된 데이터에 기반한 시장 브리핑입니다.',highlights:[],watch:[],eventCatalysts:[],dataWarnings:[],sources:[]};
const resp=(model,data,{cohere=false}={})=>({
 ok:true,status:200,json:async()=>cohere?{model,message:{content:[{type:'text',text:JSON.stringify(data)}]}}:
  {model,choices:[{message:{content:JSON.stringify(data)}}]}
});
const fail=(code)=>({ok:false,status:code,text:async()=>''});
const geminiFail={provider:'gemini',model:'test-gemini',available:true,
 brief:async()=>{const e=new Error('quota');e.statusCode=429;e.attempts=3;throw e},
 chat:async()=>{const e=new Error('quota');e.statusCode=429;e.attempts=3;throw e},
 reviewRole:async()=>{const e=new Error('quota');e.statusCode=429;e.attempts=3;throw e},
 health:()=>({available:true})};
(async()=>{
 assert.equal(PROVIDERS.length,10);
 assert.equal(providerEnvironmentHealth(allEnv).total,11);
 assert(providerEnvironmentHealth(allEnv).providers.every(p=>p.integration==='PULSE_AI_ROUTER_IMPLEMENTED'));
 const trace=[];
 const fetchImpl=async(url,opts)=>{
  const body=JSON.parse(opts.body),model=body.model;
  trace.push({url,model,headers:opts.headers,body});
  assert(!opts.body.includes('mock-'),'credentials must stay out of request body');
  assert(!url.includes('mock-'),'credentials must never be placed in URLs');
  assert(opts.headers.Authorization.startsWith('Bearer '));
  assert(opts.signal);
  if(url.includes('api.groq.com'))return fail(429);
  if(url.includes('openrouter.ai'))return resp('openai/gpt-oss-20b',briefReply);
  throw new Error('Unexpected attempt '+url);
 };
 const router=createMultiProviderGateway({env:allEnv,geminiGateway:geminiFail,fetchImpl,now:clock});
 assert.equal(router.available,true);
 assert.equal(router.provider,'multi');
 const brief=await router.brief({context:{symbols:[]},useWeb:false});
 assert.equal(brief.provider,'openrouter');
 assert.equal(brief.summary,briefReply.summary);
 assert.equal(brief.model,'openai/gpt-oss-20b');
 assert.deepEqual(trace.map(x=>new URL(x.url).hostname),['api.groq.com','openrouter.ai']);
 assert.equal(router.health().activeProvider,'openrouter');
 assert.deepEqual(router.health().confirmedResponders,['openrouter']);
 assert.equal(router.health().maxTaskMillis,36000);
 assert.equal(router.health().maxProviderMillis,6500);
 assert.equal(router.health().configuredProviders.length,11);
 assert(router.health().coolingDown.includes('gemini'));
 assert(router.health().coolingDown.includes('groq'));
 const serialized=JSON.stringify(router.health());
 assert(!serialized.includes('mock-'));
 assert(!serialized.includes('Authorization'));
 trace.length=0;
 const second=await router.brief({context:{symbols:[]}});
 assert.equal(second.provider,'openrouter','models in cooldown skipped');
 assert.deepEqual(trace.map(x=>new URL(x.url).hostname),['openrouter.ai']);
 // Role prompts use prior positions and preserve scanner evidence fields.
 const roleRequests=[];
 const roleGateway=createMultiProviderGateway({env:allEnv,geminiGateway:geminiFail,
  providerOrder:['gemini','groq','cohere'],now:clock,fetchImpl:async(url,options)=>{
   const req=JSON.parse(options.body);roleRequests.push({url,body:req});
   if(url.includes('groq'))return fail(429);
   if(url.includes('cohere'))return resp(req.model,roleReply,{cohere:true});
   throw Error('bad role url');
  }});
 const role=await roleGateway.reviewRole(shape);
 assert.equal(role.role,'bull');
 assert.equal(role._usedProvider,'cohere');
 assert.equal(role._usedModel,'command-r7b-12-2024');
 assert.equal(role._attempts,5,'Gemini three model tries + two provider calls');
 assert.equal(Object.prototype.propertyIsEnumerable.call(role,'_usedProvider'),false);
 assert.equal(approveAnswer(role,'bull','AAAUSDT',new Set(['oiChangePct','takerRatio'])).stance,'NEUTRAL');
 assert.deepEqual(roleRequests.map(x=>new URL(x.url).hostname),['api.groq.com','api.cohere.com']);
 assert.equal(roleRequests[1].body.response_format.type,'json_object');
 // Exact one provider after 401 credentials failure, do not retry broken key.
 let authCalls=0;
 const auth=createMultiProviderGateway({env:allEnv,geminiGateway:{...geminiFail,available:false},now:clock,
  providerOrder:['groq','openrouter'],fetchImpl:async(url,opts)=>{
   authCalls++;return url.includes('groq')?fail(401):resp('safe-model',briefReply);
  }});
 assert.equal((await auth.brief({context:{}})).provider,'openrouter');
 assert.equal(authCalls,2);
 assert(auth.health().coolingDown.includes('groq'));
 // Models without key/Cloudflare account ID must be skipped, no authentication probing.
 const incomplete={GROQ_API_KEY:'mock-groq-private',CLOUDFLARE_API_TOKEN:'mock-cf-private'};
 const only=createMultiProviderGateway({env:incomplete,geminiGateway:{available:false},now:clock,
  fetchImpl:async(url)=>{assert(url.includes('groq'));return resp('test',briefReply)}});
 assert.deepEqual(only.health().configuredProviders,['groq']);
 assert.equal(only.health().available,true);
 const empty=createMultiProviderGateway({env:{},geminiGateway:{available:false},now:clock,fetchImpl});
 assert.equal(empty.available,false);
 await assert.rejects(empty.brief({context:{}}),e=>e.statusCode===503);
 // 402 and 429 all 11 paths: finite total, stops trying while on cooldown.
 const attempts=[];
 const full=createMultiProviderGateway({env:allEnv,geminiGateway:geminiFail,now:clock,fetchImpl:async(url)=>{
  attempts.push(url);return fail(url.includes('ollama')?402:429);
 }});
 await assert.rejects(full.brief({context:{}}),e=>e.statusCode===429&&e.attempts<=14);
 assert.equal(attempts.length,10,'all enabled vendors tried once');
 await assert.rejects(full.brief({context:{}}),e=>e.statusCode===503||e.statusCode===429);
 assert.equal(attempts.length,10,'no storm before cooldown expires');
 // Never leak keys in a provider rejection text.
 const broken=createMultiProviderGateway({env:{GROQ_API_KEY:'SECRETSHOULDNEVERAPPEAR'},
  geminiGateway:{available:false},now:clock,fetchImpl:async()=>fail(403)});
 await assert.rejects(broken.brief({context:{}}),e=>!JSON.stringify(e).includes('SECRETSHOULDNEVERAPPEAR'));
 // Verify the global wall-clock budget stops routing before all providers are retried.
 let time=200000,lateCalls=0;
 const strictBudget=createMultiProviderGateway({env:allEnv,geminiGateway:{...geminiFail,available:false},
  now:()=>time,maxTotalMs:9000,requestTimeoutMs:3000,
  fetchImpl:async()=>{lateCalls++;time+=4000;return fail(429)}});
 await assert.rejects(strictBudget.brief({context:{}}),e=>e.statusCode===429&&e.attempts<10);
 assert(lateCalls<=2,'budget must stop after clock advances, not try 10 vendors');
 // No externally supplied endpoint or provider can bypass fixed registry.
 const safe=createMultiProviderGateway({env:{GROQ_API_KEY:'value'},geminiGateway:{available:false},
  providerOrder:['http://attacker.invalid','gemini','groq'],now:clock,fetchImpl:async(url)=>{
   assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
   return resp('safe',briefReply);
  }});
 assert.deepEqual(safe.health().routingOrder,['groq']);
 assert.equal((await safe.brief({context:{}})).status,'ok');
 console.log('MULTI-PROVIDER quota fallback, 11 integrations, Cohere schema, auth/402/429/cooldown, bounded retry, redaction PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

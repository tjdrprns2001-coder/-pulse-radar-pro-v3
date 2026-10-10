'use strict';
const assert=require('node:assert/strict');
const {PROVIDERS,providerEnvironmentHealth}=require('../lib/pulse-ai/provider-config-health.js');
const api=require('../api/pulse-ai.js');

function response(){let code=null,body=null;return{
  setHeader(){},status(n){code=n;return this;},json(v){body=v;return v;},
  get code(){return code;},get body(){return body;}
};}
(async()=>{
 const clean=providerEnvironmentHealth({});
 assert.equal(clean.total,11);
 assert.equal(clean.configured,0);
 assert.equal(clean.allConfigured,false);
 assert(clean.providers.every(x=>x.status==='NOT_CONFIGURED'));
 const sampleEnv={};
 for(const p of PROVIDERS)sampleEnv[p.env]='sensitive-'+p.id+'-canary';
 sampleEnv.CLOUDFLARE_ACCOUNT_ID='sensitive-account-id';
 const full=providerEnvironmentHealth(sampleEnv);
 assert.equal(full.total,11);assert.equal(full.configured,11);assert.equal(full.allConfigured,true);
 assert(full.providers.every(x=>x.configured&&x.prerequisitesConfigured));
 assert.equal(full.providers.find(x=>x.id==='gemini').integration,'PULSE_AI_ROUTER_IMPLEMENTED');
 assert(full.providers.every(x=>x.integration==='PULSE_AI_ROUTER_IMPLEMENTED'));
 const emitted=JSON.stringify(full);
 assert(!emitted.includes('sensitive-'));
 assert(!emitted.includes('sensitive-account'));
 assert(!emitted.includes('canary'));
 assert(!emitted.includes('Authorization'));
 assert(!emitted.includes('Bearer '));
 for(const p of full.providers){assert(!('value' in p));assert(!('token' in p));assert(!('fingerprint' in p));}
 const partial=providerEnvironmentHealth({...sampleEnv,CLOUDFLARE_ACCOUNT_ID:' ',MISTRAL_API_KEY:'  '});
 assert.equal(partial.configured,9);
 assert.equal(partial.providers.find(x=>x.id==='cloudflare').status,'INCOMPLETE');
 assert.deepEqual(partial.providers.find(x=>x.id==='cloudflare').missingPrerequisites,['CLOUDFLARE_ACCOUNT_ID']);
 assert.equal(partial.providers.find(x=>x.id==='mistral').status,'NOT_CONFIGURED');
 assert.equal(partial.providers.find(x=>x.id==='groq').authenticationTested,false);
 const responseBox=response(),service={health:async()=>({status:'ok',aiAvailable:true,roleDebate:{available:true}})};
 await api({method:'GET',query:{mode:'health'}},responseBox,{service});
 assert.equal(responseBox.code,200);
 assert.equal(responseBox.body.providerEnvironment?.total,11);
 assert.equal(responseBox.body.providerEnvironment.safeRedacted,true);
 assert.equal(responseBox.body.providerEnvironment.checking,'ENVIRONMENT_PRESENCE_ONLY_NO_PROVIDER_REQUESTS');
 assert.equal(responseBox.body.aiAvailable,true,'existing Gemini health remains intact');
 console.log('Multi-provider environment presence/status and redacted public health integration PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

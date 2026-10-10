'use strict';

// Public, redacted inventory ONLY. Never return env values, prefixes, lengths,
// fingerprints, auth headers, or raw upstream provider errors.
const VERSION='PULSE_PROVIDER_ENV_CHECK_v1';
const PROVIDERS=Object.freeze([
  {id:'aionlabs',label:'AionLabs',env:'AIONLABS_API_KEY'},
  {id:'cohere',label:'Cohere',env:'COHERE_API_KEY'},
  {id:'gemini',label:'Gemini',env:'GEMINI_API_KEY',implemented:true},
  {id:'mistral',label:'Mistral AI',env:'MISTRAL_API_KEY'},
  {id:'openrouter',label:'OpenRouter',env:'OPENROUTER_API_KEY'},
  {id:'ollama',label:'Ollama',env:'OLLAMA_API_KEY'},
  {id:'llm7',label:'LLM7.io',env:'LLM7_API_KEY'},
  {id:'kilocode',label:'Kilo Code',env:'KILOCODE_API_KEY'},
  {id:'huggingface',label:'Hugging Face',env:'HUGGINGFACE_API_TOKEN'},
  {id:'groq',label:'Groq',env:'GROQ_API_KEY'},
  {id:'cloudflare',label:'Cloudflare AI',env:'CLOUDFLARE_API_TOKEN',extra:['CLOUDFLARE_ACCOUNT_ID']}
]);
const present=(env,key)=>typeof env?.[key]==='string'&&env[key].trim().length>0;

function providerEnvironmentHealth(env=process.env){
  const providers=PROVIDERS.map(({id,label,env:key,extra=[],implemented=false})=>{
    const configured=present(env,key);
    const missing=extra.filter(x=>!present(env,x));
    return {
      id,label,envName:key,configured,
      prerequisitesConfigured:missing.length===0,
      missingPrerequisites:missing,
      status:!configured?'NOT_CONFIGURED':missing.length?'INCOMPLETE':'CONFIGURED_UNVERIFIED',
      integration:'PULSE_AI_ROUTER_IMPLEMENTED',
      authenticationTested:false
    };
  });
  return {
    version:VERSION,
    safeRedacted:true,
    checking:'ENVIRONMENT_PRESENCE_ONLY_NO_PROVIDER_REQUESTS',
    total:providers.length,
    configured:providers.filter(x=>x.configured&&x.prerequisitesConfigured).length,
    allConfigured:providers.every(x=>x.configured&&x.prerequisitesConfigured),
    providers,
    warning:'CONFIGURED_UNVERIFIED means a non-empty environment variable exists; it does not confirm that the API key is valid, has quota or can be used by the app. Rotate keys previously shared in chat.'
  };
}
module.exports={VERSION,PROVIDERS,providerEnvironmentHealth};

'use strict';
const DEFAULT_URL='https://api.openai.com/v1/responses';
function safeUrl(v){try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.toString():null}catch{return null}}
function arr(v){return Array.isArray(v)?v:[]}
function normalizeBrief(raw={},meta={}){
  const sources=arr(raw.sources).map(x=>({title:String(x?.title||'출처'),url:safeUrl(x?.url)})).filter(x=>x.url).slice(0,12);
  return{status:'ok',model:meta.model||raw.model||null,usedWeb:Boolean(meta.usedWeb),summary:String(raw.summary||''),highlights:arr(raw.highlights).slice(0,12),watch:arr(raw.watch).slice(0,12),dataWarnings:arr(raw.dataWarnings).slice(0,12),sources};
}
function outputText(json){if(typeof json?.output_text==='string')return json.output_text;for(const o of arr(json?.output))for(const c of arr(o?.content))if(typeof c?.text==='string')return c.text;return''}
function parseOutput(text){const raw=String(text||'').trim();if(!raw)return{};const unfenced=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();try{return JSON.parse(unfenced)}catch{}const a=unfenced.indexOf('{'),b=unfenced.lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(unfenced.slice(a,b+1))}catch{}return{summary:raw}}
function createOpenAIGateway({fetchImpl=global.fetch,apiKey=process.env.OPENAI_API_KEY||'',baseUrl=DEFAULT_URL,sleep=(ms)=>new Promise(r=>setTimeout(r,ms))}={}){
  const available=Boolean(apiKey&&fetchImpl);
  async function call({context,question=null,selectedSymbol=null,useWeb=false,deep=false}){
    if(!available){const e=new Error('OpenAI unavailable');e.code='AI_UNAVAILABLE';throw e}
    const model=deep?'gpt-5.6-sol':'gpt-5.6-luna';
    const payload={model,input:[{role:'system',content:'You are Pulse AI, a cautious crypto market research assistant. Use only supplied scanner context and cited web evidence. Never imply guaranteed returns or execute trades. Translate and summarize all user-facing news text in natural Korean. Preserve proper nouns, ticker symbols, numbers, dates, and source URLs accurately. Return JSON only, without markdown fences, with summary, highlights, watch, dataWarnings, sources.'},{role:'user',content:JSON.stringify({context,question,selectedSymbol})}],max_output_tokens:deep?1800:1000};
    if(useWeb)payload.tools=[{type:'web_search'}];
    let last;
    for(let attempt=0;attempt<2;attempt++){
      const res=await fetchImpl(baseUrl,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify(payload)});last=res;
      if(res.ok){const json=await res.json();const parsed=parseOutput(outputText(json));return normalizeBrief(parsed,{model:json.model||model,usedWeb:useWeb})}
      if(!(res.status===429||res.status>=500)||attempt===1)break;await sleep(150);
    }
    const text=last&&last.text?await last.text():'';const e=new Error(`OpenAI request failed: ${last?.status||'unknown'} ${text}`);e.statusCode=last?.status||502;throw e;
  }
  return{available,brief:({context,useWeb=false,deep=false})=>call({context,useWeb,deep}),chat:({context,question,selectedSymbol,deep=false})=>call({context,question,selectedSymbol,useWeb:true,deep})};
}
module.exports={createOpenAIGateway,normalizeBrief};

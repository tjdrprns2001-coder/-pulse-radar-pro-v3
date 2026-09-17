'use strict';
const DEFAULT_BASE='https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL='gemini-3.8-flash';
function safeUrl(v){try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.toString():null}catch{return null}}
function arr(v){return Array.isArray(v)?v:[]}
function normalizeBrief(raw={},meta={}){
  const sources=arr(raw.sources).map(x=>({title:String(x?.title||'출처'),url:safeUrl(x?.url)})).filter(x=>x.url).slice(0,12);
  return{status:'ok',model:meta.model||raw.model||null,usedWeb:Boolean(meta.usedWeb),summary:String(raw.summary||''),highlights:arr(raw.highlights).slice(0,12),watch:arr(raw.watch).slice(0,12),dataWarnings:arr(raw.dataWarnings).slice(0,12),sources};
}
function endpoint(base,model){const s=String(base||DEFAULT_BASE).replace(/\/+$/,'');return `${s}/models/${encodeURIComponent(model||DEFAULT_MODEL)}:generateContent`}
function outputText(json){return arr(json?.candidates).flatMap(c=>arr(c?.content?.parts)).map(p=>typeof p?.text==='string'?p.text:'').join('')}
function parseOutput(text){const raw=String(text||'').trim();if(!raw)return{};const unfenced=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();try{return JSON.parse(unfenced)}catch{}const a=unfenced.indexOf('{'),b=unfenced.lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(unfenced.slice(a,b+1))}catch{}return{summary:raw}}
function createOpenAIGateway({fetchImpl=global.fetch,apiKey=process.env.GEMINI_API_KEY||'',baseUrl=process.env.GEMINI_BASE_URL||DEFAULT_BASE,model=process.env.GEMINI_MODEL||DEFAULT_MODEL,sleep=(ms)=>new Promise(r=>setTimeout(r,ms))}={}){
  const available=Boolean(apiKey&&fetchImpl),url=endpoint(baseUrl,model);
  const system='You are Pulse AI, a cautious crypto market research assistant. Use only supplied scanner context and cited web evidence. Never imply guaranteed returns or execute trades. Translate and summarize all user-facing news text in natural Korean. Preserve proper nouns, ticker symbols, numbers, dates, and source URLs accurately. If live web evidence is unavailable, say so and do not invent news. Return JSON only, without markdown fences, with summary, highlights, watch, dataWarnings, sources.';
  async function send(payload,usedWeb){
    let last;
    for(let attempt=0;attempt<2;attempt++){
      const res=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(payload)});last=res;
      if(res.ok){const json=await res.json();const parsed=parseOutput(outputText(json));return normalizeBrief(parsed,{model:json.modelVersion||model,usedWeb})}
      if(!(res.status===429||res.status>=500)||attempt===1)break;await sleep(150);
    }
    return{last};
  }
  async function call({context,question=null,selectedSymbol=null,useWeb=false,deep=false}){
    if(!available){const e=new Error('AI unavailable');e.code='AI_UNAVAILABLE';throw e}
    const payload={
      system_instruction:{parts:[{text:system}]},
      contents:[{role:'user',parts:[{text:JSON.stringify({context,question,selectedSymbol})}]}],
      generationConfig:{maxOutputTokens:deep?1800:1000,responseMimeType:'application/json'}
    };
    if(useWeb)payload.tools=[{google_search:{}}];
    const first=await send(payload,useWeb);
    if(first?.status==='ok')return first;
    const status=first?.last?.status;
    if(useWeb&&(status===400||status===403)){
      const fallbackPayload={...payload};delete fallbackPayload.tools;
      const fallback=await send(fallbackPayload,false);
      if(fallback?.status==='ok')return fallback;
      first.last=fallback?.last||first.last;
    }
    const text=first?.last&&first.last.text?await first.last.text():'';const e=new Error(`Gemini request failed: ${first?.last?.status||'unknown'} ${text}`);e.statusCode=first?.last?.status||502;throw e;
  }
  return{available,brief:({context,useWeb=false,deep=false})=>call({context,useWeb,deep}),chat:({context,question,selectedSymbol,deep=false})=>call({context,question,selectedSymbol,useWeb:true,deep})};
}
module.exports={createOpenAIGateway,normalizeBrief};

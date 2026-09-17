'use strict';

const DEFAULT_BASE='https://api.openai.com/v1';
const MODELS=Object.freeze({routine:'gpt-5.6-luna',deep:'gpt-5.6-sol'});
function sleepDefault(ms){return new Promise(r=>setTimeout(r,ms))}
function validHttpUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}
function sourceList(v){const seen=new Set(),out=[];for(const s of Array.isArray(v)?v:[]){const url=String(s?.url||'');if(!validHttpUrl(url)||seen.has(url))continue;seen.add(url);out.push({title:String(s?.title||s?.domain||url).slice(0,180),url,domain:String(s?.domain||'').slice(0,120),publishedAt:s?.publishedAt?String(s.publishedAt).slice(0,80):null})}return out.slice(0,12)}
function normalizeBrief(raw={},meta={}){
  const highlights=(Array.isArray(raw.highlights)?raw.highlights:[]).slice(0,8).map(x=>({symbol:String(x?.symbol||'').slice(0,32),category:String(x?.category||'').slice(0,64),sector:String(x?.sector||'기타').slice(0,64),explanation:String(x?.explanation||'').slice(0,700),evidence:(Array.isArray(x?.evidence)?x.evidence:[]).slice(0,5).map(v=>String(v).slice(0,220)),confidence:['낮음','보통','높음'].includes(x?.confidence)?x.confidence:'보통',sourceRefs:(Array.isArray(x?.sourceRefs)?x.sourceRefs:[]).slice(0,6).map(v=>String(v).slice(0,240))}));
  return{status:'ok',model:String(meta.model||raw.model||''),usedWeb:Boolean(meta.usedWeb||raw.usedWeb),summary:String(raw.summary||'').slice(0,1600),highlights,watch:(Array.isArray(raw.watch)?raw.watch:[]).slice(0,10).map(v=>String(v).slice(0,360)),dataWarnings:(Array.isArray(raw.dataWarnings)?raw.dataWarnings:[]).slice(0,10).map(v=>String(v).slice(0,360)),sources:sourceList(raw.sources)};
}
function extractText(json={}){if(typeof json.output_text==='string')return json.output_text;for(const item of Array.isArray(json.output)?json.output:[]){if(item?.type!=='message')continue;for(const c of Array.isArray(item.content)?item.content:[]){if((c?.type==='output_text'||c?.type==='text')&&typeof c.text==='string')return c.text}}return''}
function extractAnnotationSources(json={}){const out=[];for(const item of Array.isArray(json.output)?json.output:[]){for(const c of Array.isArray(item?.content)?item.content:[]){for(const a of Array.isArray(c?.annotations)?c.annotations:[]){const u=a?.url||a?.url_citation?.url;if(u)out.push({title:a?.title||a?.url_citation?.title||u,url:u})}}}return sourceList(out)}
function briefSchema(){return{type:'object',additionalProperties:false,properties:{summary:{type:'string'},highlights:{type:'array',items:{type:'object',additionalProperties:false,properties:{symbol:{type:'string'},category:{type:'string'},sector:{type:'string'},explanation:{type:'string'},evidence:{type:'array',items:{type:'string'}},confidence:{type:'string',enum:['낮음','보통','높음']},sourceRefs:{type:'array',items:{type:'string'}}},required:['symbol','category','sector','explanation','evidence','confidence','sourceRefs']}},watch:{type:'array',items:{type:'string'}},dataWarnings:{type:'array',items:{type:'string'}},sources:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},url:{type:'string'},domain:{type:['string','null']},publishedAt:{type:['string','null']}},required:['title','url','domain','publishedAt']}}},required:['summary','highlights','watch','dataWarnings','sources']}}
function parseJsonText(t){try{return JSON.parse(String(t||''))}catch{throw new Error('invalid structured output')}}
function createOpenAIGateway({fetchImpl=globalThis.fetch,apiKey=(typeof process!=='undefined'?process.env.OPENAI_API_KEY:''),baseUrl=DEFAULT_BASE,sleep=sleepDefault,timeoutMs=18000}={}){
  const key=String(apiKey||'');
  async function call({input,deep=false,useWeb=false,jsonMode=true}){
    if(!key)throw Object.assign(new Error('OPENAI_API_KEY missing'),{code:'AI_UNAVAILABLE'});
    const model=deep?MODELS.deep:MODELS.routine;
    const body={model,instructions:'너는 PulseRadar의 정보형 시장 분석 AI다. 관측 데이터와 추론을 구분하고, 확정 수익/가격 예측 표현을 쓰지 않는다. stale/failed 데이터는 강한 신호로 해석하지 않는다. 한국어로 간결하게 답한다.',input,max_output_tokens:jsonMode?2200:1200,store:false};
    if(useWeb){body.tools=[{type:'web_search_preview',search_context_size:'low'}];body.tool_choice='auto';body.include=['web_search_call.action.sources']}
    if(jsonMode)body.text={format:{type:'json_schema',name:'pulse_ai_brief',strict:true,schema:briefSchema()}};
    let last;
    for(let attempt=0;attempt<2;attempt++){
      const ac=typeof AbortController!=='undefined'?new AbortController():null;const timer=ac?setTimeout(()=>ac.abort(),timeoutMs):null;
      try{
        const r=await fetchImpl(`${baseUrl}/responses`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify(body),signal:ac?.signal});
        if(timer)clearTimeout(timer);
        if(!r.ok){const msg=await r.text().catch(()=>String(r.status));const e=Object.assign(new Error(`OpenAI ${r.status}: ${msg.slice(0,240)}`),{status:r.status});last=e;if(attempt===0&&(r.status===429||r.status>=500)){await sleep(150);continue}throw e}
        const json=await r.json();return{json,model,usedWeb:useWeb};
      }catch(e){if(timer)clearTimeout(timer);last=e;if(attempt===0&&(e?.name==='AbortError'||e?.status>=500)){await sleep(150);continue}throw e}
    }
    throw last||new Error('OpenAI request failed');
  }
  async function brief({context,useWeb=false,deep=false}={}){
    const input=`다음 PulseRadar 스캐너 근거만 바탕으로 시장 브리핑 JSON을 작성해. 웹 검색이 허용되면 주요 이벤트의 최신 촉매를 확인하고 출처 URL을 sources에 포함해. 인과가 불확실하면 '가능한 촉매'라고 표현해.\n${JSON.stringify(context||{})}`;
    const {json,model,usedWeb}=await call({input,deep,useWeb,jsonMode:true});const raw=parseJsonText(extractText(json));const merged=normalizeBrief(raw,{model,usedWeb});const ann=extractAnnotationSources(json);merged.sources=sourceList([...merged.sources,...ann]);return merged;
  }
  async function chat({context,question,selectedSymbol=null,deep=false,useWeb=true}={}){
    const q=String(question||'').trim();if(!q)throw Object.assign(new Error('question required'),{status:400});
    const input=`선택 종목: ${selectedSymbol||'없음'}\n질문: ${q.slice(0,1200)}\nPulseRadar 근거: ${JSON.stringify(context||{})}\n필요할 때만 웹 검색을 사용하고, 관측/추론을 구분해서 한국어로 답해.`;
    const {json,model,usedWeb}=await call({input,deep,useWeb,jsonMode:false});return{status:'ok',model,usedWeb,answer:extractText(json).slice(0,6000),sources:extractAnnotationSources(json)};
  }
  return{available:Boolean(key),brief,chat};
}
module.exports={DEFAULT_BASE,MODELS,validHttpUrl,normalizeBrief,createOpenAIGateway};

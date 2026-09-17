'use strict';
const {detectEvents}=require('./event-detector.js');
const {buildContext}=require('./context-builder.js');
function fallback(scan,detected,warning=null){
  const live=(scan?.items||[]).filter(x=>x.dataState==='live');const top=live.slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)).slice(0,5);
  const highlights=top.filter(x=>['급등 전조 관찰','급등 전조 강함'].includes(x.category)).map(x=>({symbol:x.symbol,category:x.category,sector:x.sector,score:x.candidateScore??null,reason:(x.reasons||[])[0]||null}));
  const watch=top.map(x=>({symbol:x.symbol,category:x.category,sector:x.sector,score:x.candidateScore??null}));
  const dataWarnings=[];if(scan?.partial)dataWarnings.push('스캐너 일부 데이터가 지연되거나 누락되었습니다.');if(warning)dataWarnings.push(String(warning));
  return{status:'ok',aiAvailable:false,aiGenerated:false,model:null,usedWeb:false,summary:detected?.material?'시장 스캐너에서 의미 있는 변화가 감지되었습니다. AI 없이 규칙 기반 요약을 표시합니다.':'현재 직전 스캔 대비 큰 변화가 없어 규칙 기반 상태를 유지합니다.',highlights,watch,dataWarnings,sources:[],updatedAt:scan?.updatedAt??Date.now()};
}
function createBriefingService({scanService,gateway,now=()=>Date.now(),cacheMs=30000}={}){
  if(!scanService||typeof scanService.run!=='function')throw new Error('scanService required');
  let previous=null,cached=null,cachedAt=0;
  async function getBrief(){
    if(cached&&now()-cachedAt<cacheMs)return cached;
    let scan;try{scan=await scanService.run({mode:'summary',limit:100})}catch(e){const out=fallback({status:'error',items:[],partial:true,updatedAt:now()},{material:false,events:[],sectorClusters:[]},`스캐너 오류: ${e.message||e}`);cached=out;cachedAt=now();return out}
    const detected=detectEvents(scan,previous);const context=buildContext(scan,detected);previous=scan;
    if(!gateway?.available){cached=fallback(scan,detected);cachedAt=now();return cached}
    if(!detected.material&&cached){cachedAt=now();return cached}
    try{const ai=await gateway.brief({context,useWeb:detected.material,deep:detected.events.length>=4||detected.sectorClusters.length>=2});cached={...ai,aiAvailable:true,aiGenerated:true,updatedAt:scan.updatedAt};cachedAt=now();return cached}catch(e){cached=fallback(scan,detected,`AI 요약 실패: ${e.message||e}`);cached.aiAvailable=true;cachedAt=now();return cached}
  }
  async function chat(input={}){
    const question=String(input.question||'').trim();if(!question){const e=new Error('question required');e.statusCode=400;throw e}if(question.length>1000){const e=new Error('question too long');e.statusCode=400;throw e}
    const scan=await scanService.run({mode:'summary',limit:100});const detected=detectEvents(scan,previous);const context=buildContext(scan,detected,{maxSymbols:16});previous=scan;
    if(!gateway?.available)return{...fallback(scan,detected,'AI API 키가 없어 질문형 분석은 규칙 기반 상태 요약만 제공합니다.'),answer:'AI 연결이 비활성화되어 있습니다. 현재 스캐너 상태와 감지 결과만 표시합니다.'};
    const ai=await gateway.chat({context,question,selectedSymbol:input.selectedSymbol||null,deep:Boolean(input.deep)});return{...ai,aiAvailable:true,aiGenerated:true,answer:ai.summary,updatedAt:scan.updatedAt};
  }
  return{getBrief,chat};
}
module.exports={createBriefingService};

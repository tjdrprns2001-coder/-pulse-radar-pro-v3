'use strict';
const {detectEvents}=require('./event-detector.js');
const {buildContext}=require('./context-builder.js');
const {enrichCatalysts,summarizeCatalysts}=require('./event-catalyst.js');

function fallbackSummary(top,detected,context,eventSummary=''){
  const names=top.slice(0,3).map(x=>`${x.symbol}(${x.category||'관찰'})`);
  const lead=names.length?`현재 우선 관찰 종목은 ${names.join(', ')}입니다.`:'현재 우선 관찰 종목이 없습니다.';
  const global=context?.marketIntel?.global||null;
  const marketBits=[];
  if(Number.isFinite(Number(global?.marketCapUsd)))marketBits.push(`전체 시가총액 약 $${(Number(global.marketCapUsd)/1e12).toFixed(2)}조`);
  if(Number.isFinite(Number(global?.volume24hUsd)))marketBits.push(`24시간 거래량 약 $${(Number(global.volume24hUsd)/1e9).toFixed(1)}B`);
  const state=detected?.material?'의미 있는 변화가 감지되었습니다.':'직전 스캔 대비 큰 변화는 감지되지 않았습니다.';
  return `시장 데이터 자동 요약: ${state} ${lead}${marketBits.length?` 시장 보강 데이터 기준 ${marketBits.join(', ')}입니다.`:''}${eventSummary?` ${eventSummary}`:''}`;
}
function fallback(scan,detected,warning=null,context=null,eventCatalysts=[],searched=false){
  const live=(scan?.items||[]).filter(x=>x.dataState==='live');
  const top=live.slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)).slice(0,5);
  const highlights=top.filter(x=>['급등 전조 관찰','급등 전조 강함'].includes(x.category)).map(x=>({symbol:x.symbol,category:x.category,sector:x.sector,score:x.candidateScore??null,reason:(x.reasons||[])[0]||null}));
  const watch=top.map(x=>({symbol:x.symbol,category:x.category,sector:x.sector,score:x.candidateScore??null}));
  const dataWarnings=[];if(scan?.partial)dataWarnings.push('스캐너 일부 데이터가 지연되거나 누락되었습니다.');if(warning)dataWarnings.push(String(warning));
  const enriched=enrichCatalysts(eventCatalysts,scan,Number(scan?.updatedAt)||Date.now());
  const eventSummary=summarizeCatalysts(enriched,searched);
  return{status:'ok',aiAvailable:false,aiGenerated:false,model:null,usedWeb:false,summary:fallbackSummary(top,detected,context,eventSummary),eventSummary,eventCatalysts:enriched,highlights,watch,dataWarnings,sources:[],updatedAt:scan?.updatedAt??Date.now()};
}
function aiWarning(error){
  const code=Number(error?.statusCode)||0;
  if(code===429)return'AI 사용량 한도에 도달해 시장 데이터 자동 요약으로 전환했습니다.';
  if(code===401||code===403)return'AI 인증 또는 사용 권한 문제로 시장 데이터 자동 요약으로 전환했습니다.';
  return'AI 연결을 사용할 수 없어 시장 데이터 자동 요약으로 전환했습니다.';
}
function createBriefingService({scanService,gateway,marketIntelService=null,now=()=>Date.now(),cacheMs=30000,eventRefreshMs=300000}={}){
  if(!scanService||typeof scanService.run!=='function')throw new Error('scanService required');
  let previous=null,cached=null,cachedAt=0,cachedCatalysts=[],lastEventResearchAt=0;
  async function addMarketIntel(context){
    if(!marketIntelService?.getOverview)return context;
    try{
      const m=await marketIntelService.getOverview();
      context.marketIntel={health:m.health||{},global:m.global||null,trending:(m.trending||[]).slice(0,10),categories:(m.categories||[]).slice(0,10),warnings:m.warnings||[]};
    }catch(e){
      context.marketIntel={health:{},global:null,trending:[],categories:[],warnings:['시장 보강 데이터를 일부 불러오지 못했습니다.']};
    }
    return context;
  }
  function addEventResearchContext(context){
    context.eventResearch={language:'ko',recentHours:72,upcomingDays:30,preferOfficial:true,sourceTiers:{A:'프로젝트·거래소 공식',B:'신뢰 매체',C:'미확인·커뮤니티'}};
    context.cachedEventCatalysts=cachedCatalysts.slice(0,12);
    return context;
  }
  function finalizeAi(ai,scan,searched){
    if(ai.usedWeb){
      cachedCatalysts=Array.isArray(ai.eventCatalysts)?ai.eventCatalysts:[];
      lastEventResearchAt=now();
    }
    const raw=ai.usedWeb?(ai.eventCatalysts||[]):((ai.eventCatalysts||[]).length?ai.eventCatalysts:cachedCatalysts);
    const eventCatalysts=enrichCatalysts(raw,scan,now());
    const eventSummary=summarizeCatalysts(eventCatalysts,searched||lastEventResearchAt>0);
    return{...ai,eventCatalysts,eventSummary};
  }
  async function getBrief(){
    if(cached&&now()-cachedAt<cacheMs)return cached;
    let scan;
    try{scan=await scanService.run({mode:'summary',limit:100})}
    catch(e){
      const out=fallback({status:'error',items:[],partial:true,updatedAt:now()},{material:false,events:[],sectorClusters:[]},'스캐너 데이터를 일부 불러오지 못했습니다.',null,cachedCatalysts,lastEventResearchAt>0);
      cached=out;cachedAt=now();return out;
    }
    const detected=detectEvents(scan,previous);
    const context=addEventResearchContext(await addMarketIntel(buildContext(scan,detected)));
    previous=scan;
    const eventRefreshDue=!lastEventResearchAt||now()-lastEventResearchAt>=eventRefreshMs;
    if(!gateway?.available){
      cached=fallback(scan,detected,'AI 연결이 비활성화되어 시장 데이터 자동 요약을 표시합니다.',context,cachedCatalysts,lastEventResearchAt>0);
      cachedAt=now();return cached;
    }
    if(!detected.material&&cached&&!eventRefreshDue){cachedAt=now();return cached}
    const useWeb=Boolean(detected.material||eventRefreshDue);
    try{
      const ai=await gateway.brief({context,useWeb,deep:detected.events.length>=4||detected.sectorClusters.length>=2});
      cached={...finalizeAi(ai,scan,useWeb),aiAvailable:true,aiGenerated:true,updatedAt:scan.updatedAt};
      cachedAt=now();return cached;
    }catch(e){
      cached=fallback(scan,detected,aiWarning(e),context,cachedCatalysts,lastEventResearchAt>0);
      cached.aiAvailable=true;cachedAt=now();return cached;
    }
  }
  async function chat(input={}){
    const question=String(input.question||'').trim();
    if(!question){const e=new Error('question required');e.statusCode=400;throw e}
    if(question.length>1000){const e=new Error('question too long');e.statusCode=400;throw e}
    const scan=await scanService.run({mode:'summary',limit:100});
    const detected=detectEvents(scan,previous);
    const context=addEventResearchContext(await addMarketIntel(buildContext(scan,detected,{maxSymbols:16})));
    previous=scan;
    if(!gateway?.available){
      const out=fallback(scan,detected,'AI 연결이 비활성화되어 시장 데이터 자동 요약을 표시합니다.',context,cachedCatalysts,lastEventResearchAt>0);
      return{...out,answer:out.summary};
    }
    try{
      const ai=await gateway.chat({context,question,selectedSymbol:input.selectedSymbol||null,deep:Boolean(input.deep)});
      const finalized=finalizeAi(ai,scan,true);
      return{...finalized,aiAvailable:true,aiGenerated:true,answer:finalized.summary,updatedAt:scan.updatedAt};
    }catch(e){
      const out=fallback(scan,detected,aiWarning(e),context,cachedCatalysts,lastEventResearchAt>0);out.aiAvailable=true;return{...out,answer:out.summary};
    }
  }
  return{getBrief,chat};
}
module.exports={createBriefingService};

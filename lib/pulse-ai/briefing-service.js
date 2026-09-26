'use strict';

const {detectEvents}=require('./event-detector.js');
const {buildContext}=require('./context-builder.js');
const {enrichCatalysts,summarizeCatalysts}=require('./event-catalyst.js');
const Analyst=require('./deterministic-analyst.js');

const VERSION='PULSE_AI_BRIEFING_v2';

function confidence(row){
  const s=Number(row?.candidateScore??row?.rankScore??0);
  if(s>=70)return'높음';if(s>=45)return'보통';return'낮음';
}
function fallback(scan,detected,{warning=null,context=null,eventCatalysts=[],searched=false,researchStatus=null,aiConfigured=false,now=Date.now()}={}){
  const candidates=Analyst.topCandidates(scan,8);
  const highlights=candidates.slice(0,5).map(x=>({
    symbol:x.symbol,category:x.category,sector:x.sector,score:x.candidateScore,
    reason:x.reason||'근거 확인 중',confidence:confidence(x),evidence:x.reasons||[]
  }));
  const watch=candidates.map(x=>({symbol:x.symbol,category:x.category,sector:x.sector,score:x.candidateScore,reason:x.reason||''}));
  const dataWarnings=[];
  if(scan?.partial)dataWarnings.push('스캐너 일부 데이터가 지연되거나 누락되었습니다.');
  if(scan?.sourceWarning)dataWarnings.push(String(scan.sourceWarning));
  if(warning)dataWarnings.push(String(warning));
  const enriched=enrichCatalysts(eventCatalysts,scan,now);
  const eventSummary=summarizeCatalysts(enriched,searched);
  return{
    status:'ok',version:VERSION,provider:aiConfigured?'gemini':'deterministic',aiAvailable:aiConfigured,aiGenerated:false,model:null,usedWeb:false,
    generatedAt:now,summary:Analyst.summaryText(scan,researchStatus),eventSummary,eventCatalysts:enriched,
    highlights,watch,dataWarnings,sources:[],contextVersion:context?.version||null,
    updatedAt:scan?.updatedAt??now
  };
}
function aiWarning(error){
  const code=Number(error?.statusCode)||0;
  if(code===429)return'AI 사용량 한도에 도달해 로컬 시장 분석으로 전환했습니다.';
  if(code===401||code===403)return'AI 인증 또는 사용 권한 문제로 로컬 시장 분석으로 전환했습니다.';
  if(code===504)return'AI 응답 시간이 초과되어 로컬 시장 분석으로 전환했습니다.';
  return'AI 연결을 사용할 수 없어 로컬 시장 분석으로 전환했습니다.';
}
function createBriefingService({
  scanService,gateway,marketIntelService=null,researchAI=null,now=()=>Date.now(),cacheMs=30000,eventRefreshMs=300000
}={}){
  if(!scanService||typeof scanService.run!=='function')throw new Error('scanService required');
  let previous=null,cachedBase=null,cachedScan=null,cachedDetected=null,cachedResearch=null,cachedAt=0,cachedCatalysts=[],lastEventResearchAt=0;

  async function getResearchStatus(){
    if(!researchAI)return null;
    try{
      if(typeof researchAI.hydrateRemote==='function')await researchAI.hydrateRemote(false);
      return typeof researchAI.status==='function'?researchAI.status():null;
    }catch{return null}
  }
  async function addMarketIntel(context){
    if(!marketIntelService?.getOverview)return context;
    try{
      const m=await marketIntelService.getOverview();
      context.marketIntel={
        health:m.health||{},global:m.global||null,trending:(m.trending||[]).slice(0,10),
        categories:(m.categories||[]).slice(0,10),warnings:m.warnings||[]
      };
    }catch{
      context.marketIntel={health:{},global:null,trending:[],categories:[],warnings:['시장 보강 데이터를 일부 불러오지 못했습니다.']};
    }
    return context;
  }
  function addEventResearchContext(context){
    context.eventResearch={
      language:'ko',recentHours:72,upcomingDays:30,preferOfficial:true,
      sourceTiers:{A:'프로젝트·거래소 공식',B:'신뢰 매체',C:'미확인·커뮤니티'}
    };
    context.cachedEventCatalysts=cachedCatalysts.slice(0,12);
    return context;
  }
  function decorate(base,scan,detected,researchStatus,selectedSymbol=null){
    const snap=Analyst.snapshot(scan,researchStatus,selectedSymbol,now());
    return{
      ...base,version:VERSION,generatedAt:base?.generatedAt||now(),updatedAt:scan?.updatedAt??base?.updatedAt??now(),
      scanUpdatedAt:scan?.updatedAt??null,marketPulse:snap.market,dataQuality:snap.dataQuality,
      candidates:snap.candidates,extended:snap.extended,sectors:snap.sectors,selectedFocus:snap.focus,
      researchAI:snap.researchAI,technicalEvents:(detected?.events||[]).slice(0,24),
      sectorClusters:(detected?.sectorClusters||[]).slice(0,12),
      cacheAgeMs:cachedAt?Math.max(0,now()-cachedAt):0
    };
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
  async function scanAndContext(selectedSymbol=null,maxSymbols=16){
    const scan=await scanService.run({mode:'summary',limit:100});
    const detected=detectEvents(scan,previous);
    const researchStatus=await getResearchStatus();
    let context=buildContext(scan,detected,{maxSymbols,selectedSymbol,researchStatus});
    context=addEventResearchContext(await addMarketIntel(context));
    previous=scan;
    return{scan,detected,researchStatus,context};
  }
  async function getBrief(input={}){
    const selectedSymbol=String(input.selectedSymbol||'').trim().toUpperCase()||null,force=Boolean(input.force);
    if(!force&&cachedBase&&cachedScan&&now()-cachedAt<cacheMs)return decorate(cachedBase,cachedScan,cachedDetected,cachedResearch,selectedSymbol);
    let scan,detected,researchStatus,context;
    try{
      ({scan,detected,researchStatus,context}=await scanAndContext(selectedSymbol,16));
    }catch{
      const broken={status:'error',items:[],partial:true,updatedAt:now(),dataHealth:{live:0,delayed:0,blocked:0,errors:1},scanCount:0};
      const out=fallback(broken,{material:false,events:[],sectorClusters:[]},{warning:'스캐너 데이터를 불러오지 못했습니다.',aiConfigured:Boolean(gateway?.available),now:now()});
      return decorate(out,broken,{events:[],sectorClusters:[]},null,selectedSymbol);
    }
    const eventRefreshDue=!lastEventResearchAt||now()-lastEventResearchAt>=eventRefreshMs;
    if(!gateway?.available){
      cachedBase=fallback(scan,detected,{
        warning:'외부 생성형 AI가 비활성화되어 로컬 시장 분석을 표시합니다.',context,eventCatalysts:cachedCatalysts,
        searched:lastEventResearchAt>0,researchStatus,aiConfigured:false,now:now()
      });
      cachedScan=scan;cachedDetected=detected;cachedResearch=researchStatus;cachedAt=now();
      return decorate(cachedBase,scan,detected,researchStatus,selectedSymbol);
    }
    if(!detected.material&&cachedBase&&!eventRefreshDue){
      cachedScan=scan;cachedDetected=detected;cachedResearch=researchStatus;cachedAt=now();
      return decorate(cachedBase,scan,detected,researchStatus,selectedSymbol);
    }
    const useWeb=Boolean(detected.material||eventRefreshDue);
    try{
      const ai=await gateway.brief({context,useWeb,deep:detected.events.length>=5||detected.sectorClusters.length>=3});
      cachedBase={...finalizeAi(ai,scan,useWeb),aiAvailable:true,aiGenerated:true,updatedAt:scan.updatedAt};
    }catch(e){
      cachedBase=fallback(scan,detected,{
        warning:aiWarning(e),context,eventCatalysts:cachedCatalysts,searched:lastEventResearchAt>0,
        researchStatus,aiConfigured:true,now:now()
      });
    }
    cachedScan=scan;cachedDetected=detected;cachedResearch=researchStatus;cachedAt=now();
    return decorate(cachedBase,scan,detected,researchStatus,selectedSymbol);
  }
  async function chat(input={}){
    const question=String(input.question||'').trim();
    if(!question){const e=new Error('question required');e.statusCode=400;throw e}
    if(question.length>1000){const e=new Error('question too long');e.statusCode=400;throw e}
    const selectedSymbol=String(input.selectedSymbol||'').trim().toUpperCase()||null;
    let scan,detected,researchStatus,context;
    try{({scan,detected,researchStatus,context}=await scanAndContext(selectedSymbol,20))}
    catch(e){e.statusCode=e.statusCode||503;throw e}
    if(!gateway?.available){
      const det=Analyst.deterministicAnswer({question,selectedSymbol,scan,eventCatalysts:cachedCatalysts,researchStatus});
      const out=fallback(scan,detected,{
        warning:'외부 생성형 AI가 비활성화되어 로컬 질의 분석을 사용했습니다.',context,eventCatalysts:cachedCatalysts,
        searched:lastEventResearchAt>0,researchStatus,aiConfigured:false,now:now()
      });
      return{...decorate(out,scan,detected,researchStatus,selectedSymbol),answer:det.answer,answerMode:'deterministic',intent:det.intent};
    }
    try{
      const ai=await gateway.chat({context,question,selectedSymbol,deep:Boolean(input.deep)});
      const finalized=finalizeAi(ai,scan,true);
      const out={...finalized,aiAvailable:true,aiGenerated:true,answer:finalized.summary,answerMode:'ai',updatedAt:scan.updatedAt};
      return decorate(out,scan,detected,researchStatus,selectedSymbol);
    }catch(e){
      const det=Analyst.deterministicAnswer({question,selectedSymbol,scan,eventCatalysts:cachedCatalysts,researchStatus});
      const out=fallback(scan,detected,{
        warning:aiWarning(e),context,eventCatalysts:cachedCatalysts,searched:lastEventResearchAt>0,
        researchStatus,aiConfigured:true,now:now()
      });
      return{...decorate(out,scan,detected,researchStatus,selectedSymbol),answer:det.answer,answerMode:'deterministic',intent:det.intent};
    }
  }
  async function health(){
    const researchStatus=await getResearchStatus();
    return{
      status:'ok',version:VERSION,provider:gateway?.provider||'deterministic',aiAvailable:Boolean(gateway?.available),
      model:gateway?.model||null,researchAI:researchStatus?Analyst.researchSnapshot(researchStatus):null,
      cache:{briefAgeMs:cachedAt?Math.max(0,now()-cachedAt):null,eventResearchAgeMs:lastEventResearchAt?Math.max(0,now()-lastEventResearchAt):null}
    };
  }
  return{version:VERSION,getBrief,chat,health};
}
module.exports={VERSION,createBriefingService,fallback,aiWarning};

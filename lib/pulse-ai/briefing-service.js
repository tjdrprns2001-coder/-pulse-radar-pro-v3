'use strict';
const {detectEvents,BAD}=require('./event-detector.js');
const {buildContext}=require('./context-builder.js');

const DEFAULT_TTL=60000;
function confidenceFor(item){const state=String(item?.dataState||'unknown').toLowerCase();if(BAD.has(state)||state==='unknown')return'낮음';const reasons=Array.isArray(item?.reasons)?item.reasons.length:0;return reasons>=3?'높음':reasons>=1?'보통':'낮음'}
function deterministicBrief(scan={},detected={},now=Date.now()){
  const items=Array.isArray(scan.items)?scan.items:[];
  const bad=items.filter(x=>BAD.has(String(x.dataState||'').toLowerCase()));
  const changed=new Set((detected.events||[]).map(e=>e.symbol));
  const ranked=items.filter(x=>!BAD.has(String(x.dataState||'').toLowerCase())).sort((a,b)=>(changed.has(b.symbol)-changed.has(a.symbol))+(Number(b.priority||0)-Number(a.priority||0))).slice(0,6);
  const highlights=ranked.map(x=>({symbol:x.symbol||'',category:x.category||'',sector:x.sector||'기타',explanation:(Array.isArray(x.reasons)&&x.reasons[0])||x.summary||`${x.symbol} ${x.category}`,evidence:(Array.isArray(x.reasons)?x.reasons:[]).slice(0,4),confidence:confidenceFor(x),sourceRefs:[]}));
  const clusters=(detected.sectorClusters||[]).map(x=>`${x.sector}: ${x.symbols.join(', ')} 동시 변화`).slice(0,5);
  const summary=highlights.length?`전체 ${scan.scanCount||items.length}개 종목 중 현재 변화가 큰 ${highlights.length}개를 우선 정리했습니다.`:'현재 스캐너에서 새로 강조할 큰 변화가 확인되지 않았습니다.';
  return{status:'ok',generatedAt:now,model:'deterministic',usedWeb:false,aiAvailable:false,analysisMode:'기본 분석',summary,highlights,watch:clusters,dataWarnings:bad.slice(0,6).map(x=>`${x.symbol}: 데이터 상태 ${x.dataState}`),sources:[]};
}
function createBriefingService({scanService,gateway,now=()=>Date.now(),ttlMs=DEFAULT_TTL}={}){
  if(!scanService)throw new Error('scanService required');
  let previous=null,cached=null;
  async function getScan(){return scanService.run({mode:'summary',limit:250})}
  async function getBrief({force=false}={}){
    const ts=now();
    if(!force&&cached&&ts-cached.generatedAt<ttlMs)return cached;
    let scan;
    try{scan=await getScan()}catch(e){return{status:'ok',generatedAt:ts,model:'deterministic',usedWeb:false,aiAvailable:Boolean(gateway?.available),analysisMode:'기본 분석',summary:'스캐너 데이터를 불러오지 못해 AI 해석을 보류합니다.',highlights:[],watch:[],dataWarnings:[String(e?.message||e).slice(0,300)],sources:[]}}
    const detected=detectEvents(scan,previous);const context=buildContext(scan,detected,{maxSymbols:8});
    const base=deterministicBrief(scan,detected,ts);
    previous=scan;
    if(!gateway?.available){cached=base;return cached}
    const meaningful=detected.material||!cached||force;
    if(!meaningful){cached={...cached,generatedAt:ts};return cached}
    const strong=(detected.events||[]).some(e=>e.type==='presurge_transition'||e.type==='score_jump')||(detected.sectorClusters||[]).length>0;
    const deep=(detected.events||[]).filter(e=>e.type==='presurge_transition').length>=3;
    try{
      const ai=await gateway.brief({context,useWeb:strong,deep});
      cached={...ai,generatedAt:ts,aiAvailable:true,analysisMode:'AI 분석'};
      return cached;
    }catch(e){cached={...base,dataWarnings:[...base.dataWarnings,`AI 분석 일시 중단: ${String(e?.message||e).slice(0,180)}`]};return cached}
  }
  async function chat({question,selectedSymbol=null,deep=false}={}){
    const q=String(question||'').trim();if(!q)throw Object.assign(new Error('question required'),{status:400});
    if(!gateway?.available)return{status:'ok',model:'deterministic',usedWeb:false,aiAvailable:false,answer:'AI API가 아직 연결되지 않아 자동 기본 분석만 사용할 수 있습니다.',sources:[]};
    let scan;try{scan=await getScan()}catch(e){throw Object.assign(new Error('scanner unavailable'),{status:503})}
    const detected=detectEvents(scan,previous);const context=buildContext(scan,detected,{maxSymbols:8});
    return{...(await gateway.chat({context,question:q,selectedSymbol,deep,useWeb:true})),aiAvailable:true};
  }
  return{getBrief,chat,_debug:()=>({previous,cached})};
}
module.exports={DEFAULT_TTL,deterministicBrief,createBriefingService};

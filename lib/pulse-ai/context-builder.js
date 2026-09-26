'use strict';

const VERSION='PULSE_AI_CONTEXT_v2';

function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function text(v,max=240){const s=String(v??'');return s.length>max?s.slice(0,max):s}
function bool(v){return typeof v==='boolean'?v:null}
function safeReasons(v){return (Array.isArray(v)?v:[]).slice(0,5).map(x=>text(x,160))}
function pick(row={}){
  return{
    symbol:text(row.symbol,24),category:text(row.category,48),sector:text(row.sector,48),
    marketScope:text(row.marketScope,24),spotListed:bool(row.spotListed),futuresListed:bool(row.futuresListed),
    candidateScore:n(row.candidateScore),preIgnitionScore:n(row.preIgnitionScore),priority:n(row.priority),
    dataState:text(row.dataState,24),reasons:safeReasons(row.reasons),structure:text(row.structure,24),momentum:text(row.momentum,24),
    priceChange24h:n(row.priceChange24h),priceChange1h:n(row.priceChange1h),priceChange15m:n(row.priceChange15m),
    quoteVolume24h:n(row.quoteVolume24h),volumeAcceleration:n(row.volumeAcceleration),takerRatio:n(row.takerRatio),
    fundingPct:n(row.fundingPct),oiChangePct:n(row.oiChangePct),autoDeepEligible:bool(row.autoDeepEligible),
    scanClass:row.scanClass?{key:text(row.scanClass.key,40),label:text(row.scanClass.label,80)}:null,
    tradeSignal:row.tradeSignal?{level:text(row.tradeSignal.level,30),confidence:n(row.tradeSignal.confidence),reasons:safeReasons(row.tradeSignal.reasons),invalidations:safeReasons(row.tradeSignal.invalidations)}:null,
    samplePattern:row.samplePattern?{archetype:text(row.samplePattern.archetype,40),phase:text(row.samplePattern.phase,40),score:n(row.samplePattern.score)}:null,
    researchAI:row.researchAI?{score:n(row.researchAI.score),stage:text(row.researchAI.stage,40),shadowOnly:row.researchAI.shadowOnly!==false}:null,
    updatedAt:n(row.updatedAt)
  };
}
function buildContext(scan,detected,options={}){
  const max=Math.max(1,Math.min(40,Number(options.maxSymbols)||12)),src=Array.isArray(scan?.items)?scan.items:[];
  const ranked=src.slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||(Number(b.candidateScore)||0)-(Number(a.candidateScore)||0));
  const breadth=scan?.marketBreadth||{},research=options.researchStatus||null,selected=String(options.selectedSymbol||'').toUpperCase();
  const selectedRow=selected?src.find(x=>String(x?.symbol||'').toUpperCase()===selected):null;
  return{
    version:VERSION,status:scan?.status||'unknown',updatedAt:n(scan?.updatedAt),scanCount:n(scan?.scanCount,src.length),
    partial:Boolean(scan?.partial),dataHealth:scan?.dataHealth||null,sourceWarning:scan?.sourceWarning||null,
    universe:{label:text(scan?.universe,120),meta:scan?.universeMeta||null,coverage:scan?.marketCoverage||null},
    breadth:{
      count:n(breadth.count),up:n(breadth.up),down:n(breadth.down),flat:n(breadth.flat),median:n(breadth.median),
      gt5:n(breadth.gt5),gt10:n(breadth.gt10),lt5:n(breadth.lt5),
      majors:{BTC:n(breadth.majors?.BTC),ETH:n(breadth.majors?.ETH),SOL:n(breadth.majors?.SOL)}
    },
    categories:scan?.categories||{},scanClasses:scan?.scanClasses||{},candidateSymbols:(scan?.candidateSymbols||[]).slice(0,60).map(String),
    events:Array.isArray(detected?.events)?detected.events.slice(0,24):[],
    sectorClusters:Array.isArray(detected?.sectorClusters)?detected.sectorClusters.slice(0,12):[],
    selectedSymbol:selected||null,selected:selectedRow?pick(selectedRow):null,
    researchAI:research?{
      version:text(research.version,40),shadowOnly:research.shadowOnly!==false,observations:n(research.observations),pending:n(research.pending),
      labels:n(research.labels),positive:n(research.positive),negative:n(research.negative),
      model:research.model?{type:text(research.model.type,64),state:text(research.model.state,24),active:Boolean(research.model.active),minimumLabels:n(research.model.minimumLabels)}:null
    }:null,
    symbols:ranked.slice(0,max).map(pick)
  };
}
module.exports={VERSION,pick,buildContext};

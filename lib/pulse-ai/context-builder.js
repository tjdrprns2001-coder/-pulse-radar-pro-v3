'use strict';

function finiteOrNull(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function textOrNull(v,max=240){if(v===null||v===undefined)return null;return String(v).slice(0,max)}
function safeItem(x={}){return{
  symbol:textOrNull(x.symbol,32),category:textOrNull(x.category,64),sector:textOrNull(x.sector,64),
  candidateScore:finiteOrNull(x.candidateScore),priority:finiteOrNull(x.priority),dataState:textOrNull(x.dataState,32),
  structure:textOrNull(x.structure,32),momentum:textOrNull(x.momentum,32),fundingPct:finiteOrNull(x.fundingPct),oiChangePct:finiteOrNull(x.oiChangePct),
  reasons:Array.isArray(x.reasons)?x.reasons.slice(0,4).map(r=>textOrNull(r,180)):[],
  tfState:x.tfState&&typeof x.tfState==='object'?Object.fromEntries(Object.entries(x.tfState).slice(0,6).map(([k,v])=>[String(k).slice(0,8),textOrNull(v,40)])):{}
}}
function buildContext(scan={},detected={},options={}){
  const max=Math.max(1,Math.min(12,Number(options.maxSymbols)||8));
  const items=Array.isArray(scan.items)?scan.items:[];
  const wanted=new Set((detected.events||[]).map(e=>e.symbol).filter(Boolean));
  const ranked=items.slice().sort((a,b)=>(wanted.has(b.symbol)-wanted.has(a.symbol))+(Number(b.priority||0)-Number(a.priority||0))+(Number(b.candidateScore||0)-Number(a.candidateScore||0)));
  const symbols=ranked.slice(0,max).map(safeItem);
  return{
    observedAt:finiteOrNull(scan.updatedAt),scanCount:finiteOrNull(scan.scanCount),deepScanCount:finiteOrNull(scan.deepScanCount),partial:Boolean(scan.partial),
    dataHealth:scan.dataHealth&&typeof scan.dataHealth==='object'?{live:finiteOrNull(scan.dataHealth.live),delayed:finiteOrNull(scan.dataHealth.delayed),blocked:finiteOrNull(scan.dataHealth.blocked),errors:finiteOrNull(scan.dataHealth.errors)}:null,
    events:(detected.events||[]).slice(0,12).map(e=>({type:textOrNull(e.type,40),symbol:textOrNull(e.symbol,32),sector:textOrNull(e.sector,64),category:textOrNull(e.category,64),message:textOrNull(e.message,180)})),
    sectorClusters:(detected.sectorClusters||[]).slice(0,6).map(x=>({sector:textOrNull(x.sector,64),count:finiteOrNull(x.count),symbols:Array.isArray(x.symbols)?x.symbols.slice(0,8).map(s=>textOrNull(s,32)):[]})),
    symbols
  };
}
module.exports={buildContext,safeItem};

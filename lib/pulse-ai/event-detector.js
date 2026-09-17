'use strict';

const DEFAULT_CONFIG=Object.freeze({scoreJump:20,clusterMin:2,maxEvents:12});
const PRE=new Set(['급등 전조 강함','급등 전조 관찰']);
const BAD=new Set(['stale','failed','reconnecting','backfill','verifying']);

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function bySymbol(scan){return new Map((scan&&Array.isArray(scan.items)?scan.items:[]).map(x=>[String(x.symbol||''),x]).filter(x=>x[0]))}
function isBad(item){return BAD.has(String(item?.dataState||'').toLowerCase())}
function changedSignal(item,prev){
  if(!prev)return PRE.has(item.category)||['거래량 이상징후','매수세 유입'].includes(item.category);
  return item.category!==prev.category||String(item.dataState)!==String(prev.dataState)||(num(item.candidateScore)!=null&&num(prev.candidateScore)!=null&&num(item.candidateScore)-num(prev.candidateScore)>=DEFAULT_CONFIG.scoreJump);
}
function detectEvents(current={},previous=null,config={}){
  const cfg={...DEFAULT_CONFIG,...config};
  const now=bySymbol(current),before=bySymbol(previous||{}),events=[];
  const changedForClusters=[];
  for(const [symbol,item] of now){
    const prev=before.get(symbol);
    const state=String(item.dataState||'unknown').toLowerCase();
    if(BAD.has(state)&&(!prev||String(prev.dataState||'').toLowerCase()!==state))events.push({type:'data_warning',symbol,sector:item.sector||'기타',category:item.category,dataState:state,message:`${symbol} 데이터 상태 ${state}`});
    if(isBad(item))continue;
    if(PRE.has(item.category)&&(!prev||!PRE.has(prev.category)||prev.category!==item.category))events.push({type:'presurge_transition',symbol,sector:item.sector||'기타',category:item.category,dataState:state,message:`${symbol} ${item.category} 전환`});
    const score=num(item.candidateScore),old=num(prev?.candidateScore);
    if(prev&&score!=null&&old!=null&&score-old>=cfg.scoreJump)events.push({type:'score_jump',symbol,sector:item.sector||'기타',category:item.category,dataState:state,delta:score-old,message:`${symbol} 후보점수 +${Math.round(score-old)}`});
    if(prev&&item.category!==prev.category&&['거래량 이상징후','매수세 유입'].includes(item.category))events.push({type:item.category==='거래량 이상징후'?'volume_anomaly':'buy_pressure',symbol,sector:item.sector||'기타',category:item.category,dataState:state,message:`${symbol} ${item.category} 전환`});
    if(changedSignal(item,prev))changedForClusters.push(item);
  }
  const sectors=new Map();
  for(const x of changedForClusters){if(isBad(x))continue;const s=x.sector||'기타';const a=sectors.get(s)||[];a.push(x.symbol);sectors.set(s,a)}
  const sectorClusters=[...sectors].filter(([,symbols])=>symbols.length>=cfg.clusterMin).map(([sector,symbols])=>({sector,symbols:symbols.slice(0,8),count:symbols.length}));
  const limited=events.slice(0,cfg.maxEvents);
  return{material:limited.length>0||sectorClusters.length>0,events:limited,sectorClusters,config:{scoreJump:cfg.scoreJump,clusterMin:cfg.clusterMin,maxEvents:cfg.maxEvents}};
}

module.exports={DEFAULT_CONFIG,PRE,BAD,detectEvents};

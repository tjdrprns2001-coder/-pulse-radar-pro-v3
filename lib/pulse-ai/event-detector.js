'use strict';
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function bySymbol(scan){return new Map((scan&&Array.isArray(scan.items)?scan.items:[]).map(x=>[x.symbol,x]))}
function detectEvents(current,previous,config={}){
  const scoreJump=Number(config.scoreJump)||20,events=[],clusters=[];
  const prev=bySymbol(previous),items=current&&Array.isArray(current.items)?current.items:[];
  for(const item of items){
    const old=prev.get(item.symbol);const score=num(item.candidateScore),oldScore=num(old&&old.candidateScore);
    if(item.dataState&&item.dataState!=='live'&&(!old||old.dataState!==item.dataState))events.push({type:'data_warning',symbol:item.symbol,dataState:item.dataState});
    if(old&&item.category==='급등 전조 관찰'&&old.category!=='급등 전조 관찰'&&item.dataState==='live')events.push({type:'presurge_transition',symbol:item.symbol,from:old.category,to:item.category,score});
    if(old&&score!==null&&oldScore!==null&&score-oldScore>=scoreJump&&item.dataState==='live')events.push({type:'score_jump',symbol:item.symbol,delta:score-oldScore,score});
  }
  const sectors={};for(const x of items){if(x.dataState!=='live'||!['급등 전조 관찰','급등 전조 강함'].includes(x.category))continue;const s=x.sector||'기타';(sectors[s]||(sectors[s]=[])).push(x.symbol)}
  for(const [sector,symbols] of Object.entries(sectors))if(symbols.length>=2)clusters.push({sector,count:symbols.length,symbols});
  return{material:events.length>0||clusters.length>0,events,sectorClusters:clusters};
}
module.exports={detectEvents};

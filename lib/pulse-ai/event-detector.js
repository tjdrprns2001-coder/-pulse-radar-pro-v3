'use strict';

const VERSION='PULSE_AI_EVENTS_v2';

function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function bySymbol(scan){return new Map((Array.isArray(scan?.items)?scan.items:[]).map(x=>[String(x.symbol||''),x]))}
function isPre(row){return ['급등 전조 관찰','급등 전조 강함'].includes(String(row?.category||''))}
function crossed(oldV,newV,threshold){const a=num(oldV),b=num(newV);return b!=null&&b>=threshold&&(a==null||a<threshold)}
function clusterRows(items){
  const sectors={};
  for(const x of items){
    if(x?.dataState!=='live'||!isPre(x))continue;
    const s=String(x.sector||'기타');(sectors[s]||(sectors[s]=[])).push(String(x.symbol||''));
  }
  return Object.entries(sectors).filter(([,symbols])=>symbols.length>=2).map(([sector,symbols])=>({sector,count:symbols.length,symbols:symbols.slice(0,12)})).sort((a,b)=>b.count-a.count||a.sector.localeCompare(b.sector));
}
function clusterChanged(current=[],previous=[]){
  const a=new Map(current.map(x=>[x.sector,x.count])),b=new Map(previous.map(x=>[x.sector,x.count])),keys=new Set([...a.keys(),...b.keys()]);
  for(const k of keys){
    const x=a.get(k)||0,y=b.get(k)||0;
    if((x>=2&&y<2)||(y>=2&&x<2)||Math.abs(x-y)>=2)return true;
  }
  return false;
}
function detectEvents(current,previous,config={}){
  const scoreJump=Number(config.scoreJump)||15,volumeSpike=Number(config.volumeSpike)||3,takerBuy=Number(config.takerBuy)||1.2,oiBuild=Number(config.oiBuild)||1;
  const events=[],prev=bySymbol(previous),items=Array.isArray(current?.items)?current.items:[];
  for(const item of items){
    const old=prev.get(String(item.symbol||'')),score=num(item.candidateScore),oldScore=num(old?.candidateScore);
    const live=item.dataState==='live',oldLive=old?.dataState==='live';
    if(item.dataState&&item.dataState!=='live'&&(!old||old.dataState!==item.dataState))events.push({type:'data_warning',symbol:item.symbol,dataState:item.dataState});
    if(old&&!oldLive&&live)events.push({type:'data_recovered',symbol:item.symbol,dataState:item.dataState});
    if(old&&live){
      if(isPre(item)&&!isPre(old))events.push({type:'presurge_transition',symbol:item.symbol,from:old.category,to:item.category,score});
      else if(item.category==='급등 전조 강함'&&old.category!=='급등 전조 강함')events.push({type:'presurge_upgrade',symbol:item.symbol,from:old.category,to:item.category,score});
      else if(!isPre(item)&&isPre(old))events.push({type:'presurge_exit',symbol:item.symbol,from:old.category,to:item.category,score});
      if(score!=null&&oldScore!=null&&score-oldScore>=scoreJump)events.push({type:'score_jump',symbol:item.symbol,delta:Number((score-oldScore).toFixed(2)),score});
      if(crossed(old.volumeAcceleration,item.volumeAcceleration,volumeSpike))events.push({type:'volume_spike',symbol:item.symbol,value:num(item.volumeAcceleration)});
      if(crossed(old.takerRatio,item.takerRatio,takerBuy))events.push({type:'taker_buy',symbol:item.symbol,value:num(item.takerRatio)});
      const oldOi=num(old.oiChangePct??old.oi4hPct),newOi=num(item.oiChangePct??item.oi4hPct);
      if(crossed(oldOi,newOi,oiBuild))events.push({type:'oi_build',symbol:item.symbol,value:newOi});
    }
  }
  const sectorClusters=clusterRows(items),prevClusters=clusterRows(Array.isArray(previous?.items)?previous.items:[]);
  const sectorChanged=Boolean(previous)&&clusterChanged(sectorClusters,prevClusters);
  if(sectorChanged)events.push({type:'sector_rotation',clusters:sectorClusters.slice(0,8)});
  return{version:VERSION,material:events.some(e=>e.type!=='data_recovered')||sectorChanged,events:events.slice(0,40),sectorClusters};
}
module.exports={VERSION,isPre,clusterRows,clusterChanged,detectEvents};

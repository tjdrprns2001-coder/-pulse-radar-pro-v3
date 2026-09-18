'use strict';
const crypto=require('crypto');
function assignGroups({bowlActive,intersectionActive}={}){
  if(bowlActive&&intersectionActive)return'C';
  if(bowlActive)return'B';
  if(intersectionActive)return'A';
  return null;
}
function quarter(ts){const d=new Date(Number(ts));return d.getUTCFullYear()+'-Q'+(Math.floor(d.getUTCMonth()/3)+1)}
function year(ts){return new Date(Number(ts)).getUTCFullYear()}
function hashKey(symbol,eventId,ts){return crypto.createHash('sha256').update('bowl-baseline-v1|'+String(symbol).toUpperCase()+'|'+eventId+'|'+ts).digest('hex')}
function selectBaseline({symbol,signalEventId,signalTs,candidateTimestamps=[],usedTimestamps=new Set(),isValid=()=>true}={}){
  const q=quarter(signalTs),y=year(signalTs);
  const all=[...new Set(candidateTimestamps.map(Number).filter(Number.isFinite))].filter(ts=>ts!==Number(signalTs)&&isValid(ts));
  let pool=all.filter(ts=>quarter(ts)===q&&!usedTimestamps.has(ts));
  let matchScope='quarter';
  if(!pool.length){pool=all.filter(ts=>year(ts)===y&&!usedTimestamps.has(ts));matchScope='year'}
  if(!pool.length)return{timestamp:null,status:'unavailable',matchScope:null,hash:null};
  const ranked=pool.map(ts=>({ts,hash:hashKey(symbol,signalEventId,ts)})).sort((a,b)=>a.hash.localeCompare(b.hash));
  return{timestamp:ranked[0].ts,status:'selected',matchScope,hash:ranked[0].hash};
}
module.exports={assignGroups,selectBaseline};

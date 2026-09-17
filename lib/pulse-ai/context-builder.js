'use strict';
const SAFE=['symbol','category','sector','candidateScore','priority','dataState','reasons','structure','momentum','tfState','preSurge','priceChange24h','priceChange1h','priceChange15m','volumeAcceleration','takerRatio','fundingPct','oiChangePct','updatedAt'];
function pick(row){const out={};for(const k of SAFE)out[k]=Object.prototype.hasOwnProperty.call(row||{},k)?row[k]:null;return out}
function buildContext(scan,detected,options={}){
  const max=Math.max(1,Math.min(40,Number(options.maxSymbols)||12));const src=scan&&Array.isArray(scan.items)?scan.items:[];
  const ranked=src.slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||(Number(b.candidateScore)||0)-(Number(a.candidateScore)||0));
  return{status:scan?.status||'unknown',updatedAt:scan?.updatedAt??null,scanCount:scan?.scanCount??src.length,partial:Boolean(scan?.partial),dataHealth:scan?.dataHealth||null,events:Array.isArray(detected?.events)?detected.events.slice(0,20):[],sectorClusters:Array.isArray(detected?.sectorClusters)?detected.sectorClusters.slice(0,10):[],symbols:ranked.slice(0,max).map(pick)};
}
module.exports={buildContext};

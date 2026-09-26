'use strict';

const Similarity=require('./similarity.js');

const VERSION='RESEARCH_ARCHETYPE_LAB_v2';

function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function centroid(rows=[]){
  const size=Math.max(0,...rows.map(r=>Array.isArray(r.features)?r.features.length:0)),out=[];
  for(let i=0;i<size;i++){
    const xs=rows.map(r=>n(r.features?.[i])).filter(v=>v!=null);
    out[i]=xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
  }
  return out;
}
function avg(xs=[]){const a=xs.map(n).filter(v=>v!=null);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function buildClusters(observations=[],{similarityThreshold=.82,minOverlap=6}={}){
  const positives=observations.filter(x=>x.label===1&&Array.isArray(x.features)).slice().sort((a,b)=>Number(a.asOf||0)-Number(b.asOf||0));
  const clusters=[];
  for(const row of positives){
    let best=null;
    for(const c of clusters){
      const cmp=Similarity.compareVectors(row.features,c.centroid,{minOverlap});
      if(cmp.similarity!=null&&(!best||cmp.similarity>best.cmp.similarity))best={cluster:c,cmp};
    }
    if(best&&best.cmp.similarity>=similarityThreshold){
      best.cluster.members.push(row);best.cluster.centroid=centroid(best.cluster.members);
    }else{
      clusters.push({id:'RC-'+String(clusters.length+1).padStart(3,'0'),state:'RESEARCH_CANDIDATE',members:[row],centroid:row.features.slice()});
    }
  }
  return clusters.map(c=>({
    id:c.id,state:c.state,productionEligible:false,count:c.members.length,
    symbols:[...new Set(c.members.map(x=>x.symbol))].slice(0,20),
    sources:[...new Set(c.members.map(x=>x.source||'UNKNOWN'))],
    setupTypes:[...new Set(c.members.map(x=>x.setupType||'UNKNOWN'))],
    regimes:[...new Set(c.members.map(x=>x.regime||x.canonicalSnapshot?.market?.regime||'UNKNOWN'))],
    centroid:c.centroid,
    avgMfePct:avg(c.members.map(x=>x.outcomeV2?.mfePct)),
    avgMaePct:avg(c.members.map(x=>x.outcomeV2?.maePct)),
    memberKeys:c.members.map(x=>x.key)
  }));
}
function compareToClusters(observation,clusters=[],{minOverlap=6}={}){
  return clusters.map(c=>{
    const cmp=Similarity.compareVectors(observation.features||[],c.centroid||[],{minOverlap});
    return{id:c.id,state:c.state,similarity:cmp.similarity,score:cmp.score,overlap:cmp.overlap};
  }).filter(x=>x.similarity!=null).sort((a,b)=>b.similarity-a.similarity);
}

module.exports={VERSION,centroid,buildClusters,compareToClusters};

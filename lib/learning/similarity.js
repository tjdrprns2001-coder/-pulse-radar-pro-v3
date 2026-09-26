'use strict';

const VERSION='RESEARCH_SIMILARITY_v2';

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function compareVectors(a=[],b=[],{minOverlap=3,scale=2.2}={}){
  let sum=0,count=0;
  const used=[];
  for(let i=0;i<Math.min(a.length,b.length);i++){
    const x=n(a[i]),y=n(b[i]);
    if(x==null||y==null)continue;
    const d=x-y;sum+=d*d;count++;used.push(i);
  }
  if(count<minOverlap)return{version:VERSION,score:null,similarity:null,overlap:count,used,status:'INSUFFICIENT_OVERLAP'};
  const similarity=Math.exp(-(sum/count)*scale);
  return{version:VERSION,score:Math.round(similarity*100),similarity,overlap:count,used,status:'OK'};
}
function rank(query,candidates=[],featureOf,{minOverlap=3,limit=5}={}){
  const q=featureOf(query);
  return candidates.map(candidate=>{
    const cmp=compareVectors(q,featureOf(candidate),{minOverlap});
    return{candidate, ...cmp};
  }).filter(x=>x.similarity!=null).sort((a,b)=>b.similarity-a.similarity).slice(0,limit);
}
function blendScores(parts=[]){
  let total=0,weight=0;
  for(const p of parts){
    const value=n(p?.value),w=n(p?.weight);
    if(value==null||w==null||w<=0)continue;
    total+=value*w;weight+=w;
  }
  return weight?total/weight:null;
}

module.exports={VERSION,compareVectors,rank,blendScores};

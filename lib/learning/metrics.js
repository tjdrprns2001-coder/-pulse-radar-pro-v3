'use strict';

const VERSION='RESEARCH_METRICS_v2';

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function binaryMetrics(rows=[],threshold=.5){
  const usable=rows.filter(r=>(r.label===0||r.label===1)&&n(r.prediction)!=null);
  let tp=0,tn=0,fp=0,fn=0,brier=0;
  for(const r of usable){
    const p=n(r.prediction),pred=p>=threshold?1:0;
    if(pred===1&&r.label===1)tp++;
    else if(pred===0&&r.label===0)tn++;
    else if(pred===1&&r.label===0)fp++;
    else fn++;
    brier+=(p-r.label)*(p-r.label);
  }
  const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null;
  const fpr=fp+tn?fp/(fp+tn):null;
  return{version:VERSION,count:usable.length,tp,tn,fp,fn,precision,recall,falsePositiveRate:fpr,brier:usable.length?brier/usable.length:null};
}
function outcomeMetrics(rows=[]){
  const mfe=rows.map(r=>n(r.outcomeV2?.mfePct??r.mfe72hPct)).filter(v=>v!=null);
  const mae=rows.map(r=>n(r.outcomeV2?.maePct??r.mae72hPct)).filter(v=>v!=null);
  const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  return{count:rows.length,mfePct:avg(mfe),maePct:avg(mae)};
}
function calibrationBuckets(rows=[],bucketSize=.1){
  const buckets=new Map();
  for(const r of rows){
    const p=n(r.prediction);
    if(p==null||(r.label!==0&&r.label!==1))continue;
    const start=Math.min(.9,Math.floor(Math.max(0,Math.min(.999999,p))/bucketSize)*bucketSize);
    const key=start.toFixed(1)+'-'+Math.min(1,start+bucketSize).toFixed(1);
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(r);
  }
  const out=[];
  for(const [bucket,arr] of buckets){
    const avgPred=arr.reduce((s,r)=>s+n(r.prediction),0)/arr.length;
    const actual=arr.reduce((s,r)=>s+r.label,0)/arr.length;
    out.push({bucket,count:arr.length,avgPrediction:avgPred,actualRate:actual,error:Math.abs(avgPred-actual)});
  }
  out.sort((a,b)=>a.bucket.localeCompare(b.bucket));
  return out;
}
function maxCalibrationError(rows=[]){
  const b=calibrationBuckets(rows);
  return b.length?Math.max(...b.map(x=>x.error)):null;
}

module.exports={VERSION,binaryMetrics,outcomeMetrics,calibrationBuckets,maxCalibrationError};

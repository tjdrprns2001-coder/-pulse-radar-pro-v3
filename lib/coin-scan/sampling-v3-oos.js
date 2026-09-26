'use strict';

const VERSION='SAMPLING_V3_OOS_v1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function mean(xs=[]){const a=xs.map(finite).filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function overlap(a,b){return Math.max(0,Math.min(a.endTime,b.endTime)-Math.max(a.startTime,b.startTime))}
function normalizeEvents(events=[]){
  return (Array.isArray(events)?events:[]).map((e,i)=>({
    id:String(e.id??e.eventId??i),
    startTime:finite(e.startTime??e.signalTime??e.entryTime),
    endTime:finite(e.endTime??e.exitTime??e.labelEndTime),
    label:String(e.label??e.outcome??'UNLABELED'),
    score:finite(e.score??e.evidenceScore),
    weight:finite(e.weight)??1,
    raw:e
  })).filter(e=>e.startTime!=null&&e.endTime!=null&&e.endTime>=e.startTime).sort((a,b)=>a.startTime-b.startTime||a.endTime-b.endTime);
}
function uniquenessWeights(events=[]){
  const e=normalizeEvents(events),points=[...new Set(e.flatMap(x=>[x.startTime,x.endTime+1]))].sort((a,b)=>a-b),out={};
  for(const x of e){
    let weighted=0,total=0;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];if(b<=x.startTime||a>x.endTime)continue;
      const mid=(a+b)/2,active=e.filter(y=>y.startTime<=mid&&y.endTime>=mid).length;
      const span=b-a;if(active>0){weighted+=span/active;total+=span}
    }
    out[x.id]=total>0?weighted/total:1;
  }
  return out;
}
function seeded(seed=17){let x=(Number(seed)||17)>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296}}
function sequentialBootstrap(events=[],sampleSize=null,{seed=17}={}){
  const e=normalizeEvents(events);if(!e.length)return[];
  const size=Math.max(1,Math.min(e.length,Math.floor(sampleSize??e.length)));
  const picked=[],remaining=[...e],rng=seeded(seed);
  while(picked.length<size&&remaining.length){
    const candidates=remaining.map(c=>{
      const combined=[...picked,c],u=uniquenessWeights(combined)[c.id]??1;
      return{c,w:Math.max(1e-6,u)};
    });
    const sum=candidates.reduce((s,x)=>s+x.w,0),r=rng()*sum;let acc=0,choice=0;
    for(let i=0;i<candidates.length;i++){acc+=candidates[i].w;if(r<=acc){choice=i;break}}
    const chosen=candidates[choice].c;picked.push(chosen);
    remaining.splice(remaining.findIndex(x=>x.id===chosen.id),1);
  }
  return picked;
}
function buildPurgedWalkForward(events=[],{
  folds=4,minTrain=20,embargoMs=0,testFraction=null
}={}){
  const e=normalizeEvents(events);if(e.length<2)return[];
  const foldCount=Math.max(2,Math.min(Math.floor(folds)||4,e.length));
  const testSize=Math.max(1,Math.floor(testFraction?e.length*testFraction:e.length/foldCount));
  const out=[];
  for(let f=0;f<foldCount;f++){
    const testStartIndex=Math.min(e.length-1,Math.floor((f+1)*e.length/(foldCount+1)));
    const test=e.slice(testStartIndex,Math.min(e.length,testStartIndex+testSize));if(!test.length)continue;
    const testStart=Math.min(...test.map(x=>x.startTime)),testEnd=Math.max(...test.map(x=>x.endTime));
    const cutoff=testStart-Math.max(0,Number(embargoMs)||0);
    const train=e.slice(0,testStartIndex).filter(x=>x.endTime<cutoff);
    const purged=e.slice(0,testStartIndex).filter(x=>x.endTime>=cutoff);
    if(train.length<minTrain)continue;
    out.push({fold:f+1,train,test,purged,testStart,testEnd,embargoMs:Math.max(0,Number(embargoMs)||0)});
  }
  return out;
}
function classificationMetrics(rows=[]){
  const labeled=rows.filter(x=>['SURGE','FAILED_BOS','NO_TRIGGER'].includes(x.label)&&Number.isFinite(x.score));
  const positive=x=>x.label==='SURGE',pred=x=>x.score>=50;
  const tp=labeled.filter(x=>positive(x)&&pred(x)).length,fn=labeled.filter(x=>positive(x)&&!pred(x)).length;
  const fp=labeled.filter(x=>!positive(x)&&pred(x)).length,tn=labeled.filter(x=>!positive(x)&&!pred(x)).length;
  return{
    n:labeled.length,tp,fn,fp,tn,
    precision:tp+fp?tp/(tp+fp):null,
    recall:tp+fn?tp/(tp+fn):null,
    specificity:tn+fp?tn/(tn+fp):null,
    accuracy:labeled.length?(tp+tn)/labeled.length:null
  };
}
function validate(events=[],opts={}){
  const normalized=normalizeEvents(events),folds=buildPurgedWalkForward(normalized,opts),reports=[];
  for(const fold of folds){
    const boot=sequentialBootstrap(fold.train,Math.min(fold.train.length,opts.bootstrapSize||fold.train.length),{seed:(opts.seed||17)+fold.fold});
    const testRows=fold.test.map(x=>({label:x.label,score:x.score}));
    reports.push({
      fold:fold.fold,trainCount:fold.train.length,purgedCount:fold.purged.length,testCount:fold.test.length,
      trainUniquenessMean:mean(Object.values(uniquenessWeights(fold.train))),
      bootstrapCount:boot.length,
      metrics:classificationMetrics(testRows)
    });
  }
  const acc=reports.map(x=>x.metrics.accuracy).filter(Number.isFinite);
  return{
    version:VERSION,status:reports.length?'READY':'INSUFFICIENT_DATA',
    eventCount:normalized.length,foldCount:reports.length,
    meanAccuracy:mean(acc),
    reports,
    promotionGate:{
      minEvents:80,minFolds:3,minMeanAccuracy:.55,
      passed:normalized.length>=80&&reports.length>=3&&Number.isFinite(mean(acc))&&mean(acc)>=.55
    },
    note:'Promotion gate is intentionally conservative and only meaningful on forward-labeled Sampling v3 events.'
  };
}
module.exports={VERSION,normalizeEvents,uniquenessWeights,sequentialBootstrap,buildPurgedWalkForward,classificationMetrics,validate};

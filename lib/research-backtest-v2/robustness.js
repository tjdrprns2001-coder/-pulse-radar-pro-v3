'use strict';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function mean(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function q(a,p){const x=a.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!x.length)return null;const z=(x.length-1)*p,i=Math.floor(z),j=Math.ceil(z);return i===j?x[i]:x[i]+(x[j]-x[i])*(z-i)}
function lcg(seed){let s=(Number(seed)||1)>>>0;return()=>((s=(1664525*s+1013904223)>>>0)/4294967296)}
function bootstrapMeanCI(values,{iterations=1000,confidence=.95,seed=42}={}){
 const a=values.map(Number).filter(Number.isFinite);if(!a.length)return{count:0,mean:null,low:null,high:null,confidence};
 const rnd=lcg(seed),dist=[];for(let b=0;b<Math.max(100,Math.min(10000,iterations));b++){let s=0;for(let i=0;i<a.length;i++)s+=a[Math.floor(rnd()*a.length)];dist.push(s/a.length)}
 const alpha=(1-confidence)/2;return{count:a.length,mean:mean(a),low:q(dist,alpha),high:q(dist,1-alpha),confidence,iterations:dist.length};
}
function sensitivitySummary(variants=[]){
 const rows=(variants||[]).map(x=>({params:x.params||{},profitFactor:finite(x.report?.profitFactor),meanReturnPct:finite(x.report?.meanNetReturnPct),mdd:finite(x.report?.maxDrawdownPct),samples:finite(x.report?.sampleCount)||0}));
 const usable=rows.filter(x=>x.samples>0);
 const positive=usable.filter(x=>(x.meanReturnPct??-Infinity)>0),pfOk=usable.filter(x=>(x.profitFactor??0)>=1);
 return{variantCount:rows.length,usableCount:usable.length,positiveReturnRatio:usable.length?positive.length/usable.length:null,profitFactorAboveOneRatio:usable.length?pfOk.length/usable.length:null,medianMeanReturnPct:q(usable.map(x=>x.meanReturnPct),.5),worstMeanReturnPct:usable.length?Math.min(...usable.map(x=>x.meanReturnPct).filter(Number.isFinite)):null,stable:usable.length>=3&&positive.length/usable.length>=.6&&pfOk.length/usable.length>=.6};
}
function deflatedSharpeApprox({sharpe,observations,trials=1}={}){
 const s=finite(sharpe),n=Math.max(0,Number(observations)||0),t=Math.max(1,Number(trials)||1);if(s==null||n<3)return null;
 const penalty=Math.sqrt(2*Math.log(t))/Math.sqrt(n);return s-penalty;
}
function pboApprox(folds=[]){
 const rows=(folds||[]).filter(x=>Number.isFinite(Number(x.trainObjective))&&Number.isFinite(Number(x.validationReport?.profitFactor)));if(rows.length<3)return null;
 const train=rows.map(x=>Number(x.trainObjective)),val=rows.map(x=>Number(x.validationReport.profitFactor));
 const mt=q(train,.5),mv=q(val,.5);let over=0;for(let i=0;i<rows.length;i++)if(train[i]>=mt&&val[i]<mv)over++;
 return over/rows.length;
}
function robustnessReport({trades=[],variants=[],walkForwardResult=null,trialCount=1}={}){
 const returns=(trades||[]).filter(x=>x?.status==='filled').map(x=>Number(x.netReturnPct)).filter(Number.isFinite);
 const ci=bootstrapMeanCI(returns,{iterations:1500,confidence:.95,seed:20260925});
 const sens=sensitivitySummary(variants),folds=walkForwardResult?.folds||[];
 const foldReturns=folds.map(x=>finite(x.validationReport?.meanNetReturnPct)).filter(v=>v!=null);
 return{bootstrapMeanReturnPct:ci,sensitivity:sens,walkForwardFoldMeanCI:bootstrapMeanCI(foldReturns,{iterations:1000,confidence:.95,seed:256}),pboApprox:pboApprox(folds),trialCount,notes:['PBO/Deflated Sharpe는 근사 진단값이며 수익 보증이 아님']};
}
module.exports={mean,q,bootstrapMeanCI,sensitivitySummary,deflatedSharpeApprox,pboApprox,robustnessReport};

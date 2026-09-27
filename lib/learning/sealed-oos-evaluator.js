'use strict';
const Lab=require('./research-lab.js');

const VERSION='SEALED_OOS_EVALUATOR_v1';
function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function hashSeed(s=''){let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let x=seed||123456789;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)/4294967296)}}
function metricValue(r,kind){
  if(kind==='net72')return n(r.outcomeV2?.netHorizons?.h72);
  if(kind==='gross72')return n(r.outcomeV2?.horizons?.h72?.returnPct);
  return r.label===1?1:r.label===0?0:null;
}
function chooseMetric(rows=[]){
  const usable=rows.filter(r=>r.label===0||r.label===1),net=usable.filter(r=>n(r.outcomeV2?.netHorizons?.h72)!=null).length;
  return usable.length&&net/usable.length>=.8?'net72':'label';
}
function mean(arr=[]){const a=arr.filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function quantile(arr,p){if(!arr.length)return null;const a=arr.slice().sort((x,y)=>x-y),i=Math.max(0,Math.min(a.length-1,Math.floor((a.length-1)*p)));return a[i]}
function bootstrapDiff(a=[],b=[],{iterations=1000,seed=1}={}){
  const aa=a.filter(Number.isFinite),bb=b.filter(Number.isFinite);if(!aa.length||!bb.length)return{low:null,high:null,meanDiff:null,iterations:0};
  const rand=rng(seed),diffs=[];
  for(let k=0;k<iterations;k++){
    let sa=0,sb=0;for(let i=0;i<aa.length;i++)sa+=aa[Math.floor(rand()*aa.length)];for(let i=0;i<bb.length;i++)sb+=bb[Math.floor(rand()*bb.length)];
    diffs.push(sa/aa.length-sb/bb.length);
  }
  return{low:quantile(diffs,.025),high:quantile(diffs,.975),meanDiff:mean(diffs),iterations};
}
function matched(rows,h){return rows.filter(r=>Lab.matchHypothesis(r,h))}
function regimeStats(rows=[],kind='label'){
  const m=new Map();for(const r of rows){const g=String(r.regime||'UNKNOWN');if(!m.has(g))m.set(g,[]);const v=metricValue(r,kind);if(v!=null)m.get(g).push(v)}
  return [...m.entries()].map(([regime,vals])=>({regime,count:vals.length,mean:mean(vals)})).filter(x=>x.count>0);
}
function compare({rows=[],champion,challenger,lockedOosStart,minSample=30,minRegimes=2,iterations=1000}={}){
  if(!Number.isFinite(Number(lockedOosStart)))return{version:VERSION,status:'BLOCKED',reason:'LOCKED_OOS_NOT_FROZEN',promotionEligible:false};
  const oos=rows.filter(r=>!r.referenceOnly&&Number(r.asOf)>=Number(lockedOosStart)&&(r.label===0||r.label===1));
  const a=matched(oos,challenger||{}),b=matched(oos,champion||{});
  const combined=[...a,...b],kind=chooseMetric(combined);
  if(kind!=='net72')return{version:VERSION,status:'BLOCKED',reason:'COST_ADJUSTED_72H_NOT_READY',metric:kind,promotionEligible:false,challengerN:a.length,championN:b.length};
  if(a.length<minSample||b.length<minSample)return{version:VERSION,status:'SAMPLE_INSUFFICIENT',reason:'MIN_SAMPLE',metric:kind,promotionEligible:false,challengerN:a.length,championN:b.length,minSample};
  const av=a.map(r=>metricValue(r,kind)),bv=b.map(r=>metricValue(r,kind));
  const ci=bootstrapDiff(av,bv,{iterations,seed:hashSeed((challenger?.strategyId||challenger?.id||'A')+'|'+(champion?.strategyId||champion?.id||'B')+'|'+lockedOosStart)});
  const ar=regimeStats(a,kind),br=regimeStats(b,kind),bm=new Map(br.map(x=>[x.regime,x]));
  const comparable=ar.map(x=>({challenger:x,champion:bm.get(x.regime)})).filter(x=>x.champion&&x.challenger.count>=5&&x.champion.count>=5);
  const notWorse=comparable.filter(x=>x.challenger.mean>=x.champion.mean).length;
  const regimePass=comparable.length>=minRegimes&&notWorse>=minRegimes;
  const ciPass=ci.low!=null&&ci.low>0;
  return{
    version:VERSION,status:ciPass&&regimePass?'PROMOTION_REVIEW':'SHADOW_CONTINUE',promotionEligible:ciPass&&regimePass,
    metric:'72H 비용차감 수익률',challengerN:a.length,championN:b.length,
    challengerMean:mean(av),championMean:mean(bv),bootstrap95:ci,
    regimeComparison:{required:minRegimes,comparable:comparable.length,notWorse,pass:regimePass,rows:comparable},
    gates:{minimumSample:true,bootstrapLowerAboveZero:ciPass,multiRegimeConsistency:regimePass,costAdjusted:true},
    lockedOosStart:Number(lockedOosStart)
  };
}
module.exports={VERSION,metricValue,chooseMetric,bootstrapDiff,regimeStats,compare};

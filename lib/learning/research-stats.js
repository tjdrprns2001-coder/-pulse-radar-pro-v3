'use strict';

const VERSION='RESEARCH_STATS_v2';

function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function avg(xs=[]){const a=xs.map(n).filter(v=>v!=null);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function labeled(rows=[]){return rows.filter(x=>x.label===0||x.label===1)}
function aggregateBy(rows,keyOf){
  const groups=new Map();
  for(const row of labeled(rows)){
    const keys=keyOf(row),arr=Array.isArray(keys)?keys:[keys];
    for(const raw of arr){
      const key=raw==null||raw===''?'UNKNOWN':String(raw);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(row);
    }
  }
  return [...groups.entries()].map(([key,items])=>({
    key,count:items.length,success:items.filter(x=>x.label===1).length,failure:items.filter(x=>x.label===0).length,
    successRate:items.length?items.filter(x=>x.label===1).length/items.length:null,
    avgMfePct:avg(items.map(x=>x.outcomeV2?.mfePct??x.mfe72hPct)),
    avgMaePct:avg(items.map(x=>x.outcomeV2?.maePct??x.mae72hPct))
  })).sort((a,b)=>b.count-a.count||String(a.key).localeCompare(String(b.key)));
}
function ruleStats(rows=[]){
  const groups=new Map();
  for(const row of labeled(rows)){
    const regime=String(row.regime||row.canonicalSnapshot?.market?.regime||'UNKNOWN');
    for(const id of Array.isArray(row.bookRuleIds)?row.bookRuleIds:[]){
      const key=String(id),rk=key+'@@'+regime;
      if(!groups.has(rk))groups.set(rk,{ruleId:key,regime,items:[]});
      groups.get(rk).items.push(row);
    }
  }
  return [...groups.values()].map(g=>({
    ruleId:g.ruleId,regime:g.regime,count:g.items.length,
    success:g.items.filter(x=>x.label===1).length,
    successRate:g.items.length?g.items.filter(x=>x.label===1).length/g.items.length:null,
    avgMfePct:avg(g.items.map(x=>x.outcomeV2?.mfePct)),avgMaePct:avg(g.items.map(x=>x.outcomeV2?.maePct))
  })).sort((a,b)=>b.count-a.count||b.successRate-a.successRate);
}
function derivedRuleCombos(rows=[],{minCount=5,maxRules=3}={}){
  const groups=new Map();
  for(const row of labeled(rows)){
    const ids=[...new Set(Array.isArray(row.bookRuleIds)?row.bookRuleIds.map(String):[])].sort().slice(0,maxRules);
    if(ids.length<2)continue;
    const regime=String(row.regime||row.canonicalSnapshot?.market?.regime||'UNKNOWN'),key=ids.join('+')+'@@'+regime;
    if(!groups.has(key))groups.set(key,{ids,regime,items:[]});
    groups.get(key).items.push(row);
  }
  return [...groups.values()].filter(g=>g.items.length>=minCount).map(g=>({
    type:'DERIVED_RESEARCH_RULE',ruleIds:g.ids,regime:g.regime,count:g.items.length,
    successRate:g.items.filter(x=>x.label===1).length/g.items.length,
    avgMfePct:avg(g.items.map(x=>x.outcomeV2?.mfePct)),avgMaePct:avg(g.items.map(x=>x.outcomeV2?.maePct)),
    productionEligible:false
  })).sort((a,b)=>b.count-a.count||b.successRate-a.successRate);
}
function scoreBuckets(rows=[]){
  const groups=new Map();
  for(const row of labeled(rows)){
    const score=n(row.researchScore);if(score==null)continue;
    const start=Math.min(90,Math.floor(Math.max(0,Math.min(100,score))/10)*10),key=start+'-'+Math.min(100,start+9);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key,items])=>({key,count:items.length,successRate:items.filter(x=>x.label===1).length/items.length,avgMfePct:avg(items.map(x=>x.outcomeV2?.mfePct)),avgMaePct:avg(items.map(x=>x.outcomeV2?.maePct))})).sort((a,b)=>Number(a.key.split('-')[0])-Number(b.key.split('-')[0]));
}
function summary(rows=[]){
  return{
    version:VERSION,
    scoreBuckets:scoreBuckets(rows),
    byRegime:aggregateBy(rows,r=>r.regime||r.canonicalSnapshot?.market?.regime||'UNKNOWN'),
    bySetup:aggregateBy(rows,r=>r.setupType||'UNKNOWN'),
    bySource:aggregateBy(rows,r=>r.source||'UNKNOWN'),
    bookRules:ruleStats(rows),
    derivedRules:derivedRuleCombos(rows)
  };
}

module.exports={VERSION,avg,labeled,aggregateBy,ruleStats,derivedRuleCombos,scoreBuckets,summary};

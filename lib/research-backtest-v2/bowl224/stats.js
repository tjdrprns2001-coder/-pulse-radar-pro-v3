'use strict';
function rate(rows,label){const vals=rows.map(x=>x.outcome?.labels?.[label]).filter(v=>typeof v==='boolean');const hit=vals.filter(Boolean).length;return{evaluatedCount:vals.length,hitCount:hit,hitRate:vals.length?hit/vals.length:null}}
function median(a){const x=a.filter(Number.isFinite).sort((p,q)=>p-q);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function buildBowlStats({events=[],annotations=[],outcomes=[],hypothesisEvidence=[]}={}){
 const formal=events.filter(e=>e?.source==='bowl224-formal'&&!e.hypothesisOnly);const om=new Map(outcomes.map(o=>[o.eventId,o]));
 const cohorts={};for(const cohort of ['3A','3B','3C','3B1H']){
  const rows=formal.filter(e=>e.cohort===cohort).map(event=>({event,outcome:om.get(event.eventId)||null}));
  const evaluated=rows.filter(r=>r.outcome);const clean=evaluated.filter(r=>r.outcome?.labels?.Hit_72H_10pct===true&&Number(r.outcome?.hits?.Hit_72H_10pct?.mae_before_hit_pct)>=-3).length;
  cohorts[cohort]={sampleCount:rows.length,evaluatedCount:evaluated.length,labels:{
    Hit_24H_10pct:rate(rows,'Hit_24H_10pct'),Hit_72H_10pct:rate(rows,'Hit_72H_10pct'),Hit_7D_10pct:rate(rows,'Hit_7D_10pct'),Hit_72H_15pct:rate(rows,'Hit_72H_15pct'),Hit_72H_20pct:rate(rows,'Hit_72H_20pct'),Hit_7D_15pct:rate(rows,'Hit_7D_15pct'),Hit_7D_20pct:rate(rows,'Hit_7D_20pct')
   },clean10pctMae3Share:evaluated.length?clean/evaluated.length:null,mae72Median:median(evaluated.map(r=>Number(r.outcome?.horizons?.h72?.mae_pct))),mfe72Median:median(evaluated.map(r=>Number(r.outcome?.horizons?.h72?.mfe_pct))),timeToHit72MedianMs:median(evaluated.map(r=>Number(r.outcome?.hits?.Hit_72H_10pct?.time_to_hit_ms)))};
 }
 const groups={};for(const g of ['A','B','C','D'])groups[g]=formal.filter(e=>e.group===g).length;
 const perSymbol={};for(const e of formal)perSymbol[e.symbol]=(perSymbol[e.symbol]||0)+1;
 return{hypothesisEvidenceExcluded:true,hypothesisEvidenceCount:Array.isArray(hypothesisEvidence)?hypothesisEvidence.length:0,formalEventCount:formal.length,cohorts,groups,perSymbol,annotationCount:annotations.length};
}
module.exports={buildBowlStats};
'use strict';
const {assertValidationManifest,finite}=require('./contracts.js');
const {HORIZONS}=require('./outcomes.js');

function quantile(values,q){
  const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;
  const pos=(a.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);
  return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(pos-lo);
}
function dist(values){
  const a=values.filter(Number.isFinite);if(!a.length)return{count:0,mean:null,p10:null,p25:null,p50:null,p75:null,p90:null};
  return{count:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p10:quantile(a,.1),p25:quantile(a,.25),p50:quantile(a,.5),p75:quantile(a,.75),p90:quantile(a,.9)};
}
function featureStats(events){
  const keys=new Set();for(const e of events)for(const k of Object.keys(e.numericFeatures||{}))keys.add(k);
  const out={};for(const k of keys){const all=events.map(e=>finite(e.numericFeatures?.[k]));const vals=all.filter(v=>v!=null);out[k]={...dist(vals),missingCount:all.length-vals.length,missingRate:all.length?(all.length-vals.length)/all.length:null}}
  return out;
}
function compareFeatureDistributions(successRows=[],failureRows=[]){
  const keys=new Set();for(const r of [...successRows,...failureRows])for(const k of Object.keys(r.numericFeatures||{}))keys.add(k);
  const out={};for(const k of keys){
    const s=successRows.map(r=>finite(r.numericFeatures?.[k])).filter(v=>v!=null),f=failureRows.map(r=>finite(r.numericFeatures?.[k])).filter(v=>v!=null);
    const sd=dist(s),fd=dist(f);
    let effectSize=null;
    if(s.length>1&&f.length>1){
      const mean=x=>x.reduce((a,b)=>a+b,0)/x.length,variance=(x,m)=>x.reduce((a,b)=>a+(b-m)*(b-m),0)/(x.length-1);
      const sm=mean(s),fm=mean(f),pooled=Math.sqrt(((s.length-1)*variance(s,sm)+(f.length-1)*variance(f,fm))/(s.length+f.length-2));
      if(pooled>0)effectSize=(sm-fm)/pooled;
    }
    out[k]={success:sd,failure:fd,medianDifference:sd.p50!=null&&fd.p50!=null?sd.p50-fd.p50:null,effectSize};
  }
  return out;
}
function metricDist(rows,horizon,key){
  return dist(rows.map(({outcome})=>outcome?.horizons?.[horizon]?.status==='evaluated'?finite(outcome.horizons[horizon][key]):null).filter(v=>v!=null));
}
function buildStats({events=[],outcomes=[],manifest,split='train',sectorMinSamples=30}={}){
  if(split==='validation')assertValidationManifest(manifest);
  if(!['train','validation'].includes(split))throw new Error('split must be train or validation');
  const formal=(Array.isArray(events)?events:[]).filter(e=>e?.datasetSplit===split&&e?.hypothesisOnly!==true&&e?.source!=='hypothesis-only');
  const om=new Map((Array.isArray(outcomes)?outcomes:[]).map(o=>[o.eventId,o]));
  const rows=formal.map(event=>({event,outcome:om.get(event.eventId)||null}));
  const labels={};
  for(const label of ['Hit_6H_8pct','Hit_24H_12pct']){
    const vals=rows.map(r=>r.outcome?.labels?.[label]).filter(v=>typeof v==='boolean');
    const hitCount=vals.filter(Boolean).length;labels[label]={evaluatedCount:vals.length,hitCount,missCount:vals.length-hitCount,hitRate:vals.length?hitCount/vals.length:null};
  }
  const horizons={};for(const h of Object.keys(HORIZONS))horizons[h]={
    returnPct:metricDist(rows,h,'returnPct'),mfePct:metricDist(rows,h,'mfePct'),maePct:metricDist(rows,h,'maePct'),rr:metricDist(rows,h,'rr')
  };
  const success=rows.filter(r=>r.outcome?.labels?.Hit_6H_8pct===true).map(r=>r.event),failure=rows.filter(r=>r.outcome?.labels?.Hit_6H_8pct===false).map(r=>r.event);
  const unsafe=formal.filter(e=>e.survivorshipSafe!==true).length;
  const sectorCounts={};for(const e of formal){const s=e.explanatoryTags?.sector||'기타';sectorCounts[s]=(sectorCounts[s]||0)+1}
  const sectorReady=Object.values(sectorCounts).some(n=>n>=sectorMinSamples);
  return{
    split,manifestVersion:manifest?.manifestVersion||null,sampleCount:formal.length,evaluatedCount:rows.filter(r=>r.outcome).length,
    unbiasedSampleCount:formal.filter(e=>e.survivorshipSafe===true).length,
    survivorshipWarning:unsafe>0,validationIntegrity:split==='validation'&&unsafe>0?'biased-universe-present':'ok',
    labels,horizons,features:featureStats(formal),featureComparison:compareFeatureDistributions(success,failure),
    sectorAnalysis:{status:sectorReady?'사용 가능':'표본 부족',minimum:sectorMinSamples,counts:sectorCounts}
  };
}
module.exports={quantile,dist,compareFeatureDistributions,buildStats};

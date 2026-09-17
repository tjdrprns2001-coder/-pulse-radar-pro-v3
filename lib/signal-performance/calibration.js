'use strict';
const HORIZONS=['m15','h1','h4','h24'];
const BLOCKED=new Set(['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE']);
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function quantile(sorted,q){if(!sorted.length)return null;const pos=(sorted.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);if(lo===hi)return sorted[lo];return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo)}
function summarize(records,minSamples){
  const evaluated=records.filter(x=>x.outcome?.status==='evaluated'&&finite(x.outcome?.returnPct)!=null);
  const vals=evaluated.map(x=>finite(x.outcome.returnPct)).sort((a,b)=>a-b);const n=vals.length;
  const positive=n?vals.filter(v=>v>0).length/n:null;const mean=n?vals.reduce((a,b)=>a+b,0)/n:null;const median=n?quantile(vals,.5):null;
  const probs=evaluated.map(x=>finite(x.rawConfidence)).filter(v=>v!=null&&v>=0&&v<=100);
  let brierScore=null;if(probs.length===evaluated.length&&evaluated.length){brierScore=evaluated.reduce((sum,x)=>{const p=finite(x.rawConfidence)/100,y=finite(x.outcome.returnPct)>0?1:0;return sum+(p-y)*(p-y)},0)/evaluated.length}
  const buckets={};for(const x of evaluated){const c=finite(x.rawConfidence);if(c==null)continue;const b=Math.min(9,Math.max(0,Math.floor(c/10)));if(!buckets[b])buckets[b]={count:0,positive:0,confidenceSum:0};buckets[b].count++;buckets[b].positive+=finite(x.outcome.returnPct)>0?1:0;buckets[b].confidenceSum+=c}
  const reliability=Object.entries(buckets).map(([bucket,b])=>({bucket:Number(bucket),count:b.count,avgConfidence:b.confidenceSum/b.count,observedPositiveRate:b.positive/b.count}));
  return{sampleCount:n,liveCount:evaluated.filter(x=>x.source!=='backfill').length,backfillCount:evaluated.filter(x=>x.source==='backfill').length,positiveRatio:positive,meanReturnPct:mean,medianReturnPct:median,p25ReturnPct:n?quantile(vals,.25):null,p75ReturnPct:n?quantile(vals,.75):null,brierScore,reliability,status:n>=minSamples?'통계 사용 가능':'표본 부족'};
}
function buildCalibration(rows=[],{minSamples=30}={}){
  const grouped={};for(const row of Array.isArray(rows)?rows:[]){const key=String(row?.scanClassKey||'');if(!key)continue;if(!grouped[key])grouped[key]={};for(const h of HORIZONS){if(!grouped[key][h])grouped[key][h]=[];grouped[key][h].push({outcome:row?.horizons?.[h]||{status:'pending'},source:String(row?.source||'live'),rawConfidence:finite(row?.rawConfidence)})}}
  const classes={};for(const [key,byH] of Object.entries(grouped)){const horizons={};for(const h of HORIZONS)horizons[h]=summarize(byH[h]||[],minSamples);classes[key]={key,horizons}}
  return{minSamples,classes};
}
function calibrateConfidence({rawConfidence,scanClassKey,stats}={}){
  const raw=clamp(finite(rawConfidence)??0,0,100);const sampleCount=Number(stats?.sampleCount)||0;const hit=finite(stats?.positiveRatio);
  if(BLOCKED.has(String(scanClassKey||'')))return{rawConfidence:raw,calibratedConfidence:raw,status:'차단 분류',sampleCount,historicalHitRate:hit};
  if(sampleCount<30||hit==null)return{rawConfidence:raw,calibratedConfidence:raw,status:'표본 부족',sampleCount,historicalHitRate:hit};
  const adjustment=clamp((hit-.5)*20,-10,10);return{rawConfidence:raw,calibratedConfidence:Math.round(clamp(raw+adjustment,0,100)*10)/10,status:'통계 사용 가능',sampleCount,historicalHitRate:hit};
}
module.exports={HORIZONS,BLOCKED,quantile,buildCalibration,calibrateConfidence};

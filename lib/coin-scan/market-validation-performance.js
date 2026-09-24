'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
const HORIZONS=Object.freeze({h1:3600000,h4:14400000,h24:86400000});
function returnPct(a,b){const x=finite(a),y=finite(b);return x!=null&&x>0&&y!=null?((y/x)-1)*100:null}
function initial(snapshot){const horizons={};for(const [k,ms] of Object.entries(HORIZONS))horizons[k]={status:'pending',targetTs:Number(snapshot.canonical.decisionTimestamp)+ms};return{id:snapshot.snapshotId,symbol:snapshot.canonical.symbol,validationStatus:snapshot.result.validationStatus,entryPrice:finite(snapshot.canonical.signal?.lastPrice??snapshot.canonical.market?.medianPrice),decisionTimestamp:snapshot.canonical.decisionTimestamp,horizons,updatedAt:snapshot.createdAt}}
function statsState(n){return n>=50?'통계 사용 가능':n>=15?'참고용':'표본 부족'}
function summarize(rows,h){
 const vals=rows.map(x=>finite(x.outcome?.horizons?.[h]?.returnPct)).filter(v=>v!=null),positive=vals.filter(v=>v>0).length;
 return{evaluatedCount:vals.length,positiveRatio:vals.length?positive/vals.length:null,meanReturnPct:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,bestReturnPct:vals.length?Math.max(...vals):null,worstReturnPct:vals.length?Math.min(...vals):null,sampleState:statsState(vals.length)};
}
function buildStats(rows=[]){
 const statuses=['VALIDATED','CONFLICTED','STALE','INSUFFICIENT_DATA','INVALIDATED'],byStatus={};
 for(const st of statuses){const group=rows.filter(x=>x.snapshot?.result?.validationStatus===st);byStatus[st]={sampleCount:group.length,horizons:Object.fromEntries(Object.keys(HORIZONS).map(h=>[h,summarize(group,h)]))}}
 const overall={sampleCount:rows.length,horizons:Object.fromEntries(Object.keys(HORIZONS).map(h=>[h,summarize(rows,h)]))};
 const lift={};for(const h of Object.keys(HORIZONS)){const v=byStatus.VALIDATED.horizons[h],o=overall.horizons[h];lift[h]={meanReturnLiftPct:v.meanReturnPct!=null&&o.meanReturnPct!=null?v.meanReturnPct-o.meanReturnPct:null,positiveRatioLift:v.positiveRatio!=null&&o.positiveRatio!=null?v.positiveRatio-o.positiveRatio:null,sampleState:statsState(v.evaluatedCount)}}
 const rejected=rows.filter(x=>['CONFLICTED','INVALIDATED'].includes(x.snapshot?.result?.validationStatus)),falseRejection={};
 for(const h of Object.keys(HORIZONS)){const vals=rejected.map(x=>finite(x.outcome?.horizons?.[h]?.returnPct)).filter(v=>v!=null);falseRejection[h]={evaluatedCount:vals.length,gt5PctRatio:vals.length?vals.filter(v=>v>=5).length/vals.length:null,positiveRatio:vals.length?vals.filter(v=>v>0).length/vals.length:null,sampleState:statsState(vals.length)}}
 return{version:'MARKET_VALIDATION_STATS_v1',updatedAt:Date.now(),overall,byStatus,validationLift:lift,falseRejection};
}
function createMarketValidationPerformance({store,resolver,now=()=>Date.now(),maxEvaluationsPerRun=8}={}){
 if(!store||!resolver)throw new Error('validation performance store/resolver required');
 async function record(snapshot){if(!snapshot?.snapshotId)return false;if(typeof store.putMarketValidationOutcome!=='function')return false;const existing=await store.getMarketValidationOutcome?.(snapshot.snapshotId);if(existing)return false;await store.putMarketValidationOutcome(snapshot.snapshotId,initial(snapshot));return true}
 async function evaluateDue(){
  const out={attempted:0,evaluated:0,pending:0,unavailable:0,errors:[]},ts=now(),snaps=await store.listMarketValidationSnapshots(),outs=await store.listMarketValidationOutcomes(),map=new Map(outs.map(x=>[x.id,x]));
  outer:for(const s of snaps.sort((a,b)=>Number(a.canonical?.decisionTimestamp)-Number(b.canonical?.decisionTimestamp))){
   let o=map.get(s.snapshotId)||initial(s),changed=false;if(!map.has(s.snapshotId)){await store.putMarketValidationOutcome(s.snapshotId,o);map.set(s.snapshotId,o)}
   if(finite(o.entryPrice)==null||o.entryPrice<=0)continue;
   for(const h of Object.keys(HORIZONS)){const row=o.horizons[h];if(row.status==='evaluated'||row.status==='unavailable')continue;if(ts<row.targetTs){out.pending++;continue}if(out.attempted>=maxEvaluationsPerRun)break outer;out.attempted++;
    try{const r=await resolver.resolve(o.symbol,row.targetTs,ts);if(r.status==='evaluated'){o.horizons[h]={status:'evaluated',targetTs:row.targetTs,marketTs:r.marketTs,price:r.price,returnPct:returnPct(o.entryPrice,r.price)};out.evaluated++;changed=true}else if(r.status==='unavailable'){o.horizons[h]={status:'unavailable',targetTs:row.targetTs};out.unavailable++;changed=true}else out.pending++}catch(e){out.errors.push(s.snapshotId+':'+h+':'+String(e?.message||e))}
   }
   if(changed){o.updatedAt=ts;await store.putMarketValidationOutcome(s.snapshotId,o)}
  }
  const stats=await getStats({refresh:true});return{...out,statsUpdatedAt:stats.updatedAt};
 }
 async function getStats({refresh=false}={}){
  if(!refresh&&typeof store.getMarketValidationStats==='function'){const cached=await store.getMarketValidationStats('global');if(cached)return cached}
  const snaps=await store.listMarketValidationSnapshots(),outs=await store.listMarketValidationOutcomes(),map=new Map(outs.map(x=>[x.id,x])),rows=snaps.map(snapshot=>({snapshot,outcome:map.get(snapshot.snapshotId)||initial(snapshot)})),stats=buildStats(rows);stats.updatedAt=now();if(typeof store.putMarketValidationStats==='function')await store.putMarketValidationStats('global',stats);return stats;
 }
 return{record,evaluateDue,getStats};
}
module.exports={HORIZONS,returnPct,initial,buildStats,createMarketValidationPerformance};

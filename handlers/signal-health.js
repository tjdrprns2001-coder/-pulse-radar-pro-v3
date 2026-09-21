'use strict';
module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(String(req?.method||'GET').toUpperCase()!=='GET')return res.status(405).json({status:'error',error:'GET 요청만 지원합니다.'});
  const modules={};let overall='ok';const mark=(name,status,detail=null,extra={})=>{modules[name]={status,detail,...extra};if(status==='down')overall='down';else if(status==='degraded'&&overall==='ok')overall='degraded'};
  try{await ctx.provider?.getUniverse?.();mark('binance','ok')}catch(e){mark('binance','down',String(e?.message||e))}
  try{const snapshots=await ctx.store?.listSnapshots?.()||[],outcomes=await ctx.store?.listOutcomes?.()||[];mark('persistence','ok',null,{snapshots:snapshots.length,outcomes:outcomes.length})}catch(e){mark('persistence','down',String(e?.message||e))}
  try{const data=ctx.performance?.getPerformance?await ctx.performance.getPerformance({limit:1}):null;const classes=data?.classes||[];const usable=classes.some(c=>Object.values(c.horizons||{}).some(h=>h.sampleState==='통계 사용 가능'));mark('calibration',usable?'ok':'degraded',usable?null:'표본 부족',{classes:classes.length})}catch(e){mark('calibration','degraded',String(e?.message||e))}
  try{const evidence=await ctx.store?.listEvidence?.()||[];const now=Date.now(),fresh=evidence.filter(x=>Number.isFinite(Number(x.publishedAt))&&now-Number(x.publishedAt)<=21600000);mark('metaEvidence',fresh.length?'ok':'degraded',fresh.length?null:'최근 근거 없음',{fresh:fresh.length,total:evidence.length})}catch(e){mark('metaEvidence','degraded',String(e?.message||e))}
  try{const alerts=await ctx.store?.listAlerts?.()||[];mark('alerts','ok',null,{events:alerts.length})}catch(e){mark('alerts','degraded',String(e?.message||e))}
  return res.status(200).json({status:'ok',health:overall,generatedAt:Date.now(),modules});
};

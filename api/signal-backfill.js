'use strict';
function header(req,name){const h=req?.headers||{};return h[name]??h[name.toLowerCase()]??h[name.toUpperCase()]??null}
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const method=String(req?.method||'GET').toUpperCase();const q=req?.query||{};
  if(method==='GET'){
    if(!ctx.store?.getCheckpoint)return res.status(503).json({status:'error',error:'backfill store unavailable'});
    const job=String(q.job||'').trim();if(!job)return res.status(400).json({status:'error',error:'job parameter required'});
    try{return res.status(200).json({status:'ok',checkpoint:await ctx.store.getCheckpoint(job)})}catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
  }
  if(method!=='POST')return res.status(405).json({status:'error',error:'GET 또는 POST만 지원합니다.'});
  const configured=String(ctx.adminToken??process.env.SIGNAL_BACKFILL_ADMIN_TOKEN??'');if(!configured)return res.status(503).json({status:'error',error:'backfill admin token is not configured'});
  if(String(header(req,'x-signal-admin-token')||'')!==configured)return res.status(401).json({status:'error',error:'unauthorized'});
  if(!ctx.backfill?.run)return res.status(503).json({status:'error',error:'backfill service unavailable'});
  const b=req?.body&&typeof req.body==='object'?req.body:{};const symbols=(Array.isArray(b.symbols)?b.symbols:[]).map(x=>String(x||'').toUpperCase()).filter(Boolean).slice(0,5);const startTs=finite(b.startTs),endTs=finite(b.endTs),stepMs=finite(b.stepMs)??3600000;const jobId=String(b.jobId||'').trim();
  if(!jobId||!symbols.length||startTs==null||endTs==null||endTs<startTs)return res.status(400).json({status:'error',error:'invalid backfill request'});
  if(endTs-startTs>7*86400000)return res.status(400).json({status:'error',error:'backfill window exceeds 7 days'});
  if(stepMs<900000)return res.status(400).json({status:'error',error:'stepMs must be at least 15 minutes'});
  try{const result=await ctx.backfill.run({jobId,symbols,startTs,endTs,stepMs});return res.status(200).json({status:'ok',...result})}catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
};

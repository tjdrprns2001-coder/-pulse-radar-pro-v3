'use strict';
const Core=require('../lib/signal-performance/core.js');
module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(String(req?.method||'GET').toUpperCase()!=='GET')return res.status(405).json({status:'error',error:'GET 요청만 지원합니다.'});
  const q=req?.query||{},horizon=q.horizon?String(q.horizon):null;if(horizon&&Core.HORIZONS[horizon]==null)return res.status(400).json({status:'error',error:'지원하지 않는 기간입니다.'});
  if(!ctx.performance||typeof ctx.performance.getPerformance!=='function')return res.status(503).json({status:'error',error:'calibration service unavailable'});
  try{const data=await ctx.performance.getPerformance({classKey:q.class?String(q.class):null,horizon,symbol:q.symbol?String(q.symbol):null,source:q.source?String(q.source):null,limit:1});return res.status(200).json({status:'ok',generatedAt:data.generatedAt,calibration:data.calibration,filters:data.filters})}catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
};

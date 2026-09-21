'use strict';
module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(String(req?.method||'GET').toUpperCase()!=='GET')return res.status(405).json({status:'error',error:'GET 요청만 지원합니다.'});
  if(!ctx.alerts||typeof ctx.alerts.list!=='function')return res.status(503).json({status:'error',error:'alert service unavailable',items:[]});
  const q=req?.query||{},limit=Math.max(1,Math.min(200,Number(q.limit)||50));
  try{const items=await ctx.alerts.list({symbol:q.symbol?String(q.symbol):null,limit});return res.status(200).json({status:'ok',generatedAt:Date.now(),items})}catch(e){return res.status(503).json({status:'error',error:String(e?.message||e),items:[]})}
};

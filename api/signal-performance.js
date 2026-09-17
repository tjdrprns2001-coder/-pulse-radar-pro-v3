'use strict';
const Core=require('../lib/signal-performance/core.js');
const {createBlobStore}=require('../lib/signal-performance/store.js');
const {createBinanceResolver}=require('../lib/signal-performance/binance-resolver.js');
const {createSignalPerformanceService}=require('../lib/signal-performance/service.js');
let singleton=null;
function defaultService(){if(!singleton)singleton=createSignalPerformanceService({store:createBlobStore({}),resolver:createBinanceResolver({})});return singleton}
module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const method=String(req?.method||'GET').toUpperCase();if(method!=='GET')return res.status(405).json({status:'error',error:'GET 요청만 지원합니다.'});
  const q=req?.query||{},horizon=q.horizon?String(q.horizon):null;
  if(horizon&&Core.HORIZONS[horizon]==null)return res.status(400).json({status:'error',error:'지원하지 않는 기간입니다.'});
  const classKey=q.class?String(q.class):null,symbol=q.symbol?String(q.symbol).toUpperCase():null,limit=Math.max(1,Math.min(200,Number(q.limit)||50));
  const service=ctx.service||defaultService();
  try{const evaluation=await service.evaluateDue();const data=await service.getPerformance({classKey,horizon,symbol,limit});return res.status(200).json({status:'ok',evaluation,...data})}
  catch(e){return res.status(503).json({status:'error',generatedAt:Date.now(),error:String(e?.message||e),classes:[],recent:[]})}
};

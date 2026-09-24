'use strict';
const {createDanteBacktestRuntime}=require('../lib/dante/runtime.js');
module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    const q=req?.query||{},runtime=ctx.runtime||createDanteBacktestRuntime();
    const symbol=String(q.symbol||'BTCUSDT').toUpperCase();
    const startTs=q.start?Date.parse(String(q.start)):Date.parse('2021-01-01T00:00:00Z');
    const endTs=q.end?Date.parse(String(q.end)):Date.now();
    const frictionPct=Math.max(0,Math.min(5,Number(q.frictionPct??.2)));
    const sensitivity=String(q.sensitivity||'0')==='1';
    const data=await runtime.run({symbol,startTs,endTs,frictionPct,sensitivity});
    return res.status(200).json({status:'ok',data});
  }catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
};

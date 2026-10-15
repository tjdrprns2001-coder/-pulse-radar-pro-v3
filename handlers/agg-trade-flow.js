'use strict';
const {getFlow}=require('../lib/market-intel/aggressive-trade-flow.js');
module.exports=async function handler(req,res,{getFlowImpl=getFlow}={}){
 res.setHeader('Cache-Control','public, max-age=10');
 if(String(req.method||'GET').toUpperCase()!=='GET')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 const q=req.query||{};
 const market=String(q.market||'futures'),symbol=String(q.symbol||'BTCUSDT').toUpperCase();
 const result=await getFlowImpl({symbol,market,limit:500});
 return res.status(result.ok?200:400).json(result);
};

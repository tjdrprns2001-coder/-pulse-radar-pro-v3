'use strict';

const Oos=require('../lib/coin-scan/chartbro-oos-service.js');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(String(req?.method||'GET').toUpperCase()!=='GET')return res.status(405).json({status:'error',error:'GET only'});
  const q=req?.query||{},view=String(q.view||'stats').toLowerCase(),svc=Oos.defaultChartBroOosService(),limit=Math.max(1,Math.min(500,Number(q.limit)||100)),symbol=q.symbol?String(q.symbol):null;
  try{
    if(view==='stats')return res.status(200).json({status:'ok',...svc.stats()});
    if(view==='experiments')return res.status(200).json({status:'ok',version:Oos.VERSION,competition:svc.experiments()});
    if(['observations','transitions','failures','alerts'].includes(view))return res.status(200).json({status:'ok',version:Oos.VERSION,view,items:svc.list({kind:view,symbol,limit})});
    return res.status(400).json({status:'error',error:'unknown view',allowed:['stats','experiments','observations','transitions','failures','alerts']});
  }catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
};

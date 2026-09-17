'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const {createOpenAIGateway}=require('../lib/pulse-ai/openai-gateway.js');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
let singleton=null;
function defaultService(){if(!singleton){const scanService=createScanService({provider:createBinanceProvider({})});const gateway=createOpenAIGateway({});singleton=createBriefingService({scanService,gateway})}return singleton}
function bodyOf(req){if(!req)return{};if(req.body&&typeof req.body==='object')return req.body;if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{return{}}}return{}}
module.exports=async function handler(req,res,ctx={}){
  const service=ctx.service||defaultService();const q=req&&req.query||{};const mode=String(q.mode||'brief').toLowerCase();
  res.setHeader('Cache-Control',mode==='brief'?'s-maxage=20, stale-while-revalidate=40':'no-store');
  try{
    if(mode==='brief'){const force=String(q.force||'')==='1';return res.status(200).json(await service.getBrief({force}))}
    if(mode==='chat'){
      if(String(req?.method||'POST').toUpperCase()!=='POST')return res.status(405).json({status:'error',error:'POST required'});
      const b=bodyOf(req),question=String(b.question||'').trim();if(!question)return res.status(400).json({status:'error',error:'question required'});
      return res.status(200).json(await service.chat({question,selectedSymbol:b.selectedSymbol?String(b.selectedSymbol):null,deep:Boolean(b.deep)}));
    }
    return res.status(400).json({status:'error',error:'unsupported mode'});
  }catch(e){return res.status(Number(e?.status)||502).json({status:'error',error:String(e?.message||e).slice(0,300)})}
};

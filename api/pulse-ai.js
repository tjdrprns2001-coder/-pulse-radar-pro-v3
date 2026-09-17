'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const {createOpenAIGateway}=require('../lib/pulse-ai/openai-gateway.js');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
let singleton=null;
function defaultService(){
  if(!singleton){
    const scanService=createScanService({provider:createBinanceProvider({})});
    const gateway=createOpenAIGateway({});
    singleton=createBriefingService({scanService,gateway});
  }
  return singleton;
}
function bodyOf(req){if(!req)return{};if(req.body&&typeof req.body==='object')return req.body;if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{return{}}}return{}}
module.exports=async function handler(req,res,ctx={}){
  const service=ctx.service||defaultService();const q=req?.query||{};const mode=String(q.mode||'brief').toLowerCase();
  res.setHeader('Cache-Control',mode==='brief'?'s-maxage=15, stale-while-revalidate=45':'no-store');
  try{
    if(req?.method==='GET'&&mode==='brief')return res.status(200).json(await service.getBrief());
    if(req?.method==='POST'&&mode==='chat'){
      const b=bodyOf(req);const question=String(b.question||'').trim();if(!question)return res.status(400).json({status:'error',error:'question required'});
      return res.status(200).json(await service.chat({question,selectedSymbol:b.selectedSymbol||null,deep:Boolean(b.deep)}));
    }
    return res.status(405).json({status:'error',error:'method/mode not allowed'});
  }catch(e){return res.status(Number(e?.statusCode)||502).json({status:'error',error:String(e?.message||e),aiAvailable:false});}
};

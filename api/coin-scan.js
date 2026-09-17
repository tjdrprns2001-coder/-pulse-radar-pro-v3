'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
let singleton=null;
function defaultService(){if(!singleton)singleton=createScanService({provider:createBinanceProvider({})});return singleton}
module.exports=async function handler(req,res,ctx={}){
  const service=ctx.service||defaultService();
  const q=req&&req.query||{};
  const mode=String(q.mode||'summary');
  const category=q.category?String(q.category):null;
  const sector=q.sector?String(q.sector):null;
  const limit=Math.max(1,Math.min(500,Number(q.limit)||100));
  res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=45');
  try{return res.status(200).json(await service.run({mode,category,sector,limit}))}
  catch(e){return res.status(Number(e&&e.statusCode)||502).json({status:'error',updatedAt:Date.now(),error:String(e&&e.message||e),scanCount:0,deepScanCount:0,partial:true,dataHealth:{live:0,delayed:0,blocked:0,errors:1},categories:{},items:[]})}
};

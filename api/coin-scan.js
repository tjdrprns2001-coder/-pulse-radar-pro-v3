'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const {createBlobStore}=require('../lib/signal-performance/store.js');
const {createBinanceResolver}=require('../lib/signal-performance/binance-resolver.js');
const {createSignalPerformanceService}=require('../lib/signal-performance/service.js');
const {createAlertService}=require('../lib/signal-performance/alerts.js');
let singleton=null;
function defaultService(getStore){
  if(!singleton){
    let performanceRecorder=null,alertRecorder=null;
    if(typeof getStore==='function'){
      try{
        const store=createBlobStore({getStore});
        performanceRecorder=createSignalPerformanceService({store,resolver:createBinanceResolver({})});
        alertRecorder=createAlertService({store});
      }catch(_e){performanceRecorder=null;alertRecorder=null}
    }
    singleton=createScanService({provider:createBinanceProvider({}),performanceRecorder,alertRecorder});
  }
  return singleton;
}
module.exports=async function handler(req,res,ctx={}){
  const service=ctx.service||defaultService(ctx.getStore);
  const q=req&&req.query||{};
  const mode=String(q.mode||'summary');
  const category=q.category?String(q.category):null;
  const sector=q.sector?String(q.sector):null;
  const symbols=q.symbols?String(q.symbols).split(',').map(s=>s.trim()).filter(Boolean):[];
  const limit=Math.max(1,Math.min(500,Number(q.limit)||100));
  res.setHeader('Cache-Control',mode==='deep'?'s-maxage=30, stale-while-revalidate=90':'s-maxage=15, stale-while-revalidate=45');
  try{return res.status(200).json(await service.run({mode,category,sector,limit,symbols}))}
  catch(e){return res.status(Number(e&&e.statusCode)||502).json({status:'error',updatedAt:Date.now(),error:String(e&&e.message||e),scanCount:0,deepScanCount:0,partial:true,dataHealth:{live:0,delayed:0,blocked:0,errors:1},categories:{},candidateSymbols:[],items:[]})}
};

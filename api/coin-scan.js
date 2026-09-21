'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const {createBlobStore}=require('../lib/signal-performance/store.js');
const {createBinanceResolver}=require('../lib/signal-performance/binance-resolver.js');
const {createSignalPerformanceService}=require('../lib/signal-performance/service.js');
const {createAlertService}=require('../lib/signal-performance/alerts.js');
const {createTransitionSnapshotService}=require('../lib/coin-scan/transition-snapshot-service.js');
let singleton=null;
function defaultService(getStore){
  if(!singleton){
    let performanceRecorder=null,alertRecorder=null,transitionSnapshotRecorder=null;
    if(typeof getStore==='function'){
      try{
        const store=createBlobStore({getStore});
        performanceRecorder=createSignalPerformanceService({store,resolver:createBinanceResolver({})});
        alertRecorder=createAlertService({store});
        transitionSnapshotRecorder=createTransitionSnapshotService({store});
      }catch(_e){performanceRecorder=null;alertRecorder=null;transitionSnapshotRecorder=null}
    }
    singleton=createScanService({provider:createBinanceProvider({}),performanceRecorder,alertRecorder,transitionSnapshotRecorder});
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
  res.setHeader('Cache-Control',mode==='deep'?'s-maxage=30, stale-while-revalidate=90':mode==='event-snapshots'?'no-store, max-age=0':'s-maxage=15, stale-while-revalidate=45');
  try{
    if(mode==='event-snapshots'){
      const action=String(q.action||'list').toLowerCase();
      if(action==='get'||action==='export'){
        const eventId=String(q.eventId||'').trim();if(!eventId)return res.status(400).json({status:'error',error:'eventId required'});
        const bundle=await service.getTransitionSnapshot(eventId);if(!bundle)return res.status(404).json({status:'error',error:'transition snapshot not found',eventId});
        if(action==='export')res.setHeader('Content-Disposition','attachment; filename="'+eventId.replace(/[^A-Za-z0-9_.-]/g,'_')+'.json"');
        return res.status(200).json({status:'ok',bundle});
      }
      const rows=await service.listTransitionSnapshots({symbol:q.symbol||null,limit});
      return res.status(200).json({status:'ok',items:rows.map(x=>({eventId:x.eventId,symbol:x.symbol,detectedAt:x.detectedAt,detectedAtIso:x.detectedAtIso,eventMeta:x.eventMeta,snapshotIds:x.snapshotIds||[]}))});
    }
    return res.status(200).json(await service.run({mode,category,sector,limit,symbols}));
  }
  catch(e){return res.status(Number(e&&e.statusCode)||502).json({status:'error',updatedAt:Date.now(),error:String(e&&e.message||e),scanCount:0,deepScanCount:0,partial:true,dataHealth:{live:0,delayed:0,blocked:0,errors:1},categories:{},candidateSymbols:[],items:[]})}
};

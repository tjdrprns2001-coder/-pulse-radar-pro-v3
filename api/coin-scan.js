'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const {createBlobStore}=require('../lib/signal-performance/store.js');
const {createBinanceResolver}=require('../lib/signal-performance/binance-resolver.js');
const {createSignalPerformanceService}=require('../lib/signal-performance/service.js');
const {createAlertService}=require('../lib/signal-performance/alerts.js');
const {createTransitionSnapshotService}=require('../lib/coin-scan/transition-snapshot-service.js');
const {createRecommendationHistoryService}=require('../lib/coin-scan/recommendation-history.js');
const {createMarketValidationPerformance}=require('../lib/coin-scan/market-validation-performance.js');
const {createSelectorLedgerService}=require('../lib/coin-scan/selector-ledger-service.js');
let singleton=null;
function defaultService(getStore){
  if(!singleton){
    let performanceRecorder=null,alertRecorder=null,transitionSnapshotRecorder=null,recommendationHistory=null,marketValidationStore=null,marketValidationPerformance=null,selectorLedger=null;
    if(typeof getStore==='function'){
      try{
        const store=createBlobStore({getStore});marketValidationStore=store;
        const resolver=createBinanceResolver({});
        performanceRecorder=createSignalPerformanceService({store,resolver});
        alertRecorder=createAlertService({store});
        transitionSnapshotRecorder=createTransitionSnapshotService({store});
        recommendationHistory=createRecommendationHistoryService({store,resolver});
        marketValidationPerformance=createMarketValidationPerformance({store,resolver});
        selectorLedger=createSelectorLedgerService({store,resolver});
      }catch(_e){performanceRecorder=null;alertRecorder=null;transitionSnapshotRecorder=null;recommendationHistory=null;marketValidationStore=null;marketValidationPerformance=null;selectorLedger=null}
    }
    singleton=createScanService({provider:createBinanceProvider({}),performanceRecorder,alertRecorder,transitionSnapshotRecorder,recommendationHistory,marketValidationStore,marketValidationPerformance,selectorLedger});
  }
  return singleton;
}
module.exports=async function handler(req,res,ctx={}){
  const service=ctx.service||defaultService(ctx.getStore);
  const q=req&&req.query||{};
  const requestedMode=String(q.mode||'summary');
  const precision=['1','true','yes','precision','정밀'].includes(String(q.precision||'').toLowerCase())||requestedMode.toLowerCase()==='precision';
  const mode=requestedMode.toLowerCase()==='precision'?'deep':requestedMode;
  const category=q.category?String(q.category):null;
  const sector=q.sector?String(q.sector):null;
  const symbols=q.symbols?String(q.symbols).split(',').map(s=>s.trim()).filter(Boolean):[];
  const limit=Math.max(1,Math.min(500,Number(q.limit)||100));
  res.setHeader('Cache-Control',(mode==='deep'||mode==='validation')?'s-maxage=30, stale-while-revalidate=90':mode==='intelligence'?'s-maxage=45, stale-while-revalidate=120':(mode==='event-snapshots'||mode==='recommendation-history'||mode==='validation-snapshots'||mode==='selector-history')?'no-store, max-age=0':'s-maxage=15, stale-while-revalidate=45');
  try{
    if(String(req?.method||'GET').toUpperCase()==='POST'&&mode==='recommendation-history'&&String(q.action||'').toLowerCase()==='observe'){
      let body=req?.body||{};if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={}}}
      const symbol=String(body.symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      const state=String(body.state||'').toUpperCase();
      if(!symbol||!['WAIT','WATCH','READY','CONFIRMED','RECOMMEND','EXCLUDE'].includes(state))return res.status(400).json({status:'error',error:'invalid promotion payload'});
      const item=body.item&&typeof body.item==='object'?body.item:{};
      const row={
        symbol,state,label:String(body.label||state).slice(0,40),score:Number.isFinite(Number(body.score))?Math.max(0,Math.min(100,Number(body.score))):0,
        reasons:Array.isArray(body.reasons)?body.reasons.slice(0,8).map(x=>String(x).slice(0,120)):[],
        missing:Array.isArray(body.missing)?body.missing.slice(0,8).map(x=>String(x).slice(0,120)):[],
        invalidations:Array.isArray(body.invalidations)?body.invalidations.slice(0,8).map(x=>String(x).slice(0,120)):[],
        item:{
          lastPrice:Number.isFinite(Number(item.lastPrice))?Number(item.lastPrice):null,
          scanClass:{key:String(item.scanClass?.key||item.scanClass||'')},
          v2Type:String(item.v2Type||''),v3LongTier:String(item.v3LongTier||''),
          bookConfirmedRuleIds:Array.isArray(item.bookConfirmedRuleIds)?item.bookConfirmedRuleIds.slice(0,8).map(String):[]
        }
      };
      const recording=await service.recordRecommendationPromotion(row,{updatedAt:Date.now(),marketSource:String(body.marketSource||'book-ai-client'),derivativesSource:body.derivativesSource?String(body.derivativesSource):null});
      return res.status(200).json({status:'ok',mode:'recommendation-history',action:'observe',recording});
    }
    if(mode==='validation'){
      const symbol=String(q.symbol||'').trim();if(!symbol)return res.status(400).json({status:'error',error:'symbol required'});
      const at=Number(q.at)||null;return res.status(200).json(await service.getMarketValidation(symbol,{decisionTimestamp:at,persist:String(q.persist||'1')!=='0'}));
    }
    if(mode==='validation-performance'){
      const action=String(q.action||'stats').toLowerCase();
      if(action==='evaluate')return res.status(200).json({status:'ok',mode:'validation-performance',action:'evaluate',updatedAt:Date.now(),evaluation:await service.evaluateMarketValidationPerformance()});
      return res.status(200).json({status:'ok',mode:'validation-performance',action:'stats',updatedAt:Date.now(),stats:await service.getMarketValidationStats()});
    }
    if(mode==='validation-snapshots'){
      const action=String(q.action||'list').toLowerCase();
      if(action==='get'||action==='replay'){
        const id=String(q.id||'').trim();if(!id)return res.status(400).json({status:'error',error:'id required'});
        if(action==='replay'){const replay=await service.replayMarketValidation(id);if(!replay)return res.status(404).json({status:'error',error:'validation snapshot not found'});return res.status(200).json({status:'ok',mode:'validation-snapshots',action:'replay',replay})}
        const snapshot=await service.getMarketValidationSnapshot(id);if(!snapshot)return res.status(404).json({status:'error',error:'validation snapshot not found'});return res.status(200).json({status:'ok',mode:'validation-snapshots',action:'get',snapshot});
      }
      const rows=await service.listMarketValidationSnapshots({symbol:q.symbol||null,limit});return res.status(200).json({status:'ok',mode:'validation-snapshots',action:'list',items:rows.map(x=>({snapshotId:x.snapshotId,symbol:x.canonical?.symbol,decisionTimestamp:x.canonical?.decisionTimestamp,validationStatus:x.result?.validationStatus,canonicalHash:x.canonicalHash}))});
    }
    if(mode==='intelligence'){
      const symbol=String(q.symbol||'').trim();if(!symbol)return res.status(400).json({status:'error',error:'symbol required'});
      return res.status(200).json(await service.getMarketIntelligence(symbol));
    }
        if(mode==='selector-history'){
      const action=String(q.action||'list').toLowerCase();
      if(action==='replay'){
        const id=String(q.id||'').trim();if(!id)return res.status(400).json({status:'error',error:'id required'});
        const replay=await service.replaySelectorSnapshot(id);if(!replay)return res.status(404).json({status:'error',error:'selector snapshot not found'});
        return res.status(200).json({status:'ok',mode:'selector-history',action:'replay',replay});
      }
      if(action==='evidence'){
        const rows=await service.listSelectorEvidence({symbol:q.symbol||null,limit});
        return res.status(200).json({status:'ok',mode:'selector-history',action:'evidence',updatedAt:Date.now(),items:rows});
      }
      if(action==='transitions'){
        const rows=await service.listSelectorTransitions({symbol:q.symbol||null,limit});
        return res.status(200).json({status:'ok',mode:'selector-history',action:'transitions',updatedAt:Date.now(),items:rows});
      }
      if(action==='stats'){
        const lockedOosStart=Number(q.lockedOosStart)||null;
        return res.status(200).json({status:'ok',mode:'selector-history',action:'stats',updatedAt:Date.now(),stats:await service.getSelectorStats({lockedOosStart})});
      }
      if(action==='export'){
        const format=String(q.format||'json').toLowerCase();
        if(format==='csv'){
          const csv=await service.exportSelectorCsv({symbol:q.symbol||null,classification:q.classification||null,limit});
          res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="selector-r0.1.csv"');return res.status(200).send(csv);
        }
        const rows=await service.listSelectorHistory({symbol:q.symbol||null,classification:q.classification||null,limit});
        res.setHeader('Content-Disposition','attachment; filename="selector-r0.1.json"');return res.status(200).json({status:'ok',specVersion:'selector-r0.1',items:rows});
      }
      const rows=await service.listSelectorHistory({symbol:q.symbol||null,classification:q.classification||null,limit});
      return res.status(200).json({status:'ok',mode:'selector-history',action:'list',updatedAt:Date.now(),items:rows});
    }
if(mode==='recommendation-history'){
      const action=String(q.action||'list').toLowerCase();
      if(action==='stats'){
        const stats=await service.getRecommendationStats({state:q.state||'RECOMMEND'});
        return res.status(200).json({status:'ok',mode:'recommendation-history',action:'stats',updatedAt:Date.now(),stats});
      }
      if(action==='evaluate'){
        const evaluation=await service.evaluateRecommendationHistory();
        return res.status(200).json({status:'ok',mode:'recommendation-history',action:'evaluate',updatedAt:Date.now(),evaluation});
      }
      const rows=await service.listRecommendationHistory({symbol:q.symbol||null,state:q.state||null,limit});
      return res.status(200).json({status:'ok',mode:'recommendation-history',action:'list',updatedAt:Date.now(),items:rows});
    }
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
    return res.status(200).json(await service.run({mode,category,sector,limit,symbols,precision}));
  }
  catch(e){return res.status(Number(e&&e.statusCode)||502).json({status:'error',updatedAt:Date.now(),error:String(e&&e.message||e),scanCount:0,deepScanCount:0,partial:true,dataHealth:{live:0,delayed:0,blocked:0,errors:1},categories:{},candidateSymbols:[],items:[]})}
};

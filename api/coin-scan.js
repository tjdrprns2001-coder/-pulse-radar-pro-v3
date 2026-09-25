'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const {createBlobStore,createMemoryStore}=require('../lib/signal-performance/store.js');
const {createScanRunService}=require('../lib/coin-scan/scan-run-service.js');
const {createBinanceResolver}=require('../lib/signal-performance/binance-resolver.js');
const {createSignalPerformanceService}=require('../lib/signal-performance/service.js');
const {createAlertService}=require('../lib/signal-performance/alerts.js');
const {createTransitionSnapshotService}=require('../lib/coin-scan/transition-snapshot-service.js');
const {createSetupStateTracker}=require('../lib/coin-scan/setup-state-tracker.js');
const {createRecommendationHistoryService}=require('../lib/coin-scan/recommendation-history.js');
const {createPreIgnitionOosService}=require('../lib/coin-scan/preignition-oos.js');
const {createPreIgnitionResolver}=require('../lib/coin-scan/preignition-resolver.js');
const {createMarketValidationPerformance}=require('../lib/coin-scan/market-validation-performance.js');
const {createSelectorLedgerService}=require('../lib/coin-scan/selector-ledger-service.js');
let singleton=null;
function defaultService(getStore){
  if(!singleton){
    let performanceRecorder=null,alertRecorder=null,transitionSnapshotRecorder=null,setupStateTracker=null,recommendationHistory=null,preIgnitionHistory=null,marketValidationStore=null,marketValidationPerformance=null,selectorLedger=null,scanRunStore=createMemoryStore();
    if(typeof getStore==='function'){
      try{
        const store=createBlobStore({getStore});marketValidationStore=store;scanRunStore=store;
        const resolver=createBinanceResolver({});
        performanceRecorder=createSignalPerformanceService({store,resolver});
        alertRecorder=createAlertService({store});
        transitionSnapshotRecorder=createTransitionSnapshotService({store});
        setupStateTracker=createSetupStateTracker({store});
        recommendationHistory=createRecommendationHistoryService({store,resolver});
        preIgnitionHistory=createPreIgnitionOosService({store,resolver:createPreIgnitionResolver({})});
        marketValidationPerformance=createMarketValidationPerformance({store,resolver});
        selectorLedger=createSelectorLedgerService({store,resolver});
      }catch(_e){performanceRecorder=null;alertRecorder=null;transitionSnapshotRecorder=null;setupStateTracker=null;recommendationHistory=null;preIgnitionHistory=null;marketValidationStore=null;marketValidationPerformance=null;selectorLedger=null}
    }
    if(!setupStateTracker)setupStateTracker=createSetupStateTracker({});
    singleton=createScanService({provider:createBinanceProvider({}),performanceRecorder,alertRecorder,transitionSnapshotRecorder,setupStateTracker,recommendationHistory,preIgnitionHistory,marketValidationStore,marketValidationPerformance,selectorLedger});
    singleton.scanRun=createScanRunService({scanService:singleton,store:scanRunStore});
  }
  return singleton;
}
async function fetchSelectorOverlay(limit=100){
  const base=String(process.env.SELECTOR_RUNTIME_URL||'https://pulseradar-selector-runtime.onrender.com').replace(/\/$/,'');
  if(!base)return null;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),3500);
  try{
    const r=await fetch(base+'/selector-latest?limit='+Math.max(1,Math.min(200,Number(limit)||100)),{signal:ctrl.signal,headers:{accept:'application/json'}});
    if(!r.ok)return null;
    const body=await r.json().catch(()=>null);
    if(!body||body.status!=='ok')return null;
    return body;
  }catch(_e){return null}finally{clearTimeout(timer)}
}
module.exports=async function handler(req,res,ctx={}){
  if(['trader-summary','trader-light','trader-deep'].includes(String(req?.query?.mode||''))){
    res.setHeader('Cache-Control','no-store, max-age=0');
    try{
      const trader=ctx.traderService||require('../lib/coin-scan/trader-service.js').defaultTraderService();
      const q=req.query;
      const data=q.mode==='trader-summary'?await trader.summary():q.mode==='trader-light'?await trader.light(String(q.symbols||'').split(',').filter(Boolean)):await trader.deep(q.symbol);
      return res.status(200).json(data);
    }catch(e){return res.status(e.statusCode===400?400:503).json({status:'error',error:String(e.message||e),source:'Binance futures',items:[]})}
  }
  const service=ctx.service||defaultService(ctx.getStore);
  const q=req&&req.query||{};
  const requestedMode=String(q.mode||'summary');
  const precision=['1','true','yes','precision','정밀'].includes(String(q.precision||'').toLowerCase())||requestedMode.toLowerCase()==='precision';
  const mode=requestedMode.toLowerCase()==='precision'?'deep':requestedMode;
  const category=q.category?String(q.category):null;
  const sector=q.sector?String(q.sector):null;
  const symbols=q.symbols?String(q.symbols).split(',').map(s=>s.trim()).filter(Boolean):[];
  const limit=Math.max(1,Math.min(500,Number(q.limit)||100));
  const fresh=['1','true','yes'].includes(String(q.fresh||'').toLowerCase());
  const persistObservations=String(q.persist||'1')!=='0';
  res.setHeader('Cache-Control',fresh?'no-store, max-age=0':(mode==='deep'||mode==='validation'||mode==='prescan')?'s-maxage=30, stale-while-revalidate=90':mode==='intelligence'?'s-maxage=45, stale-while-revalidate=120':(mode==='scan-run'||mode==='event-snapshots'||mode==='recommendation-history'||mode==='preignition-history'||mode==='validation-snapshots'||mode==='selector-history')?'no-store, max-age=0':'s-maxage=15, stale-while-revalidate=45');
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
    if(mode==='scan-run'){
      const action=String(q.action||'status').toLowerCase();
      if(!service.scanRun)return res.status(503).json({status:'error',error:'scan run service unavailable'});
      if(action==='start'){const run=await service.scanRun.start({precision});return res.status(202).json({status:'ok',mode:'scan-run',action:'start',run})}
      const id=String(q.id||q.run||'').trim();if(!id)return res.status(400).json({status:'error',error:'scan run id required'});
      if(action==='execute'){const run=await service.scanRun.execute(id);return res.status(200).json({status:'ok',mode:'scan-run',action:'execute',run})}
      const run=await service.scanRun.get(id);if(!run)return res.status(404).json({status:'error',error:'scan run not found'});
      return res.status(200).json({status:'ok',mode:'scan-run',action:'status',run});
    }
    if(mode==='runtime-health'){
      const base=String(process.env.SELECTOR_RUNTIME_URL||'https://pulseradar-selector-runtime.onrender.com').replace(/\/$/,'');
      if(!base)return res.status(200).json({status:'ok',mode:'runtime-health',configured:false,runtime:null});
      const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),3000);
      try{
        const r=await fetch(base+'/health',{signal:ctrl.signal,headers:{accept:'application/json'}});
        const body=await r.json().catch(()=>({}));return res.status(r.ok?200:503).json({status:r.ok?'ok':'degraded',mode:'runtime-health',configured:true,runtime:body});
      }catch(e){return res.status(503).json({status:'degraded',mode:'runtime-health',configured:true,error:String(e?.message||e),runtime:null})}
      finally{clearTimeout(timer)}
    }
    if(mode==='preignition-history'){
      const action=String(q.action||'stats').toLowerCase();
      if(action==='evaluate')return res.status(200).json({status:'ok',mode:'preignition-history',action:'evaluate',updatedAt:Date.now(),evaluation:await service.evaluatePreIgnitionHistory()});
      if(action==='list'){
        const since=Number(q.since)||null,rows=await service.listPreIgnitionHistory({symbol:q.symbol||null,bucket:q.bucket||null,limit,since,includeOutcomes:String(q.includeOutcomes||'1')!=='0'});
        return res.status(200).json({status:'ok',mode:'preignition-history',action:'list',updatedAt:Date.now(),items:rows});
      }
      const since=Number(q.since)||null;
      return res.status(200).json({status:'ok',mode:'preignition-history',action:'stats',updatedAt:Date.now(),stats:await service.getPreIgnitionStats({since})});
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
      // selector-history-proxy: Render Postgres is the canonical ledger when available.
      const runtimeBase=String(process.env.SELECTOR_RUNTIME_URL||'https://pulseradar-selector-runtime.onrender.com').replace(/\/$/,'');
      if(!ctx.service&&runtimeBase){
        const params=new URLSearchParams();
        for(const [k,v] of Object.entries(q||{}))if(v!=null&&k!=='mode')params.set(k,String(v));
        const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
        try{
          const rr=await fetch(runtimeBase+'/selector-history?'+params.toString(),{signal:ctrl.signal,headers:{accept:'application/json'}});
          if(rr.ok){const body=await rr.json();return res.status(200).json(body)}
        }catch(_e){}finally{clearTimeout(timer)}
      }

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
      if(action==='ablation'){
        const report=await service.getSelectorAblation({
          horizon:String(q.horizon||'h24'),
          feeBps:Number(q.feeBps)||0,
          slippageBps:Number(q.slippageBps)||0,
          fundingBps:Number(q.fundingBps)||0
        });
        return res.status(200).json({status:'ok',mode:'selector-history',action:'ablation',updatedAt:Date.now(),report});
      }
      if(action==='stats'){
        const lockedOosStart=Number(q.lockedOosStart)||null;
        return res.status(200).json({status:'ok',mode:'selector-history',action:'stats',updatedAt:Date.now(),stats:await service.getSelectorStats({lockedOosStart})});
      }
      if(action==='export'){
        const format=String(q.format||'json').toLowerCase();
        if(format==='csv'){
          const csv=await service.exportSelectorCsv({symbol:q.symbol||null,classification:q.classification||null,limit});
          res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="selector-r0.3.csv"');return res.status(200).send(csv);
        }
        const rows=await service.listSelectorHistory({symbol:q.symbol||null,classification:q.classification||null,limit});
        res.setHeader('Content-Disposition','attachment; filename="selector-r0.3.json"');return res.status(200).json({status:'ok',specVersion:'selector-r0.3',items:rows});
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
    if(mode==='setup-history'){
      const action=String(q.action||'evidence').toLowerCase();
      if(action==='state'){
        const symbol=String(q.symbol||'').trim();if(!symbol)return res.status(400).json({status:'error',error:'symbol required'});
        return res.status(200).json({status:'ok',mode:'setup-history',action:'state',updatedAt:Date.now(),states:await service.getSetupStates(symbol)});
      }
      const rows=await service.listSetupEvidence({symbol:q.symbol||null,setupType:q.setupType||null,limit});
      return res.status(200).json({status:'ok',mode:'setup-history',action:'evidence',updatedAt:Date.now(),items:rows});
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
    if(mode==='selector-compact'){
      const deepLimit=Math.max(5,Math.min(120,Number(q.deepLimit)||60));
      const result=await service.run({mode:'deep',category,sector,limit:deepLimit,symbols,precision:true});
      const screening=result.autoScreening||{};
      const rows=Array.isArray(screening.all)?screening.all:[];
      return res.status(200).json({
        status:'ok',
        mode:'selector-compact',
        updatedAt:result.updatedAt||Date.now(),
        universe:result.universe||null,
        universeMeta:result.universeMeta||null,
        marketCoverage:result.marketCoverage||null,
        deepScanCount:result.deepScanCount||0,
        dataHealth:result.dataHealth||null,
        marketSource:result.marketSource||null,
        derivativesSource:result.derivativesSource||null,
        autoScreeningMeta:result.autoScreeningMeta||null,
        autoScreening:{all:rows},
        candidateSymbols:result.candidateSymbols||[]
      });
    }
    const result=await service.run({mode,category,sector,limit,symbols,precision,persistObservations});
    if(q.run)result.scanRunId=String(q.run).slice(0,80);
    const localFutures=Number(result?.universeMeta?.futuresCount||result?.marketCoverage?.futures||0);
    const needsOverlay=!ctx.service&&localFutures===0&&['summary','deep','precision'].includes(String(mode).toLowerCase());
    if(needsOverlay){
      const overlay=await fetchSelectorOverlay(Math.max(40,Math.min(100,limit)));
      if(overlay){
        result.selectorOverlay={
          source:'render-postgres',
          updatedAt:overlay.updatedAt||Date.now(),
          wholeMarket:overlay.wholeMarket||null,
          screening:overlay.screening||null,
          items:Array.isArray(overlay.items)?overlay.items:[]
        };
        result.sourceWarning=[result.sourceWarning,'Render Selector overlay attached for futures/derivatives context.'].filter(Boolean).join(' ');
      }
    }
    return res.status(200).json(result);
  }
  catch(e){return res.status(Number(e&&e.statusCode)||502).json({status:'error',updatedAt:Date.now(),error:String(e&&e.message||e),scanCount:0,deepScanCount:0,partial:true,dataHealth:{live:0,delayed:0,blocked:0,errors:1},categories:{},candidateSymbols:[],items:[]})}
};

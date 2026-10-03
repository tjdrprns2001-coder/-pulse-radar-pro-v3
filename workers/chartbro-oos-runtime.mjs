import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createAstraAutoScanner}=require('../lib/coin-scan/astra-auto-scanner.js');
const ChartBroOos=require('../lib/coin-scan/chartbro-oos-service.js');
const {createRenderKvStateStore}=require('../lib/coin-scan/render-kv-state-store.js');
const {createKvFullScanStore}=require('../lib/coin-scan/kv-full-scan-store.js');
const {createFullUniverseScanService,AUTO_INTERVAL_MS}=require('../lib/coin-scan/full-universe-auto-scan.js');
const {createMarketCapProvider}=require('../lib/coin-scan/market-cap-provider.js');

const chartbroHttp=require('../lib/chartbro/http.js');
const env=process.env;
const PORT=Number(env.PORT||10000);
const kv=createRenderKvStateStore({url:env.CHARTBRO_KV_URL,prefix:env.CHARTBRO_KV_PREFIX||'pulseradar:chartbro-oos'});
const oos=ChartBroOos.defaultChartBroOosService({store:kv});
const provider=createBinanceProvider({
  concurrency:Number(env.ASTRA_FUTURES_CONCURRENCY||2),
  intervalConcurrency:1,
  futuresMinIntervalMs:Number(env.ASTRA_FUTURES_MIN_INTERVAL_MS||325),
  disableSpotRest:false,
  disableFuturesFallback:false
});
const scanner=createAstraAutoScanner({provider});
const fullScanKv=createKvFullScanStore({url:env.CHARTBRO_KV_URL,prefix:env.FULL_SCAN_KV_PREFIX||'pulseradar:full-scan-v2'});
const fullScanProvider=createBinanceProvider({
  concurrency:Number(env.FULL_SCAN_PROVIDER_CONCURRENCY||6),
  intervalConcurrency:Number(env.FULL_SCAN_INTERVAL_CONCURRENCY||2),
  futuresMinIntervalMs:Number(env.FULL_SCAN_FUTURES_MIN_INTERVAL_MS||150),
  disableSpotRest:false,
  disableFuturesFallback:false
});
const fullScanMarketCaps=createMarketCapProvider({ttlMs:Number(env.FULL_SCAN_MARKET_CAP_TTL_MS||1800000)});
const fullScan=createFullUniverseScanService({
  provider:fullScanProvider,
  marketCapProvider:fullScanMarketCaps,
  store:fullScanKv,
  maxWorkers:Number(env.FULL_SCAN_WORKERS||6),
  requestsPerMinute:Number(env.FULL_SCAN_REQUESTS_PER_MINUTE||120),
  klineRows:Number(env.FULL_SCAN_KLINE_ROWS||64)
});
const health={startedAt:Date.now(),status:'INIT',run:null,kv:{status:'INIT'},fullScan:{status:'INIT'},errors:[]};
let active=false,fullScanActive=false,universeCursor=0;

function send(res,status,body){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0','access-control-allow-origin':'*'});
  res.end(JSON.stringify(body));
}
function batch(a,n){const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out}
function research(view='stats',symbol=null,limit=100){
  if(view==='stats')return{status:'ok',canonical:true,source:'render-kv-oos-runtime',...oos.stats()};
  if(view==='experiments')return{status:'ok',canonical:true,source:'render-kv-oos-runtime',version:ChartBroOos.VERSION,competition:oos.experiments()};
  if(['observations','transitions','failures','alerts'].includes(view))return{status:'ok',canonical:true,source:'render-kv-oos-runtime',version:ChartBroOos.VERSION,view,items:oos.list({kind:view,symbol,limit})};
  return null;
}
async function run(){
  if(active||String(env.CHARTBRO_TRACKER_ENABLED||'1')==='0')return;
  active=true;const started=Date.now();health.status='RUNNING';health.run={startedAt:started};
  try{
    const minQuoteVolume=Math.max(0,Number(env.CHARTBRO_MIN_QUOTE_VOLUME||0));
    const oiLimit=Math.max(4,Math.min(96,Number(env.CHARTBRO_OI_LIMIT||48)));
    const deepLimit=Math.max(1,Math.min(24,Number(env.CHARTBRO_DEEP_LIMIT||16)));
    const outcomeLimit=Math.max(4,Math.min(64,Number(env.CHARTBRO_OUTCOME_LIMIT||24)));
    const u=await scanner.universe({method:'astra',minQuoteVolume}),universe=(u.items||[]),symbols=[];
    if(universe.length){for(let i=0;i<Math.min(oiLimit,universe.length);i++)symbols.push(universe[(universeCursor+i)%universe.length].symbol);universeCursor=(universeCursor+symbols.length)%universe.length}
    const oiItems=[];
    for(const xs of batch(symbols,24)){
      const o=await scanner.oi(xs,{method:'astra',asOf:u.asOf,market:u.marketState||u.breadth||{}});
      oiItems.push(...(o.items||[]));
    }
    const ranked=oiItems.slice().sort((a,b)=>(Number(b.oi4hPct)||-999)-(Number(a.oi4hPct)||-999));
    const freshPass=ranked.filter(x=>x.pass).slice(0,deepLimit).map(x=>x.symbol);
    const productionCarry=oos.activeSymbols({cohort:'ASTRA_PASS',limit:Math.max(4,deepLimit)});
    const production=[...new Set([...productionCarry,...freshPass])].slice(0,Math.max(deepLimit,24)),used=new Set(production);
    const shadowBaseLimit=Math.max(1,Math.min(8,Number(env.CHARTBRO_SHADOW_DEEP_LIMIT||4)));
    const shadowBudget=production.length?shadowBaseLimit:deepLimit;
    const shadowCarry=oos.activeSymbols({cohort:'SHADOW_EXPANSION',limit:shadowBudget}),shadow=[];
    for(const s of shadowCarry){if(!used.has(s)&&shadow.length<shadowBudget){used.add(s);shadow.push(s)}}
    for(const x of ranked){if(shadow.length>=shadowBudget)break;if(!used.has(x.symbol)&&!x.pass){used.add(x.symbol);shadow.push(x.symbol)}}
    for(const s of symbols){if(shadow.length>=shadowBudget)break;if(!used.has(s)){used.add(s);shadow.push(s)}}
    let deepScanned=0,productionDeepScanned=0,shadowDeepScanned=0;
    const productionMarket={...(u.marketState||u.breadth||{}),chartbroCohort:'ASTRA_PASS'};
    const shadowMarket={...(u.marketState||u.breadth||{}),chartbroCohort:'SHADOW_EXPANSION'};
    for(const xs of batch(production,4)){await scanner.deep(xs,{method:'astra',asOf:u.asOf,market:productionMarket});deepScanned+=xs.length;productionDeepScanned+=xs.length}
    for(const xs of batch(shadow,4)){await scanner.deep(xs,{method:'astra',asOf:u.asOf,market:shadowMarket});deepScanned+=xs.length;shadowDeepScanned+=xs.length}
    const pending=oos.pendingSymbols({asOf:Date.now(),limit:outcomeLimit});let outcomeSymbolsChecked=0,outcomesEvaluated24h=0;
    for(const p of pending){
      try{
        const rows=await provider.getFuturesKlines(p.symbol,'5m',400),ev=oos.evaluateSymbol({symbol:p.symbol,frames:{'5m':rows},asOf:Date.now()});
        outcomeSymbolsChecked++;outcomesEvaluated24h+=Number(ev.evaluated24h)||0;
      }catch(e){health.errors.push({source:'outcome-resolver',symbol:p.symbol,at:Date.now(),error:String(e?.message||e)})}
    }
    const persisted=await oos.flush(),stats=oos.stats();
    health.status='OK';health.updatedAt=Date.now();
    health.run={startedAt:started,finishedAt:Date.now(),durationMs:Date.now()-started,universeCount:u.universeCount||0,filteredCount:u.filteredCount||0,universeCursor,oiChecked:symbols.length,oiPassed:freshPass.length,productionDeepScanned,shadowDeepScanned,deepScanned,outcomeSymbolsChecked,outcomesEvaluated24h,persisted,observations:stats.observations,productionObservations:stats.productionObservations||0,shadowObservations:stats.shadowObservations||0,evaluated24h:stats.evaluated24h,alerts:stats.alertCount,productionGate:stats.productionGate?.passed||false};
    health.errors=health.errors.slice(-20);
  }catch(e){
    health.status='DEGRADED';health.updatedAt=Date.now();health.run={...health.run,finishedAt:Date.now(),error:String(e?.message||e)};
    health.errors.push({source:'tracker',at:Date.now(),error:String(e?.message||e)});health.errors=health.errors.slice(-20);
  }finally{active=false}
}

function compactFullScanItem(x){
  if(!x)return x;const frames=x.frames||{},m=x.mtfAnalysis||{},mf=m.multiTimeframe||{},pf=m.preIgnition||{},ef=m.entryMap||{};
  const pick=tf=>{const f=frames[tf]||{};return{available:Boolean(f.available),barChangePct:f.barChangePct??null,rvol20:f.rvol20??null,close:f.close??null}};
  const mfFrames=Object.fromEntries(['1w','1d','4h','1h','15m','5m'].map(tf=>{const q=m.frames?.[tf]||{};return[tf,{available:Boolean(q.available),structure:q.structure||null,emaTrend:q.emaTrend||null,compressionState:q.compressionState||null,compressionPct:q.compressionPct??null,rsi:q.rsi??null,macdImproving:q.macdImproving??null,volumeEchoActive:Boolean(q.volumeEcho?.active)}]}));
  return{symbol:x.symbol,baseAsset:x.baseAsset,tier:x.tier,marketCapUsd:x.marketCapUsd??null,fundingPct:x.fundingPct??null,priceChange24h:x.priceChange24h??null,spotPriceChange24h:x.spotPriceChange24h??null,oi:x.oi||{},complete:Boolean(x.complete),errors:Array.isArray(x.errors)?x.errors:[],updatedAt:x.updatedAt||null,
    preIgnitionScore:x.preIgnitionScore??pf.score??null,preIgnitionStage:x.preIgnitionStage??pf.stage??null,mtf:{regime:mf.regime||null,execution:mf.execution?{longState:mf.execution.longState,shortState:mf.execution.shortState,longScore:mf.execution.longScore,shortScore:mf.execution.shortScore}:null,frames:mfFrames,risks:pf.risks||[],evidence:pf.evidence||[]},
    entryMap:{status:ef.status||null,label:ef.label||null,entryVisible:Boolean(ef.entryVisible),plannedEntry:ef.plannedEntry??null,entry:ef.entry??null,stop:ef.stop??null,target:ef.target||null,riskReward:ef.riskReward??null,steps:ef.steps||{}},
    frames:{'5m':pick('5m'),'15m':pick('15m'),'1h':pick('1h'),'4h':pick('4h'),'1d':pick('1d'),'1w':pick('1w')}};
}
async function runFullScan(){
  if(fullScanActive||String(env.FULL_SCAN_ENABLED||'1')==='0')return;
  fullScanActive=true;const started=Date.now();health.fullScan={...health.fullScan,status:'PREPARING',startedAt:started,updatedAt:started,source:'render-kv-full-scan'};
  try{
    const prepared=await fullScan.prepare({kind:'auto',owner:'chartbro-kv-runtime'}),run=prepared.run;
    health.fullScan={...health.fullScan,status:run?.status||'QUEUED',runId:run?.id||null,startedAt:run?.startedAt||started,updatedAt:Date.now(),cacheHit:Boolean(prepared.cacheHit),skipped:Boolean(prepared.skipped),source:'render-kv-full-scan'};
    if(prepared.skipped){
      health.fullScan={...health.fullScan,status:run?.status||'SKIPPED',universeCount:run?.universeCount||0,selectedCount:run?.selectedCount||0,completedCount:run?.completedCount||0,errorCount:run?.errorCount||0,completedAt:run?.completedAt||null,updatedAt:Date.now()};
      if(String(run?.status||'')==='RUNNING')setTimeout(runFullScan,Math.max(95000,Number(env.FULL_SCAN_RECOVERY_RETRY_MS||120000))).unref?.();
      return;
    }
    const out=await fullScan.executeRun(run,{tiers:prepared.tiers});
    health.fullScan={status:out.status||'DONE',runId:out.id||run?.id||null,startedAt:out.startedAt||started,updatedAt:Date.now(),completedAt:out.completedAt||null,universeCount:out.universeCount||0,selectedCount:out.selectedCount||0,completedCount:out.completedCount||0,errorCount:out.errorCount||0,cacheHit:Boolean(out.cacheHit),skipped:false,recovered:Boolean(prepared.recovered),source:'render-kv-full-scan'};
  }catch(e){
    health.fullScan={...health.fullScan,status:'DEGRADED',updatedAt:Date.now(),error:String(e?.message||e)};
    health.errors.push({source:'full-scan',at:Date.now(),error:String(e?.message||e)});health.errors=health.errors.slice(-20);
  }finally{fullScanActive=false}
}
function scheduleFullScan(){
  if(String(env.FULL_SCAN_ENABLED||'1')==='0'){health.fullScan={status:'DISABLED'};return}
  const delay=Math.max(5000,Number(env.FULL_SCAN_START_DELAY_MS||45000)),interval=Math.max(300000,Number(env.FULL_SCAN_INTERVAL_MS||AUTO_INTERVAL_MS));
  setTimeout(runFullScan,delay).unref?.();setInterval(runFullScan,interval).unref?.();
}
function nextAutoBucketAt(){return(Math.floor(Date.now()/AUTO_INTERVAL_MS)+1)*AUTO_INTERVAL_MS}

function schedule(){
  scheduleFullScan();
  if(String(env.CHARTBRO_TRACKER_ENABLED||'1')==='0'){health.status=health.kv.status==='OK'?'READY':'DEGRADED';return}
  const interval=Math.max(300000,Number(env.CHARTBRO_INTERVAL_MS||900000)),delay=Math.max(1000,Number(env.CHARTBRO_START_DELAY_MS||5000));
  setTimeout(run,delay).unref?.();setInterval(run,interval).unref?.();
}
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://chartbro.local');
    if(env.CHARTBRO_ANALYZER_ENABLED==='1'&&await chartbroHttp.route(req,res,u))return;
    if(req.method==='GET'&&u.pathname==='/health')return send(res,200,{service:'pulseradar-chartbro-oos-runtime',status:health.status,uptimeMs:Date.now()-health.startedAt,health});
    if(req.method==='GET'&&u.pathname==='/api/v1/health')return send(res,200,{status:'ok',service:'pulseradar-chartbro-oos-runtime',version:ChartBroOos.VERSION,fullScan:{...health.fullScan,manualEnabled:false},nextAutoBucketAt:nextAutoBucketAt(),marketCaps:{source:'CoinGecko',count:health.fullScan?.universeCount||0},websocket:{shardCount:0,symbolCount:health.fullScan?.universeCount||0,latestCount:0}});
    if(req.method==='GET'&&u.pathname==='/api/v1/results'){
      const limit=Math.max(1,Math.min(2000,Number(u.searchParams.get('limit'))||500)),compact=u.searchParams.get('compact')!=='0',tiers=String(u.searchParams.get('tiers')||'').split(',').map(x=>x.trim()).filter(Boolean);
      const latest=await fullScanKv.latest({tiers,limit});if(!latest)return send(res,200,{status:'ok',source:'render-kv-full-scan',items:[]});
      const items=(latest.items||[]).map(x=>compact?compactFullScanItem(x):x);
      return send(res,200,{status:'ok',source:'render-kv-full-scan',version:latest.version||null,runId:latest.id,statusText:latest.status,updatedAt:latest.updatedAt,completedAt:latest.completedAt,universeCount:latest.universeCount,selectedCount:latest.selectedCount,completedCount:latest.completedCount,errorCount:latest.errorCount,items});
    }
    if(req.method==='GET'&&u.pathname.startsWith('/api/v1/runs/')){
      const id=decodeURIComponent(u.pathname.slice('/api/v1/runs/'.length)),run=await fullScanKv.getRun(id);if(!run)return send(res,404,{status:'error',error:'run not found'});
      const include=u.searchParams.get('items')==='1',compact=u.searchParams.get('compact')!=='0',limit=Math.max(1,Math.min(2000,Number(u.searchParams.get('limit'))||500));
      const items=include?await fullScanKv.getItems(id,{limit}):undefined;return send(res,200,{...run,...(include?{items:(items||[]).map(x=>compact?compactFullScanItem(x):x)}:{})});
    }
    if(req.method==='GET'&&u.pathname==='/api/chartbro-research'){
      const view=String(u.searchParams.get('view')||'stats').toLowerCase(),symbol=u.searchParams.get('symbol'),limit=Math.max(1,Math.min(500,Number(u.searchParams.get('limit'))||100)),out=research(view,symbol,limit);
      return out?send(res,200,out):send(res,400,{status:'error',error:'unknown view'});
    }
    if(req.method==='GET'&&u.pathname==='/')return send(res,200,{service:'pulseradar-chartbro-oos-runtime',version:ChartBroOos.VERSION,health:'/health',research:'/api/chartbro-research?view=stats',fullScanHealth:'/api/v1/health',fullScanResults:'/api/v1/results?compact=1&limit=500'});
    return send(res,404,{status:'error',error:'not found'});
  }catch(e){return send(res,500,{status:'error',error:String(e?.message||e)})}
});

try{
  const pong=await kv.ping();health.kv={status:pong==='PONG'?'OK':'UNKNOWN',value:pong,updatedAt:Date.now()};
  const fullPong=await fullScanKv.ping();health.fullScan={...health.fullScan,store:fullPong==='PONG'?'OK':'UNKNOWN',source:'render-kv-full-scan'};
  await oos.hydrate();
}catch(e){health.kv={status:'DEGRADED',error:String(e?.message||e),updatedAt:Date.now()};health.errors.push({source:'kv',at:Date.now(),error:String(e?.message||e)})}
server.listen(PORT,'0.0.0.0',()=>{health.status=health.kv.status==='OK'?'READY':'DEGRADED';schedule()});
if(env.CHARTBRO_WORKER_ENABLED==='1')require('../lib/chartbro/runtime.js').startWorker();
process.on('SIGTERM',()=>{oos.flush().finally(()=>process.exit(0))});

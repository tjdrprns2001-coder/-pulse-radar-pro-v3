import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createAstraAutoScanner}=require('../lib/coin-scan/astra-auto-scanner.js');
const ChartBroOos=require('../lib/coin-scan/chartbro-oos-service.js');
const {createRenderKvStateStore}=require('../lib/coin-scan/render-kv-state-store.js');

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
const health={startedAt:Date.now(),status:'INIT',run:null,kv:{status:'INIT'},errors:[]};
let active=false;

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
    const minQuoteVolume=Math.max(0,Number(env.CHARTBRO_MIN_QUOTE_VOLUME||10000000));
    const oiLimit=Math.max(4,Math.min(96,Number(env.CHARTBRO_OI_LIMIT||48)));
    const deepLimit=Math.max(1,Math.min(24,Number(env.CHARTBRO_DEEP_LIMIT||16)));
    const outcomeLimit=Math.max(4,Math.min(64,Number(env.CHARTBRO_OUTCOME_LIMIT||24)));
    const u=await scanner.universe({method:'astra',minQuoteVolume});
    const symbols=(u.items||[]).slice(0,oiLimit).map(x=>x.symbol),oiItems=[];
    for(const xs of batch(symbols,24)){
      const o=await scanner.oi(xs,{method:'astra',asOf:u.asOf,market:u.marketState||u.breadth||{}});
      oiItems.push(...(o.items||[]));
    }
    const pass=oiItems.filter(x=>x.pass).sort((a,b)=>(Number(b.oi4hPct)||-999)-(Number(a.oi4hPct)||-999)).slice(0,deepLimit).map(x=>x.symbol);
    let deepScanned=0;
    for(const xs of batch(pass,4)){await scanner.deep(xs,{method:'astra',asOf:u.asOf,market:u.marketState||u.breadth||{}});deepScanned+=xs.length}
    const pending=oos.pendingSymbols({asOf:Date.now(),limit:outcomeLimit});let outcomeSymbolsChecked=0,outcomesEvaluated24h=0;
    for(const p of pending){
      try{
        const rows=await provider.getFuturesKlines(p.symbol,'5m',400),ev=oos.evaluateSymbol({symbol:p.symbol,frames:{'5m':rows},asOf:Date.now()});
        outcomeSymbolsChecked++;outcomesEvaluated24h+=Number(ev.evaluated)||0;
      }catch(e){health.errors.push({source:'outcome-resolver',symbol:p.symbol,at:Date.now(),error:String(e?.message||e)})}
    }
    const persisted=await oos.flush(),stats=oos.stats();
    health.status='OK';health.updatedAt=Date.now();
    health.run={startedAt:started,finishedAt:Date.now(),durationMs:Date.now()-started,universeCount:u.universeCount||0,filteredCount:u.filteredCount||0,oiChecked:symbols.length,oiPassed:oiItems.filter(x=>x.pass).length,deepScanned,outcomeSymbolsChecked,outcomesEvaluated24h,persisted,observations:stats.observations,evaluated24h:stats.evaluated24h,alerts:stats.alertCount,productionGate:stats.productionGate?.passed||false};
    health.errors=health.errors.slice(-20);
  }catch(e){
    health.status='DEGRADED';health.updatedAt=Date.now();health.run={...health.run,finishedAt:Date.now(),error:String(e?.message||e)};
    health.errors.push({source:'tracker',at:Date.now(),error:String(e?.message||e)});health.errors=health.errors.slice(-20);
  }finally{active=false}
}
function schedule(){
  if(String(env.CHARTBRO_TRACKER_ENABLED||'1')==='0'){health.status='DISABLED';return}
  const interval=Math.max(300000,Number(env.CHARTBRO_INTERVAL_MS||900000)),delay=Math.max(1000,Number(env.CHARTBRO_START_DELAY_MS||5000));
  setTimeout(run,delay).unref?.();setInterval(run,interval).unref?.();
}
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://chartbro.local');
    if(req.method==='GET'&&u.pathname==='/health')return send(res,200,{service:'pulseradar-chartbro-oos-runtime',status:health.status,uptimeMs:Date.now()-health.startedAt,health});
    if(req.method==='GET'&&u.pathname==='/api/chartbro-research'){
      const view=String(u.searchParams.get('view')||'stats').toLowerCase(),symbol=u.searchParams.get('symbol'),limit=Math.max(1,Math.min(500,Number(u.searchParams.get('limit'))||100)),out=research(view,symbol,limit);
      return out?send(res,200,out):send(res,400,{status:'error',error:'unknown view'});
    }
    if(req.method==='GET'&&u.pathname==='/')return send(res,200,{service:'pulseradar-chartbro-oos-runtime',version:ChartBroOos.VERSION,health:'/health',research:'/api/chartbro-research?view=stats'});
    return send(res,404,{status:'error',error:'not found'});
  }catch(e){return send(res,500,{status:'error',error:String(e?.message||e)})}
});

try{
  const pong=await kv.ping();health.kv={status:pong==='PONG'?'OK':'UNKNOWN',value:pong,updatedAt:Date.now()};
  await oos.hydrate();
}catch(e){health.kv={status:'DEGRADED',error:String(e?.message||e),updatedAt:Date.now()};health.errors.push({source:'kv',at:Date.now(),error:String(e?.message||e)})}
server.listen(PORT,'0.0.0.0',()=>{health.status=health.kv.status==='OK'?'READY':'DEGRADED';schedule()});
process.on('SIGTERM',()=>{oos.flush().finally(()=>process.exit(0))});

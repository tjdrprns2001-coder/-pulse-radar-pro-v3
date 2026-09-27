import fs from 'node:fs/promises';
import http from 'node:http';
import pg from 'pg';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createMarketCapProvider}=require('../lib/coin-scan/market-cap-provider.js');
const {createPostgresFullScanStore}=require('../lib/coin-scan/postgres-full-scan-store.js');
const {createFullUniverseScanService,normalizeTierSelection,AUTO_INTERVAL_MS}=require('../lib/coin-scan/full-universe-auto-scan.js');
const {createBinanceFuturesWsShards}=require('../lib/coin-scan/binance-ws-shards.js');

const env=process.env,{Pool}=pg;
if(!env.DATABASE_URL)throw new Error('DATABASE_URL required');
const pool=new Pool({connectionString:env.DATABASE_URL,max:Number(env.FULL_SCAN_PG_POOL_MAX||4),ssl:env.PG_SSL==='0'?false:{rejectUnauthorized:false}});
const query=(sql,params=[])=>pool.query(sql,params);
const store=createPostgresFullScanStore({query});
const provider=createBinanceProvider({
  concurrency:Number(env.FULL_SCAN_PROVIDER_CONCURRENCY||8),
  intervalConcurrency:Number(env.FULL_SCAN_INTERVAL_CONCURRENCY||2),
  disableSpotRest:true
});
const marketCapProvider=createMarketCapProvider({ttlMs:Number(env.FULL_SCAN_MARKET_CAP_TTL_MS||1800000)});
const service=createFullUniverseScanService({
  provider,marketCapProvider,store,
  maxWorkers:Number(env.FULL_SCAN_WORKERS||8),
  requestsPerMinute:Number(env.FULL_SCAN_REQUESTS_PER_MINUTE||240),
  klineRows:Number(env.FULL_SCAN_KLINE_ROWS||64)
});
const health={startedAt:Date.now(),status:'STARTING',auto:{status:'IDLE'},websocket:{status:'INIT'},errors:[]};
let ws=null,autoActive=false;

async function migrate(){
  const sql=await fs.readFile(new URL('../db/full-universe-scan-v1.sql',import.meta.url),'utf8');
  await query(sql);
}
function bearer(req){const raw=String(req.headers.authorization||'');return raw.toLowerCase().startsWith('bearer ')?raw.slice(7).trim():''}
function originAllowed(req){const allowed=String(env.PULSE_ALLOWED_ORIGIN||'').trim(),origin=String(req.headers.origin||'').trim();return !origin||!allowed||origin===allowed}
function headers(req,extra={}){const h={'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra};const allowed=String(env.PULSE_ALLOWED_ORIGIN||'').trim(),origin=String(req.headers.origin||'').trim();if(origin&&allowed&&origin===allowed)h['access-control-allow-origin']=origin;if(origin&&allowed)h.vary='Origin';return h}
function json(res,req,status,payload,extra={}){res.writeHead(status,headers(req,extra));res.end(JSON.stringify(payload))}
async function body(req,limit=64*1024){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>limit)throw Object.assign(new Error('request too large'),{statusCode:413})}return raw?JSON.parse(raw):{}}
function withLive(items=[]){return(items||[]).map(x=>({...x,live:ws?.get?.(x.symbol)||null}))}

async function startWebsocket(){
  if(!globalThis.WebSocket){health.websocket={status:'DISABLED',reason:'global WebSocket unavailable',updatedAt:Date.now()};return}
  try{
    const universe=await service.loadUniverse();
    ws=createBinanceFuturesWsShards({maxStreamsPerShard:Number(env.FULL_SCAN_WS_SHARD_SIZE||180),onState:s=>{health.websocket={status:s.state||'UNKNOWN',...s,updatedAt:Date.now()}}});
    const state=ws.start(universe.map(x=>x.symbol));health.websocket={status:'STARTED',...state,updatedAt:Date.now()};
  }catch(e){health.websocket={status:'DEGRADED',error:String(e?.message||e),updatedAt:Date.now()};health.errors.push({source:'websocket',at:Date.now(),error:String(e?.message||e)})}
}
async function runAuto(){
  if(autoActive)return;
  autoActive=true;health.auto={status:'STARTING',updatedAt:Date.now()};
  try{
    const result=await service.execute({kind:'auto',owner:'scheduler'});
    health.auto={status:result?.skipped?'CACHED':'DONE',runId:result?.id||null,completedCount:result?.completedCount||0,errorCount:result?.errorCount||0,bucketStart:result?.bucketStart||null,updatedAt:Date.now()};
  }catch(e){health.auto={status:'FAILED',error:String(e?.message||e),updatedAt:Date.now()};health.errors.push({source:'auto-scan',at:Date.now(),error:String(e?.message||e)})}
  finally{autoActive=false}
}
function scheduleAuto(){
  const tickMs=Math.max(15000,Number(env.FULL_SCAN_TICK_MS||60000));
  setTimeout(runAuto,Math.max(0,Number(env.FULL_SCAN_START_DELAY_MS||5000))).unref?.();
  setInterval(runAuto,tickMs).unref?.();
}
function nextBucketAt(){const now=Date.now();return Math.floor(now/AUTO_INTERVAL_MS)*AUTO_INTERVAL_MS+AUTO_INTERVAL_MS}

function server(){
  const port=Number(env.PORT||8790);
  return http.createServer(async(req,res)=>{
    try{
      if(req.method==='OPTIONS'){
        if(!originAllowed(req))return json(res,req,403,{status:'error',error:'origin not allowed'});
        res.writeHead(204,headers(req,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}));return res.end();
      }
      if(!originAllowed(req))return json(res,req,403,{status:'error',error:'origin not allowed'});
      const u=new URL(req.url,'http://full-scan.local');
      if(req.method==='GET'&&u.pathname==='/api/v1/health')return json(res,req,200,{service:'pulse-full-universe-auto-scan',status:'ok',uptimeMs:Date.now()-health.startedAt,nextAutoBucketAt:nextBucketAt(),health});
      if(req.method==='GET'&&u.pathname==='/api/v1/results'){
        const tiers=normalizeTierSelection(u.searchParams.get('tiers')||''),limit=Math.max(1,Math.min(2000,Number(u.searchParams.get('limit'))||1000));
        const latest=await store.latest({tiers,limit});
        return json(res,req,200,latest?{status:'ok',source:'cache',...latest,items:withLive(latest.items)}:{status:'empty',source:'cache',items:[]});
      }
      if(req.method==='GET'&&u.pathname.startsWith('/api/v1/runs/')){
        const id=decodeURIComponent(u.pathname.slice('/api/v1/runs/'.length)),run=await store.getRun(id);if(!run)return json(res,req,404,{status:'error',error:'run not found'});
        const include=String(u.searchParams.get('items')||'0')==='1',tiers=normalizeTierSelection(u.searchParams.get('tiers')||'');
        return json(res,req,200,{status:'ok',...run,items:include?withLive(await store.getItems(id,{tiers,limit:Number(u.searchParams.get('limit'))||1000})):undefined});
      }
      if(req.method==='POST'&&u.pathname==='/api/v1/manual-scan'){
        const secret=String(env.FULL_SCAN_ADMIN_TOKEN||'');if(!secret)return json(res,req,503,{status:'error',error:'manual scan disabled'});
        if(bearer(req)!==secret)return json(res,req,401,{status:'error',error:'unauthorized'},{'www-authenticate':'Bearer'});
        const data=await body(req),tiers=normalizeTierSelection(data?.tiers);if(!tiers.length)return json(res,req,400,{status:'error',error:'tiers must include small, mid or large'});
        const prepared=await service.prepare({kind:'manual',tiers,owner:'admin-api'});
        service.executeRun(prepared.run,{tiers}).then(r=>{health.manual={status:'DONE',runId:r.id,updatedAt:Date.now()}}).catch(e=>{health.manual={status:'FAILED',runId:prepared.run.id,error:String(e?.message||e),updatedAt:Date.now()};health.errors.push({source:'manual-scan',at:Date.now(),error:String(e?.message||e)})});
        return json(res,req,202,{status:'accepted',runId:prepared.run.id,tiers,progress:'/api/v1/runs/'+encodeURIComponent(prepared.run.id)+'?items=0'});
      }
      if(req.method==='GET'&&u.pathname==='/')return json(res,req,200,{service:'pulse-full-universe-auto-scan',version:'v1',health:'/api/v1/health',results:'/api/v1/results',manual:'POST /api/v1/manual-scan'});
      return json(res,req,404,{status:'error',error:'not found'});
    }catch(e){return json(res,req,Number(e?.statusCode)||500,{status:'error',error:String(e?.message||e)})}
  }).listen(port,'0.0.0.0',()=>{health.status='RUNNING';health.port=port;health.updatedAt=Date.now()});
}

await migrate();
server();
startWebsocket();
scheduleAuto();
process.on('SIGTERM',async()=>{try{await pool.end()}catch{}process.exit(0)});

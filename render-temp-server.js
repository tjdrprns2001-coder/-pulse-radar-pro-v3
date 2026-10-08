'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const {URL}=require('url');
const {createBinanceProvider}=require('./lib/coin-scan/binance-provider.js');
const {createAstraAutoScanner}=require('./lib/coin-scan/astra-auto-scanner.js');
const ChartBroOos=require('./lib/coin-scan/chartbro-oos-service.js');
const {createChartV1Service}=require('./lib/chart-v1/service.js');
const {defaultChartRuntime}=require('./lib/chart-v1/runtime.js');
const {WebSocketServer}=require('ws');

const ROOT=__dirname;
const PORT=Number(process.env.PORT||10000);
const chartbroHealth={status:String(process.env.CHARTBRO_AUTO_TRACKER_ENABLED||'0')==='1'?'INIT':'DISABLED',updatedAt:Date.now()};
const chartV1AlertHealth={status:String(process.env.CHART_V1_ALERT_WORKER_ENABLED||'0')==='1'?'INIT':'DISABLED',updatedAt:Date.now(),runs:0,alertsSaved:0};
let chartbroActive=false,chartbroScanner=null,chartV1AlertActive=false;
const chartProvider=createBinanceProvider({concurrency:2,intervalConcurrency:2,disableSpotRest:false,disableFuturesFallback:false});
const chartRuntime=defaultChartRuntime({provider:chartProvider});
const chartV1Service=createChartV1Service({provider:chartProvider,runtime:chartRuntime});

const aliases={
  '/':'/pulse-unified.html',
  '/astra-scan':'/astra-scan.html',
  '/analysis':'/analysis-shell-v12.html',
  '/liquidity':'/liquidity-lab-v2.html',
  '/radar':'/radar.html'
};

const indexRoutes=new Set([
  'backtest','calibration-freeze','calibration-health','detail','historical-structure-study','htf',
  'independent-temporal','market','micro-features','pattern','pattern-validation','structure-study',
  'dante-cloud','dante-backtest','structure','temporal-features','trendline-study','signal-alerts','signal-backfill',
  'signal-calibration','signal-health','signal-performance','learning-ai','ignition-results','chartbro-research','chart-snapshots','derivatives-capability','chartbro'
]);

function contentType(file){
  const ext=path.extname(file).toLowerCase();
  return ({
    '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
    '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
    '.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'
  })[ext]||'application/octet-stream';
}

function send(res,status,body,headers={}){
  res.writeHead(status,{'Cache-Control':'no-store',...headers});
  res.end(body);
}

function makeRes(nodeRes){
  let statusCode=200;
  const headers={};
  const apiRes={
    headersSent:false,
    setHeader(name,value){headers[name]=String(value);return this;},
    getHeader(name){return headers[name];},
    status(code){statusCode=Number(code)||200;return this;},
    json(value){
      if(this.headersSent)return;
      this.headersSent=true;
      send(nodeRes,statusCode,JSON.stringify(value),{'Content-Type':'application/json; charset=utf-8',...headers});
      return this;
    },
    send(value){
      if(this.headersSent)return;
      this.headersSent=true;
      const body=Buffer.isBuffer(value)?value:(typeof value==='string'?value:JSON.stringify(value));
      send(nodeRes,statusCode,body,headers);
      return this;
    },
    end(value=''){
      if(this.headersSent)return;
      this.headersSent=true;
      send(nodeRes,statusCode,String(value),headers);
      return this;
    }
  };
  return apiRes;
}

async function bodyOf(req){
  if(req.method==='GET'||req.method==='HEAD')return null;
  const chunks=[];
  for await(const chunk of req)chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8');
  if(!raw)return null;
  const ct=String(req.headers['content-type']||'');
  if(ct.includes('application/json')){try{return JSON.parse(raw)}catch{return raw}}
  return raw;
}

async function handleApi(req,res,u){
  const name=u.pathname.replace(/^\/api\//,'').replace(/\/+$/,'')||'index';
  const query=Object.fromEntries(u.searchParams.entries());
  const apiReq={
    method:req.method||'GET',
    headers:req.headers||{},
    query,
    body:await bodyOf(req),
    url:req.url,
    path:u.pathname
  };
  const apiRes=makeRes(res);
  try{
    let handler;
    if(name==='v1'||name.startsWith('v1/')){
      apiReq.query.routePath=name==='v1'?String(apiReq.query.path||''):name.slice(3);
      handler=require(path.join(ROOT,'handlers','v1.js'));
    }else if(name==='index'){
      handler=require(path.join(ROOT,'api','index.js'));
    }else if(indexRoutes.has(name)){
      apiReq.query.route=name;
      handler=require(path.join(ROOT,'api','index.js'));
    }else{
      const mod=path.join(ROOT,'api',name+'.js');
      if(!fs.existsSync(mod))return apiRes.status(404).json({ok:false,error:'Unknown API route',route:name});
      handler=require(mod);
    }
    const out=await handler(apiReq,apiRes,name==='v1'||name.startsWith('v1/')?{service:chartV1Service}:{});
    if(apiRes.headersSent)return;
    if(out&&typeof out.statusCode==='number'){
      const h=out.headers||{};
      return send(res,out.statusCode,out.body||'',h);
    }
    return apiRes.end('');
  }catch(e){
    if(apiRes.headersSent)return;
    return apiRes.status(500).json({ok:false,error:e&&e.message?e.message:String(e),route:name});
  }
}

function safeFile(pathname){
  const mapped=aliases[pathname]||pathname;
  const decoded=decodeURIComponent(mapped.split('?')[0]);
  const rel=decoded.replace(/^\/+/, '');
  const file=path.resolve(ROOT,rel);
  if(!file.startsWith(ROOT+path.sep)&&file!==ROOT)return null;
  return file;
}


function batch(a,n){const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out}
function tracker(){
  if(!chartbroScanner)chartbroScanner=createAstraAutoScanner({provider:createBinanceProvider({concurrency:1,intervalConcurrency:1,futuresMinIntervalMs:Number(process.env.ASTRA_FUTURES_MIN_INTERVAL_MS||350),disableSpotRest:false,disableFuturesFallback:false})});
  return chartbroScanner;
}
async function runChartBroTracker(){
  if(String(process.env.CHARTBRO_AUTO_TRACKER_ENABLED||'0')!=='1'||chartbroActive)return;
  chartbroActive=true;chartbroHealth.status='RUNNING';chartbroHealth.startedAt=Date.now();chartbroHealth.updatedAt=Date.now();
  try{
    const scanner=tracker(),minQuoteVolume=Math.max(0,Number(process.env.CHARTBRO_TRACKER_MIN_QUOTE_VOLUME||10000000)),oiLimit=Math.max(4,Math.min(48,Number(process.env.CHARTBRO_TRACKER_OI_LIMIT||24))),deepLimit=Math.max(1,Math.min(16,Number(process.env.CHARTBRO_TRACKER_DEEP_LIMIT||8)));
    const u=await scanner.universe({method:'astra',minQuoteVolume}),symbols=(u.items||[]).slice(0,oiLimit).map(x=>x.symbol),oiItems=[];
    for(const xs of batch(symbols,24)){const o=await scanner.oi(xs,{method:'astra',asOf:u.asOf,market:u.marketState||u.breadth||{}});oiItems.push(...(o.items||[]))}
    const pass=oiItems.filter(x=>x.pass).sort((a,b)=>(Number(b.oi4hPct)||-999)-(Number(a.oi4hPct)||-999)).slice(0,deepLimit).map(x=>x.symbol);
    let deepScanned=0;
    for(const xs of batch(pass,4)){await scanner.deep(xs,{method:'astra',asOf:u.asOf,market:u.marketState||u.breadth||{}});deepScanned+=xs.length}
    const stats=ChartBroOos.defaultChartBroOosService().stats();
    Object.assign(chartbroHealth,{status:'DONE',updatedAt:Date.now(),universeCount:u.universeCount||0,oiChecked:symbols.length,oiPassed:oiItems.filter(x=>x.pass).length,deepScanned,observations:stats.observations,evaluated24h:stats.evaluated24h,alerts:stats.alertCount,productionGate:stats.productionGate?.passed||false,error:null});
  }catch(e){Object.assign(chartbroHealth,{status:'FAILED',updatedAt:Date.now(),error:String(e?.message||e)})}
  finally{chartbroActive=false}
}
async function runChartV1AlertWorker(){
  if(String(process.env.CHART_V1_ALERT_WORKER_ENABLED||'0')!=='1'||chartV1AlertActive)return;
  chartV1AlertActive=true;chartV1AlertHealth.status='RUNNING';chartV1AlertHealth.startedAt=Date.now();chartV1AlertHealth.updatedAt=Date.now();
  const raw=String(process.env.CHART_V1_ALERT_SYMBOLS||'BTCUSDT,ETHUSDT,DOGEUSDT').split(',').map(x=>x.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean),symbols=[...new Set(raw)].slice(0,24),tf=String(process.env.CHART_V1_ALERT_TIMEFRAME||'4h');
  let completed=0,saved=0,errors=[];
  try{
    for(const symbol of symbols){
      try{const asset=symbol.endsWith('USDT')?symbol.slice(0,-4):symbol,a=await chartV1Service.analyze(asset,{timeframe:tf,market:'spot',visible:500,warmup:300,total:800,priceBins:100}),r=await chartRuntime.observeAnalysis(a);completed++;saved+=(r?.saved?.length||0)}catch(e){errors.push({symbol,error:String(e?.message||e)})}
    }
    Object.assign(chartV1AlertHealth,{status:errors.length&&completed===0?'FAILED':errors.length?'PARTIAL':'DONE',updatedAt:Date.now(),runs:Number(chartV1AlertHealth.runs||0)+1,symbols,completed,alertsSaved:Number(chartV1AlertHealth.alertsSaved||0)+saved,lastRunSaved:saved,errors:errors.slice(0,8)})
  }catch(e){Object.assign(chartV1AlertHealth,{status:'FAILED',updatedAt:Date.now(),error:String(e?.message||e)})}
  finally{chartV1AlertActive=false}
}
function scheduleChartV1AlertWorker(){
  if(String(process.env.CHART_V1_ALERT_WORKER_ENABLED||'0')!=='1')return;
  const interval=Math.max(300000,Number(process.env.CHART_V1_ALERT_INTERVAL_MS||900000)),delay=Math.max(10000,Number(process.env.CHART_V1_ALERT_START_DELAY_MS||60000));
  setTimeout(runChartV1AlertWorker,delay).unref?.();setInterval(runChartV1AlertWorker,interval).unref?.();
}

function scheduleChartBroTracker(){
  if(String(process.env.CHARTBRO_AUTO_TRACKER_ENABLED||'0')!=='1')return;
  const interval=Math.max(300000,Number(process.env.CHARTBRO_TRACKER_INTERVAL_MS||900000)),delay=Math.max(5000,Number(process.env.CHARTBRO_TRACKER_START_DELAY_MS||45000));
  setTimeout(runChartBroTracker,delay).unref?.();setInterval(runChartBroTracker,interval).unref?.();
}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/health/live')return send(res,200,JSON.stringify({ok:true,status:'alive',release:process.env.PULSERADAR_RELEASE||null}),{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    if(u.pathname==='/health/ready'){
      const runtime=await chartRuntime.health();
      const ready=runtime.storage_ready===true;
      return send(res,ready?200:503,JSON.stringify({ok:ready,status:ready?'ready':'degraded',reason:runtime.reason||null,storage:runtime.persistence,release:process.env.PULSERADAR_RELEASE||null}),{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    }
    if(u.pathname==='/health')return send(res,200,JSON.stringify({ok:true,service:'pulseradar-temp-preview',release:process.env.PULSERADAR_RELEASE||null,chartbro:chartbroHealth,chart_v1_alerts:chartV1AlertHealth}),{'Content-Type':'application/json; charset=utf-8'});
    if(u.pathname.startsWith('/api/'))return await handleApi(req,res,u);
    const file=safeFile(u.pathname);
    if(!file||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,'Not Found',{'Content-Type':'text/plain; charset=utf-8'});
    const headers={'Content-Type':contentType(file)};
    if(file.endsWith('.html')||file.endsWith('.js')||file.endsWith('.css'))headers['Cache-Control']='public, max-age=0, must-revalidate';
    res.writeHead(200,headers);
    fs.createReadStream(file).pipe(res);
  }catch(e){
    send(res,500,'Server error: '+String(e&&e.message||e),{'Content-Type':'text/plain; charset=utf-8'});
  }
});

function wsSymbol(v){
  const raw=String(v||'').toUpperCase().replace(/[^A-Z0-9:]/g,'');
  const s=raw.includes(':')?raw.split(':').pop():raw;
  return s.endsWith('USDT')?s:s+'USDT';
}
function wsAsset(v){const s=wsSymbol(v);return s.endsWith('USDT')?s.slice(0,-4):s}
function wsSend(ws,payload){if(ws.readyState!==1||ws.bufferedAmount>1024*1024)return false;try{ws.send(JSON.stringify(payload));return true}catch{return false}}
function wsEventAllowed(channels,event,data=null){
  const e=String(event||'');
  return channels.some(c=>{
    const n=String(c.name||'');
    if(n==='trades'&&e==='trade')return true;
    if(n==='liquidations'&&e==='liquidation')return true;
    if(n==='orderbook'&&e==='orderbook')return true;
    if(n==='funding'&&e==='funding')return true;
    if(n==='candles'&&e==='candle.update')return String(c.timeframe||'1m')===String(data?.interval||'1m');
    return false;
  })
}
const wss=new WebSocketServer({noServer:true,maxPayload:65536,clientTracking:true});
wss.on('connection',(ws)=>{
  let channels=[],cleanups=[],timer=null,closed=false;
  const resetSubscriptions=()=>{
    for(const fn of cleanups)try{fn()}catch{}cleanups=[];
    const symbols=[...new Set(channels.map(c=>wsSymbol(c.instrument_id||c.symbol||c.asset_id)).filter(Boolean))].slice(0,12);
    for(const symbol of symbols){
      const off=chartRuntime.hub.subscribe(symbol,(evt)=>{
        if(wsEventAllowed(channels,evt.event,evt.data))wsSend(ws,{event:evt.event,instrument_id:'perp:'+symbol,symbol,data:evt.data??null,occurred_at:evt.time||Date.now()});
      });cleanups.push(off);
      const snap=chartRuntime.hub.snapshot(symbol,{profileBins:100});
      wsSend(ws,{event:'market.snapshot',instrument_id:'perp:'+symbol,symbol,data:{status:snap.status,orderbook:snap.orderbook,funding:snap.funding,liquidations:snap.liquidations?.summary_1h||null,trade_profile:snap.trade_profile},occurred_at:Date.now()});
    }
    clearInterval(timer);timer=setInterval(async()=>{
      if(closed||ws.readyState!==1)return;
      for(const ch of channels.slice(0,20)){
        const symbol=wsSymbol(ch.instrument_id||ch.symbol||ch.asset_id),asset=wsAsset(symbol),name=String(ch.name||''),tf=String(ch.timeframe||'4h');
        try{
          if(name==='open_interest'){
            const r=await chartV1Service.openInterest('perp:'+symbol,{timeframe:tf});
            wsSend(ws,{event:'open_interest',instrument_id:'perp:'+symbol,symbol,data:r.data?.at(-1)||null,meta:r.meta,occurred_at:Date.now()});
          }else if(name==='analysis_events'){
            const r=await chartV1Service.overview(asset,{timeframe:tf,market:'spot',visible:200,warmup:300,total:500,priceBins:80});
            wsSend(ws,{event:'analysis.snapshot',asset_id:'asset:'+asset,timeframe:tf,data:{market_structure:r.data?.market_structure,breakout:r.data?.breakout,smart_money:r.data?.smart_money,confidence:r.data?.confidence,as_of:r.data?.as_of},occurred_at:Date.now()});
          }
        }catch(e){wsSend(ws,{event:'channel.error',channel:name,symbol,error:String(e?.message||e),occurred_at:Date.now()})}
      }
    },30000);timer.unref?.();
  };
  ws.on('message',(buf)=>{
    let msg;try{msg=JSON.parse(String(buf))}catch{return wsSend(ws,{event:'error',code:'INVALID_JSON'})}
    const op=String(msg?.op||'');
    if(op==='subscribe'){
      const incoming=Array.isArray(msg.channels)?msg.channels:[];channels=incoming.slice(0,20).map(x=>({name:String(x?.name||''),instrument_id:x?.instrument_id||null,asset_id:x?.asset_id||null,symbol:x?.symbol||null,timeframe:String(x?.timeframe||'4h')})).filter(x=>x.name&&(x.instrument_id||x.asset_id||x.symbol));
      resetSubscriptions();wsSend(ws,{event:'subscribed',channels,occurred_at:Date.now()});
    }else if(op==='ping')wsSend(ws,{event:'pong',occurred_at:Date.now()});
    else if(op==='unsubscribe'){channels=[];resetSubscriptions();wsSend(ws,{event:'unsubscribed',occurred_at:Date.now()})}
    else wsSend(ws,{event:'error',code:'UNSUPPORTED_OPERATION'});
  });
  ws.on('close',()=>{closed=true;clearInterval(timer);for(const fn of cleanups)try{fn()}catch{}cleanups=[]});
  wsSend(ws,{event:'hello',version:'ws-v1',max_channels:20,occurred_at:Date.now()});
});
server.on('upgrade',(req,socket,head)=>{
  let u;try{u=new URL(req.url,'http://localhost')}catch{return socket.destroy()}
  if(u.pathname!=='/ws/v1/market')return socket.destroy();
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});

server.listen(PORT,'0.0.0.0',()=>{console.log('PulseRadar temp preview listening on',PORT);chartRuntime.init().catch(()=>{});scheduleChartBroTracker();scheduleChartV1AlertWorker();if(process.env.CHARTBRO_WORKER_ENABLED==='1')require('./lib/chartbro/runtime').startWorker()});

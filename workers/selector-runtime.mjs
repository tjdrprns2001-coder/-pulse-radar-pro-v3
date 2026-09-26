import fs from 'node:fs/promises';
import http from 'node:http';
import pg from 'pg';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createRpcClient,createEvmCollector}=require('../lib/coin-scan/evm-rpc-collector.js');
const {createBinanceWsMultiplexer}=require('../lib/coin-scan/binance-ws-multiplexer.js');
const {createPostgresRuntimeStore}=require('../lib/coin-scan/postgres-runtime-store.js');
const {createRuntimeWorker}=require('../lib/coin-scan/runtime-worker.js');
const {createMemoryRawEventJournal}=require('../lib/coin-scan/raw-event-journal.js');
const {normalizeAlchemy}=require('../lib/coin-scan/alchemy-webhook.js');
const {createVerifiedNewsProvider}=require('../lib/coin-scan/verified-news-provider.js');
const {createMacroCalendarProvider}=require('../lib/coin-scan/macro-calendar-provider.js');
const {createTtlCache}=require('../lib/coin-scan/cache.js');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const {createAstraAutoScanner,methodOf:astraMethodOf,VERSION:ASTRA_VERSION}=require('../lib/coin-scan/astra-auto-scanner.js');
const {createSelectorLedgerService}=require('../lib/coin-scan/selector-ledger-service.js');
const {createPostgresSelectorStore}=require('../lib/coin-scan/postgres-selector-store.js');
const {createBinanceResolver}=require('../lib/signal-performance/binance-resolver.js');

const {Pool}=pg;
const env=process.env;
const DB_URL=env.DATABASE_URL;
if(!DB_URL)throw new Error('DATABASE_URL required');

const pool=new Pool({connectionString:DB_URL,max:Number(env.PG_POOL_MAX||5),ssl:env.PG_SSL==='0'?false:{rejectUnauthorized:false}});
const query=(sql,params=[])=>pool.query(sql,params);
const store=createPostgresRuntimeStore({query});
const runtime=createRuntimeWorker({store,journal:createMemoryRawEventJournal({maxEvents:Number(env.RUNTIME_JOURNAL_MAX_EVENTS||500),maxQueue:200,maxDlq:200})});
const selectorStore=createPostgresSelectorStore({query});
const selectorLedger=createSelectorLedgerService({store:selectorStore,resolver:createBinanceResolver({})});
const selectorScanService=createScanService({provider:createBinanceProvider({concurrency:1,disableSpotRest:true}),selectorLedger});
const astraScanner=createAstraAutoScanner({provider:createBinanceProvider({concurrency:2,intervalConcurrency:2,disableSpotRest:false})});
const health={startedAt:Date.now(),evm:{status:'INIT'},binanceSpot:{status:'INIT'},binanceFutures:{status:'INIT'},news:{status:'INIT'},calendar:{status:'INIT'},queues:{status:'INIT'},selector:{status:'INIT'},errors:[]};
let evmCollector=null;

async function migrate(){
  if(env.RUNTIME_AUTO_MIGRATE==='0')return;
  const sql=await fs.readFile(new URL('../db/selector-runtime-r04.sql',import.meta.url),'utf8');
  await query(sql);
}

function tokens(){
  return String(env.EVM_TOKEN_CONTRACTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,20);
}
function symbols(){
  return [...new Set(String(env.SELECTOR_RUNTIME_SYMBOLS||'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,LINKUSDT').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean))].slice(0,50);
}
async function runEvm(){
  const primaryUrl=env.EVM_RPC_PRIMARY,secondaryUrl=env.EVM_RPC_SECONDARY;
  if(!primaryUrl){health.evm={status:'DISABLED',reason:'EVM_RPC_PRIMARY missing'};return}
  const primary={...createRpcClient({url:primaryUrl}),url:primaryUrl},secondary=secondaryUrl?{...createRpcClient({url:secondaryUrl}),url:secondaryUrl}:null;
  const collector=createEvmCollector({chainId:env.EVM_CHAIN_ID||'1',primary,secondary,confirmations:Number(env.EVM_CONFIRMATIONS||12),finalityBlocks:Number(env.EVM_FINALITY_BLOCKS||64)});evmCollector=collector;
  const entity='chain:'+String(env.EVM_CHAIN_ID||'1');
  while(true){
    try{
      const wm=await store.getWatermark('evm',entity),head=await collector.head();
      const lookback=Math.max(2,Number(env.EVM_REORG_LOOKBACK||24)),startCheck=Math.max(0,head-lookback);
      for(let n=startCheck;n<=head;n++){
        const cmp=await collector.compareBlock(n);if(!cmp.primaryHash)continue;
        const prior=await store.getLatestChainBlock(env.EVM_CHAIN_ID||'1',n);
        if(prior&&String(prior.block_hash).toLowerCase()!==String(cmp.primaryHash).toLowerCase()){
          await store.appendChainBlock({chain_id:env.EVM_CHAIN_ID||'1',block_number:n,block_hash:cmp.primaryHash,parent_hash:cmp.block?.parentHash,status:'CANONICAL',replaced_hash:prior.block_hash});
          const affected=await store.listRawByBlock(env.EVM_CHAIN_ID||'1',n);
          for(const old of affected)await runtime.ingest({source_name:'evm-reorg-reconciler',source_kind:'evm_reorg',entity_key:old.entity_key,source_time:Date.now(),received_time:Date.now(),available_time:Date.now(),provider_event_id:old.event_id+':'+cmp.primaryHash,correction_of:old.event_id,payload:{original_event_id:old.event_id,chain_id:String(env.EVM_CHAIN_ID||'1'),block_number:n,old_block_hash:prior.block_hash,new_block_hash:cmp.primaryHash,finality_status:'REORGED'}});
        }else if(!prior)await store.appendChainBlock({chain_id:env.EVM_CHAIN_ID||'1',block_number:n,block_hash:cmp.primaryHash,parent_hash:cmp.block?.parentHash,status:cmp.conflicted?'CONFLICTED':'CANONICAL'});
      }
      let from=wm?.metadata?.last_processed_block!=null?Number(wm.metadata.last_processed_block)+1:Math.max(0,head-2);
      const to=Math.min(head,from+Number(env.EVM_MAX_BLOCK_BATCH||50)-1);
      if(from<=to){
        const res=await collector.transferEvents({fromBlock:from,toBlock:to,contracts:tokens()});
        let conflicted=false;
        for(const e of res.events){
          const raw=await runtime.ingest({
            source_name:'evm-rpc',source_kind:'evm_transfer',entity_key:e.token_contract,source_time:e.block_timestamp,available_time:Date.now(),
            chain_id:e.chain_id,tx_hash:e.tx_hash,log_index:e.log_index,token_contract:e.token_contract,payload:e
          });
          if(e.finality_status==='REORG_CANDIDATE'){conflicted=true;await runtime.processFailure(raw,{error:'block hash conflict'})}
        }
        await runtime.updateWatermark('evm',entity,{status:conflicted?'CONFLICTED':'FRESH',last_sequence:to,last_source_time:Date.now(),last_received_time:Date.now(),last_available_time:Date.now(),gap_count:0,metadata:{last_processed_block:to,latest_head:res.headNumber}});
        health.evm={status:conflicted?'CONFLICTED':'FRESH',head:res.headNumber,lastProcessed:to,eventCount:res.events.length,updatedAt:Date.now()};
      }else health.evm={...health.evm,status:'FRESH',head,updatedAt:Date.now()};
    }catch(e){health.evm={status:'DEGRADED',error:String(e?.message||e),updatedAt:Date.now()};health.errors.push({source:'evm',at:Date.now(),error:String(e?.message||e)});}
    await new Promise(r=>setTimeout(r,Number(env.EVM_POLL_MS||12000)));
  }
}
async function depthSnapshot(stream,market='spot'){
  const symbol=String(stream).split('@')[0].toUpperCase(),base=market==='futures'?'https://fapi.binance.com/fapi/v1/depth':'https://api.binance.com/api/v3/depth';
  const r=await fetch(base+'?symbol='+encodeURIComponent(symbol)+'&limit=1000');
  if(!r.ok)throw new Error('Binance '+market+' depth HTTP '+r.status);
  return r.json();
}
function createBinanceRuntime({market='spot'}={}){
  const isSpot=market==='spot';
  const streams=symbols().map(s=>s.toLowerCase()+'@bookTicker');
  const source=isSpot?'binance-spot-ws':'binance-futures-ws';
  const mux=createBinanceWsMultiplexer({
    url:isSpot?'wss://stream.binance.com:9443/stream':'wss://fstream.binance.com/stream',
    restSnapshot:null,
    onEvent:async({stream,data,receivedAt})=>{
      const symbol=stream.split('@')[0].toUpperCase();
      if(!/bookticker/i.test(stream))return;
      const seq=Number(data.u);
      const sourceTime=Number(data.E)||receivedAt;
      await runtime.ingest({source_name:source,source_kind:'book_ticker',entity_key:symbol,source_time:sourceTime,received_time:receivedAt,available_time:receivedAt,venue:'binance',market_type:market,symbol,update_id:Number.isFinite(seq)?seq:null,sequence_no:Number.isFinite(seq)?seq:null,payload:data});
      await runtime.updateWatermark(source,symbol,{status:'FRESH',last_sequence:Number.isFinite(seq)?seq:null,last_source_time:sourceTime,last_received_time:receivedAt,last_available_time:receivedAt,gap_count:0,metadata:{stream,market,transport:'websocket-bookTicker'}});
    },
    onState:s=>{const key=isSpot?'binanceSpot':'binanceFutures';health[key]={...s,updatedAt:Date.now(),market}},
    maxStreams:Number(env.BINANCE_MAX_STREAMS||200)
  });
  mux.subscribe(streams);mux.connect();return mux;
}
async function runBinance(){
  const spot=createBinanceRuntime({market:'spot'}),futures=createBinanceRuntime({market:'futures'});
  const lastReconnect={spot:0,futures:0},cooldown=Math.max(10000,Number(env.BINANCE_WS_RECONNECT_COOLDOWN_MS||15000));
  setInterval(()=>{
    const now=Date.now(),sh=spot.heartbeat(),fh=futures.heartbeat();
    health.binanceSpot={...health.binanceSpot,...sh,updatedAt:now};
    health.binanceFutures={...health.binanceFutures,...fh,updatedAt:now};
    if(sh.state==='LIVE'&&sh.silent&&now-lastReconnect.spot>=cooldown){lastReconnect.spot=now;health.errors.push({source:'binance-spot-watchdog',at:now,error:'silent websocket reconnect'});spot.connect()}
    if(fh.state==='LIVE'&&fh.silent&&now-lastReconnect.futures>=cooldown){lastReconnect.futures=now;health.errors.push({source:'binance-futures-watchdog',at:now,error:'silent websocket reconnect'});futures.connect()}
  },5000).unref();
}
function extractTxHashes(value,out=new Set()){
  if(value==null)return out;
  if(typeof value==='string'){if(/^0x[0-9a-fA-F]{64}$/.test(value))out.add(value);return out}
  if(Array.isArray(value)){for(const x of value)extractTxHashes(x,out);return out}
  if(typeof value==='object')for(const [k,v] of Object.entries(value)){if(/(?:transaction)?hash/i.test(k)&&typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v))out.add(v);else extractTxHashes(v,out)}
  return out;
}
async function runQueues(){
  while(true){
    try{
      const jobs=await store.claimJobs('rpc_verify',10);
      for(const job of jobs){
        try{
          if(!evmCollector)throw new Error('EVM collector unavailable');
          const raw=await store.getRaw(job.event_id),hashes=[...extractTxHashes(raw?.payload)];
          if(!hashes.length)throw new Error('No transaction hash in webhook payload');
          const results=[];for(const h of hashes)results.push(await evmCollector.verifyReceipt(h));
          await runtime.ingest({source_name:'evm-rpc-verifier',source_kind:'webhook_verification',entity_key:raw?.entity_key||null,source_time:Date.now(),received_time:Date.now(),available_time:Date.now(),provider_event_id:job.event_id,payload:{original_event_id:job.event_id,results},correction_of:job.event_id});
          const pending=results.some(x=>!['FINAL','CONFIRMED'].includes(x.status));
          if(pending)await store.retryJob(job.job_id,'finality pending',Date.now()+Number(env.RPC_VERIFY_RETRY_MS||30000));else await store.completeJob(job.job_id);
        }catch(e){
          const wait=Math.min(300000,1000*Math.pow(2,Math.max(0,Number(job.attempts||1)-1)));
          if(Number(job.attempts||0)>=8){await store.deadLetter({event_id:job.event_id,source_name:'rpc_verify',reason:String(e?.message||e),payload:job.payload});await store.completeJob(job.job_id)}
          else await store.retryJob(job.job_id,e?.message||e,Date.now()+wait);
        }
      }
      health.queues={status:'FRESH',lastBatch:jobs.length,updatedAt:Date.now()};
    }catch(e){health.queues={status:'DEGRADED',error:String(e?.message||e),updatedAt:Date.now()}}
    await new Promise(r=>setTimeout(r,Number(env.QUEUE_POLL_MS||5000)));
  }
}
async function runEvidencePollers(){
  const cache=createTtlCache({now:()=>Date.now()}),newsProvider=createVerifiedNewsProvider({fetchImpl:fetch,env,now:()=>Date.now(),cache}),calendarProvider=createMacroCalendarProvider({fetchImpl:fetch,cache,now:()=>Date.now()});
  let lastNews=0,lastCalendar=0;
  while(true){
    const now=Date.now();
    if(now-lastNews>=Number(env.NEWS_POLL_MS||300000)){
      let degraded=false,count=0;
      for(const symbol of symbols()){
        try{
          const result=await newsProvider.get(symbol);if(result.status==='DEGRADED')degraded=true;
          for(const x of result.items||[]){
            await runtime.ingest({source_name:x.source||result.provider||'news',source_kind:'news',entity_key:symbol,source_time:x.publishedAt,received_time:x.retrievedAt||now,available_time:now,canonical_url:x.url||'',content_hash:x.content_hash||null,headline:x.title||'',provider_event_id:x.id||null,payload:{...x,symbol}});
            count++;
          }
        }catch(e){degraded=true;health.errors.push({source:'news',at:now,error:String(e?.message||e)})}
      }
      lastNews=now;health.news={status:degraded?'DEGRADED':'FRESH',eventCount:count,updatedAt:now};
      await runtime.updateWatermark('news','global',{status:health.news.status,last_sequence:null,last_source_time:now,last_received_time:now,last_available_time:now,gap_count:0,metadata:{eventCount:count}});
    }
    if(now-lastCalendar>=Number(env.CALENDAR_POLL_MS||21600000)){
      try{
        const result=await calendarProvider.get();for(const x of result.items||[])await runtime.ingest({source_name:x.source_name||result.provider||'calendar',source_kind:'calendar',entity_key:x.jurisdiction||'US',source_time:x.scheduled_at,received_time:x.observed_at||now,available_time:now,release_id:x.event_id,scheduled_at:x.scheduled_at,revision:x.revision??0,provider_event_id:x.event_id,payload:x});
        lastCalendar=now;health.calendar={status:result.available?'FRESH':'DEGRADED',eventCount:(result.items||[]).length,updatedAt:now};
        await runtime.updateWatermark('macro-calendar','US',{status:health.calendar.status,last_sequence:null,last_source_time:now,last_received_time:now,last_available_time:now,gap_count:0,metadata:{sources:result.sourceVersions||[]}});
      }catch(e){health.calendar={status:'DEGRADED',error:String(e?.message||e),updatedAt:now}}
    }
    await new Promise(r=>setTimeout(r,5000));
  }
}
function streamFresh(market,symbol){
  const h=health?.[market]||{};
  const age=h.lastMessageAt!=null?Date.now()-Number(h.lastMessageAt):Infinity;
  const transportFresh=(h.state==='LIVE'||h.state==='RESYNC_REQUIRED')&&!h.silent&&age<30000;
  return transportFresh;
}
async function recordSelectorFallback(list,reason){
  const now=Date.now(),bucket=Math.floor(now/300000)*300000,rows=[];
  for(const symbol of list){
    const spotFresh=streamFresh('binanceSpot',symbol),futuresFresh=streamFresh('binanceFutures',symbol);
    const both=spotFresh&&futuresFresh;
    const snapshot={
      spec_version:'selector-runtime-ws-v1',
      snapshot_id:['runtime-ws',symbol,bucket].join(':'),
      decision_time:new Date(now).toISOString(),
      data_cutoff:new Date(now).toISOString(),
      symbol,
      instrument_id:'binance:'+symbol+':perpetual',
      timeframe:'realtime',
      classification:'INSUFFICIENT_DATA',
      rank:null,
      scores:{final_score:0,market_quality:null,ict_setup:null,execution_quality:null,derivatives_context:null,onchain_context:null,data_quality:both?80:(spotFresh||futuresFresh?55:20)},
      evidence_context:{runtime:{spotFresh,futuresFresh,reason:String(reason||'deep scan pending')}},
      evidence:[{type:'RUNTIME_FALLBACK',value:both?'spot+futures websocket fresh':'partial websocket coverage'}],
      input_hash:['runtime-ws',symbol,bucket,spotFresh?'s1':'s0',futuresFresh?'f1':'f0'].join(':')
    };
    const raw={schemaVersion:'SELECTOR_RAW_INPUT_RUNTIME_WS_v1',snapshotId:snapshot.snapshot_id,symbol,capturedAt:now,health:{spotFresh,futuresFresh},reason:String(reason||'deep scan pending')};
    try{await selectorStore.putSelectorSnapshot(snapshot.snapshot_id,snapshot);await selectorStore.putSelectorRaw(snapshot.snapshot_id,raw);rows.push(snapshot.snapshot_id)}catch(e){health.errors.push({source:'selector-fallback',at:Date.now(),error:String(e?.message||e)})}
  }
  return rows;
}
async function runVercelSelectorFallback(list){
  const base=String(env.VERCEL_SCAN_URL||'https://pulse-radar-pro-v3.vercel.app/api/coin-scan').replace(/\/$/,'');
  const deepLimit=Math.max(5,Math.min(30,Number(env.SELECTOR_DEEP_LIMIT||20)));
  async function getJson(url,timeoutMs){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{
      const res=await fetch(url,{signal:ctrl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Render-Fallback/1.0'}});
      if(!res.ok)throw new Error('Vercel scan HTTP '+res.status);
      return await res.json();
    }finally{clearTimeout(timer)}
  }
  const timeoutMs=Number(env.VERCEL_SCAN_TIMEOUT_MS||45000);
  const firstUrl=base+'?mode=selector-compact&deepLimit='+deepLimit+'&precision=true&t='+Date.now();
  const first=await getJson(firstUrl,timeoutMs);
  let body=first;
  if(!body?.autoScreening||!Array.isArray(body.autoScreening.all)||!body.autoScreening.all.length){
    const candidates=(Array.isArray(first?.candidateSymbols)?first.candidateSymbols:[]).map(x=>String(x||'').toUpperCase()).filter(Boolean).slice(0,deepLimit);
    if(!candidates.length)throw new Error('Vercel whole-market scan returned no candidate symbols');
    const deepUrl=base+'?mode=deep&symbols='+encodeURIComponent(candidates.join(','))+'&limit='+candidates.length+'&precision=true&t='+Date.now();
    body=await getJson(deepUrl,timeoutMs);
  }
  if(body?.status!=='ok'||!body?.autoScreening||!Array.isArray(body.autoScreening.all)||!body.autoScreening.all.length)throw new Error('Vercel deep scan missing autoScreening');
  const rawBySymbol=new Map((body.items||[]).map(item=>[
    String(item.symbol||'').toUpperCase(),
    {row:{symbol:item.symbol,item},execution:null,intelligence:item.marketIntelligence||{}}
  ]));
  const recording=await selectorLedger.observe({
    screeningBundle:body.autoScreening,
    rawBySymbol,
    context:{capturedAt:body.updatedAt||Date.now(),marketSource:body.marketSource||'vercel-two-stage',derivativesSource:body.derivativesSource||null}
  });
  return{body,recording,wholeMarket:{scanCount:first?.scanCount||first?.universeMeta?.count||0,candidateCount:(first?.candidateSymbols||[]).length}};
}

async function runSelectorScanner(){
  const interval=Math.max(60000,Number(env.SELECTOR_SCAN_INTERVAL_MS||900000));
  const timeoutMs=Math.max(15000,Number(env.SELECTOR_SCAN_TIMEOUT_MS||45000));
  const preferRemote=String(env.SELECTOR_REMOTE_FIRST||'1')!=='0';
  await new Promise(r=>setTimeout(r,Number(env.SELECTOR_SCAN_START_DELAY_MS||12000)));
  while(true){
    const list=symbols();
    let remoteError=null,localError=null;
    if(preferRemote){
      try{
        const remote=await runVercelSelectorFallback(list);
        health.selector={status:'REMOTE_PRIMARY',updatedAt:Date.now(),symbols:list,wholeMarket:remote.wholeMarket||null,deepScanCount:remote.body?.deepScanCount||0,recording:remote.recording||null,screening:remote.body?.autoScreeningMeta||null};
        await new Promise(r=>setTimeout(r,interval));
        continue;
      }catch(e){remoteError=e}
    }
    try{
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('selector deep scan timeout')),timeoutMs));
      const result=await Promise.race([selectorScanService.run({mode:'deep',symbols:list,limit:list.length,precision:true}),timeout]);
      health.selector={status:'LOCAL_FALLBACK',updatedAt:Date.now(),symbols:list,deepScanCount:result.deepScanCount||0,recording:result.selectorRecording||null,screening:result.autoScreeningMeta||null,remoteError:remoteError?String(remoteError?.message||remoteError):null};
    }catch(e){
      localError=e;
      if(!preferRemote){
        try{
          const remote=await runVercelSelectorFallback(list);
          health.selector={status:'REMOTE_FALLBACK',updatedAt:Date.now(),symbols:list,wholeMarket:remote.wholeMarket||null,deepScanCount:remote.body?.deepScanCount||0,recording:remote.recording||null,screening:remote.body?.autoScreeningMeta||null,localError:String(e?.message||e)};
          await new Promise(r=>setTimeout(r,interval));
          continue;
        }catch(re){remoteError=re}
      }
      const fallbackIds=await recordSelectorFallback(list,[remoteError,localError].filter(Boolean).map(x=>String(x?.message||x)).join(' | '));
      health.selector={status:'PARTIAL',updatedAt:Date.now(),symbols:list,fallbackSnapshots:fallbackIds.length,error:localError?String(localError?.message||localError):null,remoteError:remoteError?String(remoteError?.message||remoteError):null};
      if(localError)health.errors.push({source:'selector',at:Date.now(),error:String(localError?.message||localError)});
      if(remoteError)health.errors.push({source:'selector-vercel-fallback',at:Date.now(),error:String(remoteError?.message||remoteError)});
    }
    await new Promise(r=>setTimeout(r,interval));
  }
}

function corsHeaders(){return {'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type','cache-control':'no-store'}}
function jsonResponse(res,status,payload){res.writeHead(status,{'content-type':'application/json; charset=utf-8',...corsHeaders()});return res.end(JSON.stringify(payload))}
function numParam(v){const x=Number(v);return Number.isFinite(x)?x:null}
function astraMarketFrom(u){return{regime:String(u.searchParams.get('regime')||'NEUTRAL').toUpperCase(),breadthRatio:numParam(u.searchParams.get('breadth')),btc24hChange:numParam(u.searchParams.get('btc')),eth24hChange:numParam(u.searchParams.get('eth')),median24hChange:numParam(u.searchParams.get('median')),positiveVolumeRatio:numParam(u.searchParams.get('positiveVolumeRatio')),volumeWeightedBreadth:numParam(u.searchParams.get('volumeWeightedBreadth')),oiScanDegraded:String(u.searchParams.get('oiDegraded')||'').toLowerCase()==='true',grokOiCut:numParam(u.searchParams.get('grokOiCut'))}}
function astraSymbols(u){return String(u.searchParams.get('symbols')||'').split(',').map(x=>x.trim()).filter(Boolean)}
async function serveRepoFile(res,rel,contentType){try{const body=await fs.readFile(new URL('../'+rel,import.meta.url));res.writeHead(200,{'content-type':contentType,'cache-control':'no-cache'});return res.end(body)}catch(e){return jsonResponse(res,404,{status:'error',error:'static file unavailable',file:rel,detail:String(e?.message||e)})}}
function server(){
  const port=Number(env.PORT||8787);
  return http.createServer(async(req,res)=>{
    if(req.method==='OPTIONS'){res.writeHead(204,corsHeaders());return res.end()}
    const route=new URL(req.url,'http://runtime.local');
    if(route.pathname==='/api/astra-scan'){
      const stage=String(route.searchParams.get('stage')||'universe').toLowerCase(),method=astraMethodOf(route.searchParams.get('method'));
      try{
        if(stage==='universe')return jsonResponse(res,200,await astraScanner.universe({method}));
        const symbols=astraSymbols(route);if(!symbols.length)return jsonResponse(res,400,{status:'error',version:ASTRA_VERSION,method,error:'symbols required'});
        if(stage==='oi')return jsonResponse(res,200,await astraScanner.oi(symbols,{method,asOf:numParam(route.searchParams.get('asOf')),market:astraMarketFrom(route)}));
        if(stage==='deep')return jsonResponse(res,200,await astraScanner.deep(symbols,{method,asOf:numParam(route.searchParams.get('asOf')),market:astraMarketFrom(route)}));
        return jsonResponse(res,400,{status:'error',version:ASTRA_VERSION,method,error:'unknown stage'});
      }catch(e){return jsonResponse(res,502,{status:'error',version:ASTRA_VERSION,method,stage,updatedAt:Date.now(),error:String(e?.message||e)})}
    }
    if(req.method==='GET'&&(route.pathname==='/astra-scan'||route.pathname==='/astra-scan.html'))return serveRepoFile(res,'astra-scan.html','text/html; charset=utf-8');
    if(req.method==='GET'&&route.pathname==='/ui/astra-scan.js')return serveRepoFile(res,'ui/astra-scan.js','application/javascript; charset=utf-8');
    if(req.method==='GET'&&route.pathname==='/ui/astra-scan.css')return serveRepoFile(res,'ui/astra-scan.css','text/css; charset=utf-8');
    if(req.method==='GET'&&route.pathname==='/ui/pulse-child-normalize.css')return serveRepoFile(res,'ui/pulse-child-normalize.css','text/css; charset=utf-8');
    if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({...health,uptimeMs:Date.now()-health.startedAt}))}
    if(req.url==='/ready'){const bad=x=>['DEGRADED','CONFLICTED','STALE'].includes(String(x?.status||x?.state||''));const ok=!bad(health.evm)&&!bad(health.binanceSpot)&&!bad(health.binanceFutures)&&!bad(health.queues);res.writeHead(ok?200:503,{'content-type':'application/json'});return res.end(JSON.stringify({ready:ok,health}))}
    if(req.url==='/'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({service:'pulseradar-selector-runtime',status:'ok',health:'/health',ready:'/ready',stats:'/stats'}))}
    {
      const u=new URL(req.url,'http://runtime.local');
      if(u.pathname==='/selector-latest'){
        try{
          const limit=Math.max(1,Math.min(200,Number(u.searchParams.get('limit'))||100));
          const rows=await query(`
            SELECT payload FROM (
              SELECT DISTINCT ON (symbol) symbol, decision_time, payload
              FROM selector_snapshots
              ORDER BY symbol, decision_time DESC
            ) latest
            ORDER BY decision_time DESC
            LIMIT $1
          `,[limit]);
          const payload={status:'ok',mode:'selector-latest',updatedAt:Date.now(),wholeMarket:health.selector?.wholeMarket||null,screening:health.selector?.screening||null,items:(rows.rows||[]).map(x=>x.payload)};
          res.writeHead(200,{'content-type':'application/json',...corsHeaders()});return res.end(JSON.stringify(payload));
        }catch(e){res.writeHead(500,{'content-type':'application/json'});return res.end(JSON.stringify({status:'error',error:String(e?.message||e)}))}
      }
      if(u.pathname==='/selector-history'){
        try{
          const action=String(u.searchParams.get('action')||'list').toLowerCase();
          const symbol=u.searchParams.get('symbol')||null;
          const limit=Math.max(1,Math.min(1000,Number(u.searchParams.get('limit'))||500));
          let payload;
          if(action==='transitions')payload={status:'ok',mode:'selector-history',action,items:await selectorLedger.transitions({symbol,limit})};
          else if(action==='evidence')payload={status:'ok',mode:'selector-history',action,items:await selectorLedger.evidence({symbol,limit})};
          else if(action==='stats')payload={status:'ok',mode:'selector-history',action,stats:await selectorLedger.stats({lockedOosStart:Number(u.searchParams.get('lockedOosStart'))||null})};
          else if(action==='ablation')payload={status:'ok',mode:'selector-history',action,report:await selectorLedger.ablation({horizon:String(u.searchParams.get('horizon')||'h24'),feeBps:Number(u.searchParams.get('feeBps'))||0,slippageBps:Number(u.searchParams.get('slippageBps'))||0,fundingBps:Number(u.searchParams.get('fundingBps'))||0})};
          else if(action==='replay'){const id=String(u.searchParams.get('id')||'');payload={status:'ok',mode:'selector-history',action,replay:await selectorLedger.replay(id)}}
          else {
            const classification=u.searchParams.get('classification')||null;
            let rows;
            if(symbol&&classification){
              rows=await query('SELECT payload FROM selector_snapshots WHERE symbol=$1 AND classification=$2 ORDER BY decision_time DESC LIMIT $3',[String(symbol).toUpperCase(),String(classification).toUpperCase(),limit]);
            }else if(symbol){
              rows=await query('SELECT payload FROM selector_snapshots WHERE symbol=$1 ORDER BY decision_time DESC LIMIT $2',[String(symbol).toUpperCase(),limit]);
            }else if(classification){
              rows=await query('SELECT payload FROM selector_snapshots WHERE classification=$1 ORDER BY decision_time DESC LIMIT $2',[String(classification).toUpperCase(),limit]);
            }else{
              rows=await query('SELECT payload FROM selector_snapshots ORDER BY decision_time DESC LIMIT $1',[limit]);
            }
            payload={status:'ok',mode:'selector-history',action:'list',items:(rows.rows||[]).map(x=>x.payload)};
          }
          res.writeHead(200,{'content-type':'application/json',...corsHeaders()});return res.end(JSON.stringify(payload));
        }catch(e){res.writeHead(500,{'content-type':'application/json'});return res.end(JSON.stringify({status:'error',error:String(e?.message||e)}))}
      }
    }
    if(req.url==='/stats'){
      try{
        const [raw,bySource,watermarks]=await Promise.all([
          query("SELECT count(*)::int AS raw_events, min(created_at) AS first_event_at, max(created_at) AS last_event_at FROM raw_events"),
          query("SELECT source_name, count(*)::int AS events FROM raw_events GROUP BY source_name ORDER BY events DESC"),
          query("SELECT source_name, entity_key, status, last_sequence, updated_at FROM source_watermarks ORDER BY updated_at DESC LIMIT 100")
        ]);
        res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({status:'ok',raw:raw.rows?.[0]||{},bySource:bySource.rows||[],watermarks:watermarks.rows||[],health}));
      }catch(e){res.writeHead(500,{'content-type':'application/json'});return res.end(JSON.stringify({status:'error',error:String(e?.message||e)}))}
    }
    if(req.url==='/webhook/alchemy'&&req.method==='POST'){
      let raw='';for await(const chunk of req)raw+=chunk;
      const parsed=normalizeAlchemy(raw,{signatureHeader:req.headers['x-alchemy-signature'],signingKey:env.ALCHEMY_WEBHOOK_SIGNING_KEY,receivedAt:Date.now()});
      if(!parsed.ok){
        if(parsed.dlq)await runtime.journal.deadLetter('alchemy:'+Date.now(),parsed.error);
        res.writeHead(parsed.status,{'content-type':'application/json'});return res.end(JSON.stringify({status:'error',error:parsed.error}));
      }
      const event=await runtime.ingest(parsed.event);
      await runtime.journal.enqueue('RPC_VERIFY',event.event_id,'webhook finality verification required');
      if(store?.enqueue)await store.enqueue({queue_name:'rpc_verify',event_id:event.event_id,idempotency_key:'rpc_verify:'+event.event_id,payload:event,next_attempt_at:Date.now()});
      res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({status:'accepted',eventId:event.event_id,finality:'RPC_PENDING'}));
    }
    res.writeHead(404);res.end('not found');
  }).listen(port,'0.0.0.0');
}
await migrate();
server();
runEvm();
runBinance();
runQueues();
runEvidencePollers();
runSelectorScanner();
process.on('SIGTERM',()=>{process.exit(0)});

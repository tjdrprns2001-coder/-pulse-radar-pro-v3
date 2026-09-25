import fs from 'node:fs/promises';
import http from 'node:http';
import pg from 'pg';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createRpcClient,createEvmCollector}=require('../lib/coin-scan/evm-rpc-collector.js');
const {createBinanceWsMultiplexer}=require('../lib/coin-scan/binance-ws-multiplexer.js');
const {createPostgresRuntimeStore}=require('../lib/coin-scan/postgres-runtime-store.js');
const {createRuntimeWorker}=require('../lib/coin-scan/runtime-worker.js');
const {normalizeAlchemy}=require('../lib/coin-scan/alchemy-webhook.js');

const {Pool}=pg;
const env=process.env;
const DB_URL=env.DATABASE_URL;
if(!DB_URL)throw new Error('DATABASE_URL required');

const pool=new Pool({connectionString:DB_URL,max:Number(env.PG_POOL_MAX||5),ssl:env.PG_SSL==='0'?false:{rejectUnauthorized:false}});
const query=(sql,params=[])=>pool.query(sql,params);
const store=createPostgresRuntimeStore({query});
const runtime=createRuntimeWorker({store});
const health={startedAt:Date.now(),evm:{status:'INIT'},binanceSpot:{status:'INIT'},binanceFutures:{status:'INIT'},queues:{status:'INIT'},errors:[]};
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
  const streams=symbols().map(s=>s.toLowerCase()+'@depth@100ms'),source=market==='futures'?'binance-futures-ws':'binance-spot-ws';
  const mux=createBinanceWsMultiplexer({
    url:market==='futures'?'wss://fstream.binance.com/stream':'wss://stream.binance.com:9443/stream',
    restSnapshot:(stream)=>depthSnapshot(stream,market),
    onEvent:async({stream,data,receivedAt})=>{
      if(!/depth/i.test(stream)||data.u==null)return;
      const symbol=stream.split('@')[0].toUpperCase();
      await runtime.ingest({source_name:source,source_kind:'orderbook',entity_key:symbol,source_time:Number(data.E)||receivedAt,received_time:receivedAt,available_time:receivedAt,venue:'binance',market_type:market,symbol,update_id:Number(data.u),sequence_no:Number(data.u),payload:data});
      await runtime.updateWatermark(source,symbol,{status:'FRESH',last_sequence:Number(data.u),last_source_time:Number(data.E)||receivedAt,last_received_time:receivedAt,last_available_time:receivedAt,gap_count:0,metadata:{stream,market}});
    },
    onState:s=>{const key=market==='futures'?'binanceFutures':'binanceSpot';health[key]={...s,updatedAt:Date.now(),market}},
    maxStreams:Number(env.BINANCE_MAX_STREAMS||200)
  });
  mux.subscribe(streams);mux.connect();return mux;
}
async function runBinance(){
  const spot=createBinanceRuntime({market:'spot'}),futures=createBinanceRuntime({market:'futures'});
  setInterval(()=>{health.binanceSpot={...health.binanceSpot,...spot.heartbeat(),updatedAt:Date.now()};health.binanceFutures={...health.binanceFutures,...futures.heartbeat(),updatedAt:Date.now()}},5000).unref();
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
function server(){
  const port=Number(env.PORT||8787);
  return http.createServer(async(req,res)=>{
    if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({...health,uptimeMs:Date.now()-health.startedAt}))}
    if(req.url==='/ready'){const bad=x=>['DEGRADED','CONFLICTED','STALE'].includes(String(x?.status||x?.state||''));const ok=!bad(health.evm)&&!bad(health.binanceSpot)&&!bad(health.binanceFutures)&&!bad(health.queues);res.writeHead(ok?200:503,{'content-type':'application/json'});return res.end(JSON.stringify({ready:ok,health}))}
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
process.on('SIGTERM',async()=>{await pool.end();process.exit(0)});

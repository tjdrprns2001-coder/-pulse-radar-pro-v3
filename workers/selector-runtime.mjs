import fs from 'node:fs/promises';
import http from 'node:http';
import pg from 'pg';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createRpcClient,createEvmCollector}=require('../lib/coin-scan/evm-rpc-collector.js');
const {createBinanceWsMultiplexer}=require('../lib/coin-scan/binance-ws-multiplexer.js');
const {createPostgresRuntimeStore}=require('../lib/coin-scan/postgres-runtime-store.js');
const {createRuntimeWorker}=require('../lib/coin-scan/runtime-worker.js');

const {Pool}=pg;
const env=process.env;
const DB_URL=env.DATABASE_URL;
if(!DB_URL)throw new Error('DATABASE_URL required');

const pool=new Pool({connectionString:DB_URL,max:Number(env.PG_POOL_MAX||5),ssl:env.PG_SSL==='0'?false:{rejectUnauthorized:false}});
const query=(sql,params=[])=>pool.query(sql,params);
const store=createPostgresRuntimeStore({query});
const runtime=createRuntimeWorker({store});
const health={startedAt:Date.now(),evm:{status:'INIT'},binance:{status:'INIT'},errors:[]};

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
  const collector=createEvmCollector({chainId:env.EVM_CHAIN_ID||'1',primary,secondary,confirmations:Number(env.EVM_CONFIRMATIONS||12),finalityBlocks:Number(env.EVM_FINALITY_BLOCKS||64)});
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
async function depthSnapshot(stream){
  const symbol=String(stream).split('@')[0].toUpperCase();
  const r=await fetch('https://api.binance.com/api/v3/depth?symbol='+encodeURIComponent(symbol)+'&limit=1000');
  if(!r.ok)throw new Error('Binance depth HTTP '+r.status);
  return r.json();
}
async function runBinance(){
  const streams=symbols().map(s=>s.toLowerCase()+'@depth@100ms');
  const mux=createBinanceWsMultiplexer({
    restSnapshot:depthSnapshot,
    onEvent:async({stream,data,receivedAt})=>{
      if(!/depth/i.test(stream)||data.u==null)return;
      const symbol=stream.split('@')[0].toUpperCase();
      await runtime.ingest({source_name:'binance-ws',source_kind:'orderbook',entity_key:symbol,source_time:Number(data.E)||receivedAt,received_time:receivedAt,available_time:receivedAt,venue:'binance',symbol,update_id:Number(data.u),sequence_no:Number(data.u),payload:data});
      await runtime.updateWatermark('binance-ws',symbol,{status:'FRESH',last_sequence:Number(data.u),last_source_time:Number(data.E)||receivedAt,last_received_time:receivedAt,last_available_time:receivedAt,gap_count:0,metadata:{stream}});
    },
    onState:s=>{health.binance={...s,updatedAt:Date.now()}},
    maxStreams:Number(env.BINANCE_MAX_STREAMS||200)
  });
  mux.subscribe(streams);mux.connect();
  setInterval(()=>{health.binance={...health.binance,...mux.heartbeat(),updatedAt:Date.now()}},5000).unref();
}
function server(){
  const port=Number(env.PORT||8787);
  return http.createServer(async(req,res)=>{
    if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({...health,uptimeMs:Date.now()-health.startedAt}))}
    if(req.url==='/ready'){const ok=!['DEGRADED','CONFLICTED'].includes(health.evm.status)&&health.binance.state!=='RESYNC_REQUIRED';res.writeHead(ok?200:503,{'content-type':'application/json'});return res.end(JSON.stringify({ready:ok,health}))}
    res.writeHead(404);res.end('not found');
  }).listen(port,'0.0.0.0');
}
await migrate();
server();
runEvm();
runBinance();
process.on('SIGTERM',async()=>{await pool.end();process.exit(0)});

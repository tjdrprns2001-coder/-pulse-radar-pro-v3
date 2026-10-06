'use strict';
const {Journal}=require('./journal'),{MultiProvider}=require('./multi-provider'),{Service}=require('./service');
let service=null,timer=null,active=false;
function getService(){
 if(!service){let journal;
  if(process.env.CHARTBRO_POSTGRES_ENABLED==='1'){
   const url=process.env.CHARTBRO_DATABASE_URL;if(!url)throw new Error('ChartBro PostgreSQL connection required');
   let pg;try{pg=require('pg');}catch{pg=require('../../workers/node_modules/pg');}
   journal=new(require('./postgres-journal').PostgresJournal)({pool:new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:10000})});
  }else journal=new Journal({dir:process.env.CHARTBRO_DATA_DIR||null});
  service=new Service({provider:new MultiProvider(),journal});
 }return service;
}
async function withService(fn){const s=getService();try{return s.journal.run?await s.journal.run(()=>fn(s)):await fn(s);}catch(e){s.cache.clear();throw e;}}
function startWorker(){if(timer)return;if(!process.env.CHARTBRO_DATA_DIR&&process.env.CHARTBRO_POSTGRES_ENABLED!=='1')throw new Error('Durable storage required for worker');timer=setInterval(async()=>{if(active)return;active=true;try{await withService(s=>s.backgroundCycle(workerConfig()));}catch(e){console.error('ChartBro worker:',e.message);}finally{active=false;}},1000);timer.unref();}
function workerConfig(env=process.env){const allowed=['binance','bybit','okx','bitget','gate'];return {enabled:env.CHARTBRO_SCHEDULE_ENABLED==='1',venues:[...new Set((env.CHARTBRO_SCHEDULE_VENUES||'okx,bybit,bitget,gate,binance').split(',').filter(v=>allowed.includes(v)))],interval_ms:Math.min(86400000,Math.max(300000,Number(env.CHARTBRO_SCHEDULE_INTERVAL_MS)||3600000)),volume_cut:env.CHARTBRO_SCHEDULE_VOLUME_CUT==='1',flow:env.CHARTBRO_SCHEDULE_FLOW!=='0',timeframes:['1w','1d','12h','4h','1h','15m','5m']};}
module.exports={getService,withService,startWorker,workerConfig};

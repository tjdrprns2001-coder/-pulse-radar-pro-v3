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
function startWorker(){if(timer)return;if(!process.env.CHARTBRO_DATA_DIR&&process.env.CHARTBRO_POSTGRES_ENABLED!=='1')throw new Error('Durable storage required for worker');timer=setInterval(async()=>{if(active)return;active=true;try{await withService(s=>s.tick());}catch(e){console.error('ChartBro worker:',e.message);}finally{active=false;}},1000);timer.unref();}
module.exports={getService,withService,startWorker};

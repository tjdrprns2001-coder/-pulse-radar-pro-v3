'use strict';
const assert=require('assert');
const {createPostgresStore,createPersistence}=require('../lib/chart-v1/persistence.js');
const {createChartRuntime}=require('../lib/chart-v1/runtime.js');
(async()=>{
  const executed=[];
  const client={
    async query(sql,args=[]){
      executed.push(String(sql));
      if(String(sql).includes('SELECT payload FROM chart_v1_snapshots'))return{rows:[{payload:{probe:'chart_v1_pg_roundtrip'}}]};
      return{rows:[],rowCount:1};
    },
    release(){}
  };
  class Pool{
    constructor(){this.totalCount=1}
    async connect(){return client}
    async query(sql){executed.push(String(sql));return{rows:[{now:new Date().toISOString(),events:'0',alerts:'0',candles:'0',derivatives:'0'}]}}
    async end(){}
  }
  const s=createPostgresStore({connectionString:'postgres://unit:password@127.0.0.1:5432/unit',PoolCtor:Pool});
  assert.equal(s.kind,'postgres');
  await s.init();
  const h=await s.health();
  assert.equal(h.write_read_smoke,'passed');assert.equal(h.migration_status,'ready');
  assert(executed.some(x=>x.includes('CREATE TABLE IF NOT EXISTS chart_v1_events')));
  assert(executed.some(x=>x.includes('INSERT INTO chart_v1_snapshots')));
  assert(executed.includes('ROLLBACK'));
  const runtime=createChartRuntime({provider:{},persistence:s,WebSocketCtor:class{}});
  const ready=await runtime.health();assert.equal(ready.storage_ready,true);
  const failingStore={kind:'postgres',durable:true,async init(){throw Error('connect failed')},async health(){throw Error('not connected')}};
  const failingRuntime=createChartRuntime({provider:{},persistence:failingStore,WebSocketCtor:class{}});
  await assert.rejects(failingRuntime.init(),/connect failed/);
  const degraded=await failingRuntime.health();assert.equal(degraded.storage_ready,false);assert.equal(degraded.production_readiness,'degraded');
  assert.equal(degraded.reason,'postgres_startup_failed');
  const file=createPersistence({connectionString:null,PoolCtor:Pool,file:'/tmp/verification.json'}); // unconfigured environment must remain transparently degraded
  assert(['file','postgres'].includes(file.kind));
  console.log('chart Postgres readiness PASS');
})().catch(e=>{console.error(e);process.exit(1)});

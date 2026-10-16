'use strict';
const assert=require('node:assert/strict');
const {createPostgresStore,createFileStore}=require('../lib/chart-v1/persistence.js');
let poolOptions=[],queries=[];
class FakePool {
  constructor(options){this.options=options;poolOptions.push(options);}
  async connect(){return {query:async(sql)=>{queries.push(sql);
    if(sql.includes('SELECT payload FROM chart_v1_snapshots'))return {rows:[{payload:{probe:'chart_v1_pg_roundtrip'}}]};
    return {rows:[],rowCount:0};
  },release(){}}}
  async query(sql){queries.push(sql);return {rows:[],rowCount:0}}
  async end(){}
}
async function main(){
  assert.equal(createFileStore().durable,false);
  assert.throws(()=>createPostgresStore({connectionString:'postgres://fake/test',PoolCtor:FakePool,schemaName:'public;DROP TABLE users'}),/invalid CHART_V1_DB_SCHEMA/);
  assert.throws(()=>createPostgresStore({connectionString:'postgres://fake/test',PoolCtor:FakePool,schemaName:'BadCamelCase'}),/invalid CHART_V1_DB_SCHEMA/);
  const store=createPostgresStore({connectionString:'postgres://fake/test',PoolCtor:FakePool,schemaName:'chart_v1_unified'});
  assert.equal(store.schema,'chart_v1_unified');
  assert.equal(poolOptions[0].options,'-c search_path=chart_v1_unified');
  await store.init();
  assert.equal(queries[0],'CREATE SCHEMA IF NOT EXISTS "chart_v1_unified"');
  assert(queries.some(q=>q.includes('CREATE TABLE IF NOT EXISTS chart_v1_events')));
  assert(queries.some(q=>q.includes('SELECT payload FROM chart_v1_snapshots')));
  await store.close();
  queries=[];poolOptions=[];
  const legacy=createPostgresStore({connectionString:'postgres://fake/test',PoolCtor:FakePool,schemaName:null});
  assert.equal(legacy.schema,'public');
  assert.equal(poolOptions[0].options,undefined);
  await legacy.init();
  assert(!queries.some(q=>q.startsWith('CREATE SCHEMA')),'Default deployment must not silently change schema');
  await legacy.close();
  console.log('ChartBro opt-in Postgres schema isolation PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

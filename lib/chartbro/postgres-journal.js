'use strict';
const {Journal}=require('./journal'),{copy}=require('./data');
const SCHEMA=`CREATE TABLE IF NOT EXISTS chartbro_runtime_events (seq bigserial PRIMARY KEY, table_name text NOT NULL, record_id text NOT NULL, operation text NOT NULL CHECK(operation IN ('put','project')), value jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS chartbro_runtime_records (table_name text NOT NULL, record_id text NOT NULL, value jsonb NOT NULL, PRIMARY KEY(table_name,record_id));`;
/** Global advisory lock serializes requests and worker stages across processes.
 * No success response is emitted until COMMIT; failed transactions restore memory.
 * Intended for a small initial workload; reads reload the current projection. */
class PostgresJournal extends Journal {
 constructor({pool}){super();if(!pool?.connect)throw new Error('PostgreSQL pool required');this.pool=pool;this.durable=true;this.kind='postgres';this.tail=Promise.resolve();this.pending=null;this.ready=null;}
 append(e){if(!this.pending)throw new Error('PostgreSQL writes require transaction');super.append(e);this.pending.push(copy(e));}
 run(fn){const execute=async()=>{
  const client=await this.pool.connect();let before=null;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '15s'");await client.query('SELECT pg_advisory_xact_lock(19761004,1)');
   if(!this.ready){await client.query(SCHEMA);this.ready=true;}
   const rows=await client.query('SELECT table_name,record_id,value FROM chartbro_runtime_records');
   this.tables=new Map();for(const r of rows.rows)this.apply({op:'put',table:r.table_name,id:r.record_id,value:r.value});
   before=this.tables;this.tables=new Map([...before].map(([k,v])=>[k,new Map(v)]));this.pending=[];
   const result=await fn();
   for(const e of this.pending){
    await client.query('INSERT INTO chartbro_runtime_events(table_name,record_id,operation,value) VALUES($1,$2,$3,$4::jsonb)',[e.table,e.id,e.op,JSON.stringify(e.value)]);
    await client.query('INSERT INTO chartbro_runtime_records(table_name,record_id,value) VALUES($1,$2,$3::jsonb) ON CONFLICT(table_name,record_id) DO UPDATE SET value=EXCLUDED.value',[e.table,e.id,JSON.stringify(e.value)]);
   }
   await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK').catch(()=>{});if(before)this.tables=before;this.ready=null;throw e;}
  finally{this.pending=null;client.release();}
 };const result=this.tail.then(execute,execute);this.tail=result.catch(()=>{});return result;}
}
module.exports={PostgresJournal,SCHEMA};

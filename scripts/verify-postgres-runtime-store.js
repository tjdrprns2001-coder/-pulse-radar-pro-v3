const assert=require('assert');
const {createPostgresRuntimeStore}=require('../lib/coin-scan/postgres-runtime-store.js');

(async()=>{
  const calls=[];
  async function query(sql,params){calls.push({sql,params});if(/SELECT \* FROM raw_events WHERE event_id/.test(sql))return{rows:[{event_id:params[0]}]};if(/SELECT \* FROM source_watermarks/.test(sql))return{rows:[{source_name:params[0],entity_key:params[1]}]};if(/RETURNING q\.\*/.test(sql))return{rows:[{job_id:1,queue_name:params[0],attempts:1}]};return{rows:[]}}
  const s=createPostgresRuntimeStore({query});
  await s.appendRaw({event_id:'e1',source_name:'x',source_kind:'news',entity_key:'BTC',source_time:1,received_time:2,available_time:3,sequence_no:null,provider_event_id:'p',idempotency_key:'i',payload_hash:'h',schema_version:'v1',delivery_attempt:1,payload:{a:1},ingest_status:'RECEIVED',duplicate_of:null,correction_of:null});
  assert((await s.getRaw('e1')).event_id==='e1');
  await s.upsertWatermark({source_name:'x',entity_key:'BTC',last_sequence:1,last_source_time:1,last_received_time:2,last_available_time:3,status:'FRESH',gap_count:0,metadata:{}});
  assert.equal((await s.getWatermark('x','BTC')).entity_key,'BTC');
  await s.enqueue({queue_name:'retry',event_id:'e1',idempotency_key:'q1',payload:{},next_attempt_at:1000});
  const jobs=await s.claimJobs('retry',5);assert.equal(jobs.length,1);
  await s.completeJob(1);await s.retryJob(1,'err',2000);
  await s.deadLetter({event_id:'e1',source_name:'x',reason:'bad',payload:{}});
  await s.correction({correction_id:'c1',original_snapshot_id:'s1',corrected_snapshot_id:'s2',reason:'reorg'});
  await s.appendChainBlock({chain_id:'1',block_number:100,block_hash:'0xabc',status:'CANONICAL'});
  assert(calls.some(x=>x.sql.includes('FOR UPDATE SKIP LOCKED')));
  assert(calls.some(x=>x.sql.includes('selector_corrections')));
  console.log('postgres runtime store PASS');
})().catch(e=>{console.error(e);process.exit(1)});

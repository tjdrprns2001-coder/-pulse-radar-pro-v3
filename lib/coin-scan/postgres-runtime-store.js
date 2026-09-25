'use strict';
function createPostgresRuntimeStore({query}={}){
  if(typeof query!=='function')throw new Error('query function required');
  async function appendRaw(e){
    const sql=`INSERT INTO raw_events(event_id,source_name,source_kind,entity_key,source_time,received_time,available_time,sequence_no,provider_event_id,idempotency_key,payload_hash,schema_version,delivery_attempt,payload,ingest_status,duplicate_of,correction_of)
VALUES($1,$2,$3,$4,to_timestamp($5/1000.0),to_timestamp($6/1000.0),CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7/1000.0) END,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17)
ON CONFLICT(event_id) DO NOTHING RETURNING event_id`;
    const p=[e.event_id,e.source_name,e.source_kind,e.entity_key,e.source_time,e.received_time,e.available_time,e.sequence_no,e.provider_event_id,e.idempotency_key,e.payload_hash,e.schema_version,e.delivery_attempt,JSON.stringify(e.payload),e.ingest_status,e.duplicate_of,e.correction_of];
    return query(sql,p);
  }
  async function upsertWatermark(w){return query(`INSERT INTO source_watermarks(source_name,entity_key,last_sequence,last_source_time,last_received_time,last_available_time,status,gap_count,metadata)
VALUES($1,$2,$3,to_timestamp($4/1000.0),to_timestamp($5/1000.0),to_timestamp($6/1000.0),$7,$8,$9::jsonb)
ON CONFLICT(source_name,entity_key) DO UPDATE SET last_sequence=EXCLUDED.last_sequence,last_source_time=EXCLUDED.last_source_time,last_received_time=EXCLUDED.last_received_time,last_available_time=EXCLUDED.last_available_time,status=EXCLUDED.status,gap_count=EXCLUDED.gap_count,metadata=EXCLUDED.metadata,updated_at=now()`,[w.source_name,w.entity_key,w.last_sequence,w.last_source_time,w.last_received_time,w.last_available_time,w.status,w.gap_count||0,JSON.stringify(w.metadata||{})])}
  async function getWatermark(sourceName,entityKey){
    const r=await query('SELECT source_name,entity_key,last_sequence,EXTRACT(EPOCH FROM last_source_time)*1000 AS last_source_time,EXTRACT(EPOCH FROM last_received_time)*1000 AS last_received_time,EXTRACT(EPOCH FROM last_available_time)*1000 AS last_available_time,status,gap_count,metadata FROM source_watermarks WHERE source_name=$1 AND entity_key=$2',[sourceName,entityKey]);
    return r?.rows?.[0]||null;
  }
  async function enqueue(q){return query(`INSERT INTO worker_queue(queue_name,event_id,idempotency_key,payload,next_attempt_at) VALUES($1,$2,$3,$4::jsonb,to_timestamp($5/1000.0)) ON CONFLICT(queue_name,idempotency_key) DO NOTHING`,[q.queue_name,q.event_id,q.idempotency_key,JSON.stringify(q.payload||{}),q.next_attempt_at||Date.now()])}
  async function deadLetter(d){return query(`INSERT INTO dead_letter_events(event_id,source_name,reason,payload) VALUES($1,$2,$3,$4::jsonb)`,[d.event_id,d.source_name,d.reason,JSON.stringify(d.payload||{})])}
  async function correction(c){return query(`INSERT INTO selector_corrections(correction_id,original_snapshot_id,corrected_snapshot_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT(correction_id) DO NOTHING`,[c.correction_id,c.original_snapshot_id,c.corrected_snapshot_id,c.reason])}
  return{appendRaw,upsertWatermark,getWatermark,enqueue,deadLetter,correction};
}
module.exports={createPostgresRuntimeStore};

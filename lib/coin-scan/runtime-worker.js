'use strict';
const Raw=require('./raw-event-journal.js');
const Resilience=require('./source-resilience.js');
function createRuntimeWorker({journal=Raw.createMemoryRawEventJournal(),store=null,now=()=>Date.now()}={}){
  const watermarks=new Map();
  async function ingest(event){
    const raw=journal.append({...event,received_time:event.received_time??now()});
    if(store?.appendRaw)await store.appendRaw(raw);
    return raw;
  }
  async function processFailure(event,failure){
    const policy=Resilience.classifyRestFailure(failure);
    if(policy.action==='DLQ'){journal.deadLetter(event.event_id,policy.class);if(store?.deadLetter)await store.deadLetter({event_id:event.event_id,source_name:event.source_name,reason:policy.class,payload:event.payload})}
    else if(policy.action==='RETRY'){const q={queue_name:'retry',event_id:event.event_id,idempotency_key:'retry:'+event.event_id,payload:event,next_attempt_at:now()+Resilience.backoffMs(event.delivery_attempt||1)};journal.enqueue('retry',event.event_id,policy.class);if(store?.enqueue)await store.enqueue(q)}
    return policy;
  }
  async function updateWatermark(source,entity,data){
    const key=source+':'+entity,w={source_name:source,entity_key:entity,...data};watermarks.set(key,w);if(store?.upsertWatermark)await store.upsertWatermark(w);return w;
  }
  async function correction(originalSnapshotId,correctedSnapshotId,reason){
    const c={correction_id:'corr:'+originalSnapshotId+':'+correctedSnapshotId,original_snapshot_id:originalSnapshotId,corrected_snapshot_id:correctedSnapshotId,reason};
    if(store?.correction)await store.correction(c);return c;
  }
  return{ingest,processFailure,updateWatermark,correction,journal,watermarks};
}
module.exports={createRuntimeWorker};

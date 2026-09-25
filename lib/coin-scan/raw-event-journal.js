'use strict';
const crypto=require('crypto');

function hash(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}
function keyFor(e={}){
  const k=String(e.source_kind||e.kind||'').toLowerCase();
  if(k==='trade')return [e.venue,e.trade_id].join(':');
  if(k==='orderbook'||k==='order-book')return [e.venue,e.symbol,e.update_id].join(':');
  if(k==='candle')return [e.venue,e.symbol,e.interval,e.open_time].join(':');
  if(k==='evm_log')return [e.chain_id,e.tx_hash,e.log_index].join(':');
  if(k==='evm_transfer')return [e.chain_id,e.tx_hash,e.log_index,e.token_contract].join(':');
  if(k==='webhook')return [e.provider,e.delivery_id||hash(e.payload||'')].join(':');
  if(k==='news')return [e.canonical_url||'',e.content_hash||hash(e.headline||'')].join(':');
  if(k==='calendar')return [e.source_name,e.release_id||e.event_id,e.scheduled_at,e.revision??0].join(':');
  return String(e.provider_event_id||e.event_id||hash(e));
}
function normalizeRawEvent(e={},now=()=>Date.now()){
  const received=Number(e.received_time??e.receivedTime??now());
  return{
    event_id:String(e.event_id||hash([e.source_name,e.source_kind,keyFor(e),received].join('|')).slice(0,32)),
    source_name:String(e.source_name||'unknown'),
    source_kind:String(e.source_kind||e.kind||'unknown'),
    entity_key:e.entity_key??null,
    source_time:e.source_time??e.sourceTime??null,
    received_time:received,
    available_time:e.available_time??e.availableTime??null,
    sequence_no:e.sequence_no??e.sequenceNo??null,
    provider_event_id:e.provider_event_id??e.providerEventId??null,
    idempotency_key:String(e.idempotency_key||keyFor(e)),
    payload_hash:String(e.payload_hash||hash(e.payload??e)),
    schema_version:String(e.schema_version||'raw-event-v1'),
    delivery_attempt:Number(e.delivery_attempt||1),
    payload:e.payload??e,
    ingest_status:String(e.ingest_status||'RECEIVED'),
    duplicate_of:e.duplicate_of??null,
    correction_of:e.correction_of??null
  };
}
function createMemoryRawEventJournal(){
  const events=new Map(),idem=new Map(),queue=[],dlq=[];
  return{
    append(input){
      const e=normalizeRawEvent(input);
      const prior=idem.get(e.idempotency_key);
      if(prior){
        e.ingest_status='DUPLICATE';e.duplicate_of=prior;
        e.event_id='dup:'+hash([prior,e.payload_hash,events.size].join('|')).slice(0,28);
      }
      events.set(e.event_id,e);if(!prior)idem.set(e.idempotency_key,e.event_id);
      return JSON.parse(JSON.stringify(e));
    },
    correction(originalId,input){
      if(!events.has(String(originalId)))throw new Error('original event not found');
      const correctionId='corr:'+hash([String(originalId),hash(input?.payload??input),events.size].join('|')).slice(0,28);
      const e=normalizeRawEvent({...input,event_id:correctionId,idempotency_key:'correction:'+correctionId,correction_of:String(originalId),ingest_status:'CORRECTION'});
      events.set(e.event_id,e);return JSON.parse(JSON.stringify(e));
    },
    enqueue(kind,eventId,reason){queue.push({kind:String(kind),event_id:String(eventId),reason:String(reason||''),queued_at:Date.now()});return true},
    deadLetter(eventId,reason){dlq.push({event_id:String(eventId),reason:String(reason||''),created_at:Date.now()});return true},
    list(){return [...events.values()].map(x=>JSON.parse(JSON.stringify(x)))},
    queues(){return{retry_backfill:queue.slice(),dlq:dlq.slice()}}
  };
}
module.exports={hash,keyFor,normalizeRawEvent,createMemoryRawEventJournal};

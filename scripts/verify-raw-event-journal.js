const assert=require('assert');
const J=require('../lib/coin-scan/raw-event-journal.js');

const j=J.createMemoryRawEventJournal();
const a=j.append({source_name:'ethereum-rpc',source_kind:'evm_transfer',chain_id:'1',tx_hash:'0xabc',log_index:1,token_contract:'0xtoken',payload:{v:1}});
assert.equal(a.ingest_status,'RECEIVED');
const b=j.append({source_name:'ethereum-rpc',source_kind:'evm_transfer',chain_id:'1',tx_hash:'0xabc',log_index:1,token_contract:'0xtoken',payload:{v:1}});
assert.equal(b.ingest_status,'DUPLICATE');
assert.equal(b.duplicate_of,a.event_id);
assert.notEqual(b.event_id,a.event_id,'duplicate deliveries must be append-only records');
const c=j.correction(a.event_id,{source_name:'ethereum-rpc',source_kind:'evm_transfer',chain_id:'1',tx_hash:'0xabc',log_index:1,token_contract:'0xtoken',payload:{v:2}});
assert.equal(c.correction_of,a.event_id);
assert.equal(j.list().length,3);
j.enqueue('BACKFILL',a.event_id,'sequence gap');
j.deadLetter(a.event_id,'schema mismatch');
assert.equal(j.queues().retry_backfill.length,1);
assert.equal(j.queues().dlq.length,1);
console.log('raw event journal PASS');

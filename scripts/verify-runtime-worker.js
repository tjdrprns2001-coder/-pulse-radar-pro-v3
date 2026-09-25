const assert=require('assert');
const {createRuntimeWorker}=require('../lib/coin-scan/runtime-worker.js');
(async()=>{
 const calls={raw:0,q:0,dlq:0,wm:0,corr:0};
 const store={async appendRaw(){calls.raw++},async enqueue(){calls.q++},async deadLetter(){calls.dlq++},async upsertWatermark(){calls.wm++},async correction(){calls.corr++}};
 const w=createRuntimeWorker({store,now:()=>1000});
 const e=await w.ingest({source_name:'x',source_kind:'news',canonical_url:'u',content_hash:'h',payload:{a:1}});
 await w.processFailure(e,{status:429,retryAfterMs:5000});assert.equal(calls.q,1);
 await w.processFailure(e,{status:400});assert.equal(calls.dlq,1);
 await w.updateWatermark('x','BTC',{status:'FRESH',last_sequence:2,last_source_time:900,last_received_time:950,last_available_time:980});assert.equal(calls.wm,1);
 await w.correction('s1','s2','reorg');assert.equal(calls.corr,1);assert.equal(calls.raw,1);
 console.log('runtime worker PASS');
})().catch(e=>{console.error(e);process.exit(1)});

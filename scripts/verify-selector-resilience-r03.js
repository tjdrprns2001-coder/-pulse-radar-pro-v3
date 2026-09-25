const assert=require('assert');
const R=require('../lib/coin-scan/source-resilience.js');

const T=Date.parse('2026-09-25T03:00:00Z');
let x=R.classifyLatency('bidAsk',{sourceTime:T-1000,receivedTime:T-800,availableTime:T-700,decisionTime:T});
assert.equal(x.status,'FRESH');
x=R.classifyLatency('bidAsk',{sourceTime:T-6000,receivedTime:T-5000,availableTime:T-4500,decisionTime:T});
assert.equal(x.status,'DEGRADED');
x=R.classifyLatency('bidAsk',{sourceTime:T-16000,receivedTime:T-15000,availableTime:T-14000,decisionTime:T});
assert.equal(x.status,'STALE');

assert.equal(R.classifyRestFailure({status:429,retryAfterMs:4000}).class,'RATE_LIMIT');
assert.equal(R.classifyRestFailure({status:400}).action,'DLQ');
assert.equal(R.classifyRestFailure({error:'schema mismatch'}).action,'DLQ');
assert.equal(R.backoffMs(1),1000);
assert.equal(R.backoffMs(4),8000);

let clock=0;const cb=R.createCircuitBreaker({now:()=>clock});
for(let i=0;i<5;i++)cb.recordFailure();
assert.equal(cb.snapshot().state,'OPEN');
assert.equal(cb.canRequest(),false);
clock=31000;assert.equal(cb.canRequest(),true);assert.equal(cb.snapshot().state,'HALF_OPEN');
cb.recordSuccess();assert.equal(cb.snapshot().state,'CLOSED');

assert.equal(R.sequenceGuard({lastSequence:10,nextSequence:11}).status,'LIVE');
assert.equal(R.sequenceGuard({lastSequence:10,nextSequence:13}).status,'RESYNC_REQUIRED');
assert.equal(R.onchainFinalityGate({finality_status:'FINAL'}).usable,true);
assert.equal(R.onchainFinalityGate({finality_status:'CONFIRMED'}).usable,false);
assert.equal(R.onchainFinalityGate({finality_status:'CONFIRMED'}).auxiliary,true);
assert.equal(R.calendarHealth({lastObservedAt:T-25*3600000,decisionTime:T}).status,'STALE');
console.log('selector resilience r0.3 PASS');

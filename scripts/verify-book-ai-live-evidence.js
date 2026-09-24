'use strict';
const assert=require('assert');
const L=require('../ui/book-ai/live-evidence.js');
const ASOF=Date.parse('2026-09-24T09:00:00Z');
let createCalls=0,recordCalls=0;
const journal={
  createBundle(){
    createCalls++;
    return{
      snapshot:{id:'LQJ-BTC-4h-1',sequenceId:'LQSEQ-abc',symbol:'BTCUSDT',timeframe:'4h',capturedBarTime:ASOF-100,eventIds:['LQE-a','LQE-b']},
      events:[
        {eventId:'LQE-a',eventFingerprint:'fp-a',eventType:'LIQ_SWEEP',status:'CONFIRMED',sequenceId:'LQSEQ-abc',symbol:'BTCUSDT',timeframe:'4h',confirmedAt:ASOF-200,parentEventId:null},
        {eventId:'LQE-b',eventFingerprint:'fp-b',eventType:'RECLAIM',status:'CONFIRMED',sequenceId:'LQSEQ-abc',symbol:'BTCUSDT',timeframe:'4h',confirmedAt:ASOF-100,parentEventId:'LQE-a'}
      ]
    };
  },
  recordAndResolve(){recordCalls++}
};
const model={ok:true,candles:[{time:ASOF-1000,closeTime:ASOF-500,open:1,high:2,low:.5,close:1.5,partial:false}]};
const x=L.createLiveEvidence({journal,symbol:'BTCUSDT',timeframe:'4h',model,trendRetest:null,analysisAsOf:ASOF,now:ASOF});
assert.equal(createCalls,1);
assert.equal(recordCalls,0,'live evidence module must never persist Journal data');
assert.equal(x.provenance,'LIVE_EPHEMERAL');
assert(x.snapshot.id.startsWith('LIVE-'));
assert.equal(x.snapshot.sequenceId,'LQSEQ-abc','semantic sequence id must remain stable for later persisted match');
assert.equal(x.events.length,2);
assert(x.events.every(e=>e.eventId.startsWith('LIVE-')));
assert(x.events.every(e=>e.provenance==='LIVE_EPHEMERAL'&&e.closedOnly===true));
assert.equal(x.events[0].eventFingerprint,'fp-a','canonical fingerprint must be preserved');
assert.equal(x.events[1].parentEventId,'LIVE-LQE-a');
assert.equal(x.events[1].canonicalEventId,'LQE-b');
assert.throws(()=>L.createLiveEvidence({journal,symbol:'BTCUSDT',model:{ok:true,candles:[{time:ASOF-1,partial:true}]},analysisAsOf:ASOF}),/CLOSED_ONLY/i);
assert.throws(()=>L.assertClosedOnlyModel({ok:true,candles:[{closeTime:ASOF+1,partial:false}]},ASOF),/after analysisAsOf/i);
assert.throws(()=>L.namespaceBundle({snapshot:{id:'s',capturedBarTime:ASOF},events:[{eventId:'e',eventType:'MSS',confirmedAt:ASOF+1}]},ASOF),/after analysisAsOf/i);
console.log('book ai live evidence PASS');
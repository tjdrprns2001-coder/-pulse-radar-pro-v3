'use strict';
const assert=require('assert');
const A=require('../ui/book-ai/adapter.js');

const H=3600000;
const ASOF=Date.parse('2026-09-24T05:00:00.000Z');
const source=(data,observedAt=ASOF-1000,extra={})=>({data,observedAt,...extra});

assert.equal(A.VERSION,'BOOK_AI_ADAPTER_v1');
assert.deepEqual(A.ENGINE_NAMES,['scanner','presurge','ict','causalIct','structure','forexBook','journal','gate','trendline']);
assert(A.DEFAULT_STALE_AFTER_MS.gate>A.DEFAULT_STALE_AFTER_MS.scanner);
assert.equal(A.SOURCE_FRESHNESS_POLICY_VERSION,'BOOK_AI_SOURCE_FRESHNESS_v2');
assert.equal(A.DEFAULT_STALE_AFTER_MS.ict,5*H);
assert.equal(A.DEFAULT_STALE_AFTER_MS.causalIct,5*H);
assert.equal(A.DEFAULT_STALE_AFTER_MS.structure,5*H);
assert.equal(A.DEFAULT_STALE_AFTER_MS.forexBook,5*H);

{
  const input={
    analysisAsOf:ASOF,symbol:'btcusdt',
    sources:{
      scanner:source({version:'v3',type:'A',structure:'bullish',paramsHash:'scan-p1'}),
      presurge:source({label:'관찰',blocked:false,score:2}),
      ict:source({version:'ICT_TRAINER_v1',topDown:'bullish'}),
      causalIct:source({engine_version:'CAUSAL_ICT_R0_1_JS',contract:{pass:true},sequence:{long:{stage:'WAIT_FVG'}}}),
      structure:source({version:'structure-v1',state:'ok'}),
      forexBook:source({version:'4.0.0',available:true}),
      journal:source({version:'LIQUIDITY_EVENT_JOURNAL_v1.1',snapshots:[{id:'s0',symbol:'BTCUSDT',capturedBarTime:ASOF-1000}],events:[],outcomes:[]}),
      gate:source({version:'SAMPLE_READINESS_GATE_v1',state:'OBSERVING'}),
      trendline:source({version:'TRENDLINE_RETEST_v1.1',state:'ACTIVE'})
    }
  };
  const r=A.adaptBookAiInput(input);
  assert.equal(r.symbol,'BTCUSDT');
  assert.equal(r.inherited.stage.code,'A');
  assert.equal(r.inherited.bias.value,'bullish');
  assert.deepEqual(r.inherited.presurge,{label:'관찰',blocked:false,score:2});
  assert.equal(r.engineSources.scanner.status,'AVAILABLE');
  assert.equal(r.engineSources.gate.status,'AVAILABLE');
  assert.equal(r.coverage.AVAILABLE,9);
  assert(Object.isFrozen(r));
  input.sources.scanner.data.type='C';
  assert.equal(r.inherited.stage.code,'A','adapter result must be detached from mutable source');
}
{
  const r=A.adaptBookAiInput({
    analysisAsOf:ASOF,symbol:'BTCUSDT',
    sources:{
      scanner:source({version:'v3',type:'A',structure:'bullish'},ASOF-A.DEFAULT_STALE_AFTER_MS.scanner-1),
      gate:source({version:'SAMPLE_READINESS_GATE_v1',state:'OBSERVING'},ASOF-A.DEFAULT_STALE_AFTER_MS.gate-1)
    }
  });
  assert.equal(r.engineSources.scanner.status,'STALE');
  assert.equal(r.engineSources.scanner.reason,'AGE_EXCEEDED');
  assert.equal(r.sources.scanner.type,'A','stale data must be preserved for explanation');
  assert.equal(r.engineSources.gate.status,'STALE');
  assert.equal(r.inherited.stage.code,'A','stale must not rewrite stage to invalidated/not-confirmed');
}
{
  const r=A.adaptBookAiInput({
    analysisAsOf:ASOF,symbol:'BTCUSDT',
    sources:{
      scanner:{data:null,reason:'NOT_SCANNED'},
      presurge:{data:null,reason:'NOT_EVALUATED'},
      ict:{data:{version:'ICT_TRAINER_v1',topDown:'bullish'},observedAt:null},
      structure:{error:new Error('upstream fail')},
      gate:{data:{version:'SAMPLE_READINESS_GATE_v1',state:'OBSERVING'},observedAt:null}
    }
  });
  assert.equal(r.engineSources.scanner.status,'MISSING');
  assert.equal(r.engineSources.scanner.reason,'NOT_SCANNED');
  assert.equal(r.engineSources.presurge.status,'MISSING');
  assert.equal(r.inherited.presurge,null,'missing PRE-SURGE must remain missing');
  assert.equal(r.engineSources.structure.status,'ERROR');
  assert.equal(r.engineSources.ict.status,'AVAILABLE');
  assert.equal(r.engineSources.ict.reason,'FRESHNESS_UNKNOWN');
  assert.equal(r.engineSources.gate.status,'MISSING');
  assert.equal(r.engineSources.gate.reason,'OBSERVED_AT_UNAVAILABLE');
}
assert.throws(()=>A.adaptBookAiInput({
  analysisAsOf:ASOF,symbol:'BTCUSDT',
  sources:{scanner:source({type:'A',structure:'bullish'},ASOF+1)}
}),/after analysisAsOf/i,'adapter must remain strict: future source timestamps are forbidden');

{
  const db={
    version:'LIQUIDITY_EVENT_JOURNAL_v1.1',
    snapshots:[
      {id:'s-old',symbol:'BTCUSDT',sequenceId:'q-old',capturedBarTime:ASOF-H,eventIds:['e-old','e-future']},
      {id:'s-future',symbol:'BTCUSDT',sequenceId:'q-future',capturedBarTime:ASOF+H,eventIds:['e-future']},
      {id:'s-other',symbol:'ETHUSDT',sequenceId:'q-other',capturedBarTime:ASOF-H,eventIds:['e-other']}
    ],
    events:[
      {eventId:'e-old',snapshotId:'s-old',symbol:'BTCUSDT',confirmedAt:ASOF-H},
      {eventId:'e-future',snapshotId:'s-old',symbol:'BTCUSDT',confirmedAt:ASOF+1},
      {eventId:'e-other',snapshotId:'s-other',symbol:'ETHUSDT',confirmedAt:ASOF-H}
    ],
    outcomes:[
      {snapshotId:'s-old',status:'PENDING_REFERENCE',updatedAt:ASOF-1},
      {snapshotId:'s-old',status:'REACHED',updatedAt:ASOF+H},
      {snapshotId:'s-future',status:'REACHED',updatedAt:ASOF+H}
    ]
  };
  const r=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{journal:{data:db}}});
  assert.deepEqual(r.sources.journal.snapshots.map(x=>x.id),['s-old']);
  assert.deepEqual(r.sources.journal.events.map(x=>x.eventId),['e-old']);
  assert.equal(r.sources.journal.events[0].provenance,'PERSISTED_JOURNAL');
  assert.equal(r.sources.journal.snapshots[0].eventIds.length,1);
  assert.equal(r.sources.journal.outcomes.length,1);
  assert.equal(r.sources.journal.outcomes[0].status,'PENDING_REFERENCE');
  assert.equal(r.sources.journal.latestSequenceId,'q-old');
  assert(r.engineSources.journal.observedAt<=ASOF);
}
{
  const presurge={label:'가능성 높음',blocked:false,score:5,reasons:['fixture']};
  const r=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{presurge:source(presurge)}});
  assert.deepEqual(r.sources.presurge,presurge);
  assert.deepEqual(r.inherited.presurge,presurge);
}
{
  const exact=ASOF-A.DEFAULT_STALE_AFTER_MS.scanner;
  const r=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{scanner:source({type:'A'},exact)}});
  assert.equal(r.engineSources.scanner.status,'AVAILABLE','exact stale boundary must remain available');
}

{
  const db={
    version:'LIQUIDITY_EVENT_JOURNAL_v1.1',
    snapshots:[{id:'eth-only',symbol:'ETHUSDT',capturedBarTime:ASOF-H}],
    events:[],outcomes:[]
  };
  const r=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{journal:{data:db}}});
  assert.equal(r.engineSources.journal.status,'MISSING');
  assert.equal(r.engineSources.journal.reason,'NO_SYMBOL_JOURNAL_DATA');
  assert.equal(r.engineSources.journal.dataAvailable,false);
}
{
  const r=A.adaptBookAiInput({
    analysisAsOf:ASOF,symbol:'BTCUSDT',
    sources:{gate:{data:{version:'SAMPLE_READINESS_GATE_v1',state:'OBSERVING',round:{createdAt:ASOF-H}}}}
  });
  assert.equal(r.engineSources.gate.status,'AVAILABLE');
  assert.equal(r.engineSources.gate.reason,null);
  assert.equal(r.engineSources.gate.observedAt,ASOF-H);
}
{
  const within=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{
    ict:source({version:'ICT_TRAINER_v1'},ASOF-(4.5*H)),
    structure:source({version:'structure-v1'},ASOF-(4.5*H)),
    forexBook:source({version:'4.0.0'},ASOF-(4.5*H))
  }});
  assert.equal(within.engineSources.ict.status,'AVAILABLE');
  assert.equal(within.engineSources.structure.status,'AVAILABLE');
  assert.equal(within.engineSources.forexBook.status,'AVAILABLE');
  const edge=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{ict:source({version:'ICT_TRAINER_v1'},ASOF-5*H)}});
  assert.equal(edge.engineSources.ict.status,'AVAILABLE','exact 4H+1H grace boundary stays available');
  const stale=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{ict:source({version:'ICT_TRAINER_v1'},ASOF-5*H-1)}});
  assert.equal(stale.engineSources.ict.status,'STALE','4H+1H grace +1ms becomes stale');
}
{
  const live={
    version:'BOOK_AI_LIVE_EVIDENCE_v1',provenance:'LIVE_EPHEMERAL',observedAt:ASOF-1000,
    snapshot:{id:'LIVE-s1',symbol:'BTCUSDT',timeframe:'4h',capturedBarTime:ASOF-1000,provenance:'LIVE_EPHEMERAL',closedOnly:true},
    events:[{eventId:'LIVE-e1',eventType:'MSS',symbol:'BTCUSDT',timeframe:'4h',confirmedAt:ASOF-1000,provenance:'LIVE_EPHEMERAL',closedOnly:true,status:'CONFIRMED'}]
  };
  const r=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',liveEvidence:live});
  assert.equal(r.liveEvidence.provenance,'LIVE_EPHEMERAL');
  assert.equal(r.liveEvidence.events[0].eventId,'LIVE-e1');
}
assert.throws(()=>A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',liveEvidence:{
  provenance:'LIVE_EPHEMERAL',snapshot:{id:'LIVE-s1',symbol:'BTCUSDT',capturedBarTime:ASOF-1,provenance:'LIVE_EPHEMERAL',closedOnly:true},
  events:[{eventId:'e1',symbol:'BTCUSDT',confirmedAt:ASOF-1,provenance:'LIVE_EPHEMERAL',closedOnly:true}]
}}),/LIVE- namespace/i);
assert.throws(()=>A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',liveEvidence:{
  provenance:'LIVE_EPHEMERAL',snapshot:{id:'LIVE-s1',symbol:'BTCUSDT',capturedBarTime:ASOF-1,provenance:'LIVE_EPHEMERAL',closedOnly:true},
  events:[{eventId:'LIVE-e1',symbol:'BTCUSDT',confirmedAt:ASOF-1,provenance:'LIVE_EPHEMERAL',closedOnly:false}]
}}),/CLOSED_ONLY/i);
{
  const computedAt=ASOF-500,sourceBarClosedAt=ASOF-(2*H);
  const r=A.adaptBookAiInput({analysisAsOf:ASOF,symbol:'BTCUSDT',sources:{
    causalIct:{data:{engine_version:'CAUSAL_ICT_R0_1_JS'},observedAt:computedAt,computedAt,sourceBarClosedAt,version:'CAUSAL_ICT_R0_1_JS'}
  }});
  assert.equal(r.engineSources.causalIct.status,'AVAILABLE');
  assert.equal(r.engineSources.causalIct.observedAt,computedAt,'freshness uses computation time');
  assert.equal(r.engineSources.causalIct.computedAt,computedAt);
  assert.equal(r.engineSources.causalIct.sourceBarClosedAt,sourceBarClosedAt,'source bar close is retained separately');
}
console.log('book ai adapter PASS');
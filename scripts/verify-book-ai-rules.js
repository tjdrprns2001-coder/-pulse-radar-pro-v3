'use strict';
const assert=require('assert');
const Rule=require('../ui/book-ai/rule-engine.js');
const Contract=require('../ui/book-ai/contract.js');
const ASOF=Date.parse('2026-09-24T06:00:00Z');

function baseAdapter(){
  const events=[
    {eventId:'e-break',eventType:'TL_BREAK',eventVersion:1,snapshotId:'s1',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'1h',confirmedAt:ASOF-5000,status:'CONFIRMED',paramsHash:'tl-p1'},
    {eventId:'e-touch',eventType:'TL_RETEST_TOUCH',eventVersion:1,snapshotId:'s1',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'1h',confirmedAt:ASOF-4000,status:'CONFIRMED',paramsHash:'tl-p1'},
    {eventId:'e-confirm',eventType:'TL_RETEST_CONFIRMED',eventVersion:1,snapshotId:'s1',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'1h',confirmedAt:ASOF-3000,status:'CONFIRMED',paramsHash:'tl-p1'},
    {eventId:'e-sweep',eventType:'LIQ_SWEEP',eventVersion:1,snapshotId:'s1',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'15m',confirmedAt:ASOF-2500,status:'CONFIRMED'},
    {eventId:'e-reclaim',eventType:'RECLAIM',eventVersion:1,snapshotId:'s1',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'15m',confirmedAt:ASOF-2000,status:'CONFIRMED'},
    {eventId:'e-mss',eventType:'MSS',eventVersion:1,snapshotId:'s1',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'15m',confirmedAt:ASOF-1500,status:'CONFIRMED'},
    {eventId:'e-disp',eventType:'DISPLACEMENT',eventVersion:1,snapshotId:'s1',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'15m',confirmedAt:ASOF-1000,status:'CONFIRMED'}
  ];
  return{
    adapterVersion:'BOOK_AI_ADAPTER_v1',analysisAsOf:ASOF,symbol:'BTCUSDT',
    engineSources:{
      scanner:{version:'v3',observedAt:ASOF-500,status:'AVAILABLE'},journal:{version:'LIQUIDITY_EVENT_JOURNAL_v1.1',observedAt:ASOF-1000,status:'AVAILABLE'},
      structure:{version:'structure-v1',observedAt:ASOF-500,status:'AVAILABLE'},forexBook:{version:'4.0.0',observedAt:ASOF-500,status:'AVAILABLE'}
    },
    sources:{
      journal:{version:'LIQUIDITY_EVENT_JOURNAL_v1.1',latestSequenceId:'q1',events,snapshots:[{id:'s1',sequenceId:'q1'}],outcomes:[]},
      scanner:{version:'v3',type:'A',structure:'bullish',v3:{
        longTerm:{filter:{tier:'PASS',alignmentPct:75,core:{up:3,requiredUp:2},validFrames:6}},
        rvol:{main1h:{value:2,state:'PRE-SPARK'},ignition15m:{value:3.5,state:'IGNITION'}},
        oiPath:{mainBuild:true,state:'BUILD',pattern:'+/+/+',main4hPct:2.5},
        taker:{state:'IMPROVE',latest:1.31,improveCount3:2},
        movingAverage:{'1h':{compressed:true,compressionRatio:.7,ribbonWidthAtr:1.2,alignmentTransition:true,bullishAligned:true}}
      }},
      structure:{volumeContraction:true,breakout:true,version:'structure-v1'},forexBook:{version:'4.0.0'},presurge:null,ict:null,gate:null,trendline:null
    }
  };
}

{
  const r=Rule.evaluate(baseAdapter());
  assert.equal(r.version,'BOOK_AI_RULE_ENGINE_v1');
  assert.equal(r.bookEvidence.rawMax,95);
  assert.equal(r.bookEvidence.rankingContribution,0);
  assert.deepEqual(Object.keys(r.bookEvidence.components).sort(),Contract.COMPONENT_KEYS.slice().sort());
  assert.equal(r.evidenceAudit.uniqueEventCount,7);
  assert.equal(r.evidenceAudit.persistedEventCount,7);
  assert.equal(r.evidenceAudit.ephemeralEventCount,0);
  assert.equal(r.evidenceAudit.trustedConfirmedEventCount,7);
  assert(r.evidenceAudit.sharedEventIds.includes('e-reclaim'));
  assert.equal(r.bookSetups.find(x=>x.ruleId==='LIQUIDITY_SWEEP_RECLAIM').status,'CONFIRMED');
  assert.equal(r.bookSetups.find(x=>x.ruleId==='TRENDLINE_REACTION').status,'CONFIRMED');
  assert.equal(r.bookSetups.find(x=>x.ruleId==='MOVING_AVERAGE_COMPRESSION').status,'CANDIDATE');
  assert(Object.isFrozen(r));
}
{
  const a=baseAdapter(),one=Rule.evaluate(a);
  a.sources.journal.events.push({...a.sources.journal.events.find(x=>x.eventId==='e-sweep')},{...a.sources.journal.events.find(x=>x.eventId==='e-sweep')});
  const dup=Rule.evaluate(a);
  assert.equal(dup.bookEvidence.components.liquiditySmc,one.bookEvidence.components.liquiditySmc);
  assert.equal(dup.evidenceAudit.uniqueEventCount,one.evidenceAudit.uniqueEventCount);
}
{
  const a=baseAdapter(),facts=Rule.buildEvidenceFacts(a),score1=Rule.scoreComponents(facts).bookEvidence,score2=Rule.scoreComponents([...facts].reverse()).bookEvidence;
  assert.deepEqual(score1,score2,'fact order must not change score');
  const rules=Rule.evaluateRules(a,facts);
  assert.equal(Rule.assertRuleEvidenceIntegrity({rules:[...rules].reverse(),facts,analysisAsOf:ASOF}),true);
}
{
  const f={factId:'f1',factType:'LIQUIDITY_SWEEP',eventId:'same',confirmedAt:ASOF-1};
  const score=Rule.scoreComponents(Rule.dedupeFacts(Array.from({length:10},()=>f))).bookEvidence;
  assert.equal(score.components.liquiditySmc,7,'one repeated event cannot max component');
}
{
  const facts=Rule.buildEvidenceFacts(baseAdapter()),bad=[{ruleId:'BAD',status:'CONFIRMED',sequenceId:'q1',evidenceFactIds:[facts[0].factId],evidenceEventIds:['missing-event'],trustedEvidenceEventIds:['missing-event']}];
  assert.throws(()=>Rule.assertRuleEvidenceIntegrity({rules:bad,facts,analysisAsOf:ASOF}),/unknown eventId/i);
}
{
  const a=baseAdapter();a.sources.journal.events.push({eventId:'future',eventType:'RECLAIM',sequenceId:'q1',snapshotId:'s1',confirmedAt:ASOF+1});
  assert.throws(()=>Rule.evaluate(a),/after analysisAsOf/i);
}
{
  const a=baseAdapter();a.sources.journal.events=a.sources.journal.events.filter(x=>!['e-confirm','e-reclaim'].includes(x.eventId));
  const r=Rule.evaluate(a);
  assert.equal(r.bookSetups.find(x=>x.ruleId==='BREAKOUT_RETEST').status,'CANDIDATE');
  assert.equal(r.bookSetups.find(x=>x.ruleId==='LIQUIDITY_SWEEP_RECLAIM').status,'CANDIDATE');
}
{
  const r=Rule.evaluate(baseAdapter()),br=r.bookSetups.find(x=>x.ruleId==='BREAKOUT_RETEST'),fl=r.bookSetups.find(x=>x.ruleId==='SUPPORT_RESISTANCE_FLIP');
  assert(br.evidenceEventIds.some(x=>fl.evidenceEventIds.includes(x)),'event sharing across rules must be allowed');
  assert(r.evidenceAudit.totalEventRuleReferences>r.evidenceAudit.uniqueEventCount,'audit must reveal event reuse');
}
{
  const r=Rule.evaluate(baseAdapter());
  assert.deepEqual(Contract.computeEvidenceScore(r.bookEvidence.components),r.bookEvidence);
  for(const x of r.bookSetups)assert.doesNotThrow(()=>Contract.normalizeBookSetup(x,ASOF));
}
{
  const a=baseAdapter();
  a.sources.journal.events=[];
  a.liveEvidence={events:[
    {eventId:'LIVE-e-break',eventType:'TL_BREAK',eventVersion:1,snapshotId:'LIVE-s1',sequenceId:'q-live',symbol:'BTCUSDT',timeframe:'1h',confirmedAt:ASOF-5000,status:'CONFIRMED',provenance:'LIVE_EPHEMERAL',closedOnly:true,eventFingerprint:'fp-break'},
    {eventId:'LIVE-e-touch',eventType:'TL_RETEST_TOUCH',eventVersion:1,snapshotId:'LIVE-s1',sequenceId:'q-live',symbol:'BTCUSDT',timeframe:'1h',confirmedAt:ASOF-4000,status:'DETECTED',provenance:'LIVE_EPHEMERAL',closedOnly:true,eventFingerprint:'fp-touch'},
    {eventId:'LIVE-e-confirm',eventType:'TL_RETEST_CONFIRMED',eventVersion:1,snapshotId:'LIVE-s1',sequenceId:'q-live',symbol:'BTCUSDT',timeframe:'1h',confirmedAt:ASOF-3000,status:'CONFIRMED',provenance:'LIVE_EPHEMERAL',closedOnly:true,eventFingerprint:'fp-confirm'},
    {eventId:'LIVE-e-sweep',eventType:'LIQ_SWEEP',eventVersion:1,snapshotId:'LIVE-s1',sequenceId:'q-live',symbol:'BTCUSDT',timeframe:'15m',confirmedAt:ASOF-2500,status:'CONFIRMED',provenance:'LIVE_EPHEMERAL',closedOnly:true,eventFingerprint:'fp-sweep'},
    {eventId:'LIVE-e-reclaim',eventType:'RECLAIM',eventVersion:1,snapshotId:'LIVE-s1',sequenceId:'q-live',symbol:'BTCUSDT',timeframe:'15m',confirmedAt:ASOF-2000,status:'CONFIRMED',provenance:'LIVE_EPHEMERAL',closedOnly:true,eventFingerprint:'fp-reclaim'}
  ]};
  const r=Rule.evaluate(a);
  assert.equal(r.bookSetups.find(x=>x.ruleId==='BREAKOUT_RETEST').status,'CANDIDATE','ephemeral confirmed-looking events may not confirm rule');
  assert.equal(r.bookSetups.find(x=>x.ruleId==='LIQUIDITY_SWEEP_RECLAIM').status,'CANDIDATE','ephemeral sweep/reclaim may not confirm rule');
  assert.equal(r.bookSetups.some(x=>x.status==='CONFIRMED'),false);
  assert.equal(r.evidenceAudit.ephemeralEventCount,5);
  assert.equal(r.evidenceAudit.persistedEventCount,0);
  assert.equal(r.evidenceAudit.trustedConfirmedEventCount,0);
}
{
  const a=baseAdapter();
  const touch=a.sources.journal.events.find(x=>x.eventId==='e-touch');touch.status='DETECTED';
  const r=Rule.evaluate(a);
  const fact=r.evidenceFacts.find(x=>x.eventId==='e-touch');
  assert.equal(Rule.isTrustedConfirmedEventFact(fact),false,'persisted DETECTED touch is not trusted-confirmed');
  assert.equal(r.bookSetups.find(x=>x.ruleId==='TRENDLINE_REACTION').status,'CONFIRMED','persisted RETEST_CONFIRMED remains decisive while touch is only detected');
}
{
  const a=baseAdapter();
  const persisted=a.sources.journal.events.find(x=>x.eventId==='e-sweep');
  persisted.eventFingerprint='same-fp';
  a.liveEvidence={events:[{...persisted,eventId:'LIVE-duplicate',snapshotId:'LIVE-s1',provenance:'LIVE_EPHEMERAL',closedOnly:true}]};
  const facts=Rule.buildEvidenceFacts(a).filter(x=>x.eventFingerprint==='same-fp');
  assert.equal(facts.length,1,'persisted event must win fingerprint dedupe over live duplicate');
  assert.equal(facts[0].provenance,'PERSISTED_JOURNAL');
}
{
  const a=baseAdapter();
  a.sources.journal.events=a.sources.journal.events.filter(x=>x.eventId!=='e-touch');
  a.liveEvidence={events:[{eventId:'LIVE-e-touch',eventType:'TL_RETEST_TOUCH',snapshotId:'LIVE-s',sequenceId:'q1',symbol:'BTCUSDT',timeframe:'1h',confirmedAt:ASOF-3500,status:'DETECTED',provenance:'LIVE_EPHEMERAL',closedOnly:true,eventFingerprint:'fp-live-touch'}]};
  const r=Rule.evaluate(a);
  assert.equal(r.bookSetups.find(x=>x.ruleId==='TRENDLINE_REACTION').status,'CANDIDATE','live touch cannot complete persisted confirmation chain');
}
console.log('book ai rule engine PASS');
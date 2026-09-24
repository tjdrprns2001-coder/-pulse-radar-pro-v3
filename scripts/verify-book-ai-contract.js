'use strict';
const assert=require('assert');
const C=require('../ui/book-ai/contract.js');

const BASE_COMPONENTS={
  bookStructure:20,
  htfAlignment:15,
  liquiditySmc:12,
  volumeRvol:8,
  derivatives:6,
  retestReclaim:5
};
function valid(overrides={}){
  return{
    analysisId:'book-ai:test:1',
    symbol:'btcusdt',
    exchange:'binance',
    marketType:'perpetual',
    analysisAsOf:1000,
    generatedAt:1100,
    dataPolicy:{candlePolicy:'CLOSED_ONLY',closedThrough:{'1d':900,'4h':960,'1h':990}},
    engines:{scanner:{version:'v3'},forexBook:{version:'4.0.0'}},
    bias:{value:'bullish',source:'shared-analysis-engine'},
    stage:{code:'A_PRE',source:'scanner-v3',paramsHash:'stage-p1'},
    setupState:'WATCH',
    htfAlignment:'ALIGNED',
    bookSetups:[{
      ruleId:'BREAKOUT_RETEST',
      ruleVersion:1,
      status:'CONFIRMED',
      paramsHash:'book-rule-p1',
      sourceBookId:'all-you-should-know-about-forex',
      sourceReference:'technical-support-resistance',
      sequenceId:'seq-1',
      evidenceEventIds:['evt-1'],
      evidenceSnapshotIds:['snap-1'],
      evidenceConfirmedAt:980
    }],
    htf:{'1d':{trend:'bullish'}},
    ltf:{'1h':{state:'reset'}},
    trigger:{status:'WAITING'},
    dol:{price:110},
    invalidation:{price:90},
    bookEvidence:{components:{...BASE_COMPONENTS},rankingContribution:0},
    sampleDna:{mode:'SHADOW_ONLY',similarityVersion:null,nearestSamples:[],similarityScore:null,scoreContribution:0,rankingContribution:0,status:'NOT_EVALUATED'},
    journal:{sequenceId:'seq-1'},
    summary:{canonical:{generatedBy:'TEMPLATE_ENGINE',text:'fixture'}},
    snapshotReady:false,
    promptVersion:null,
    modelVersion:null,
    ...overrides
  };
}

assert.equal(C.RAW_MAX,95);
assert.deepEqual(C.COMPONENT_KEYS,['bookStructure','htfAlignment','liquiditySmc','volumeRvol','derivatives','retestReclaim']);
assert.equal(C.BOOK_EVIDENCE_VERSION,'BOOK_EVIDENCE_v1');
assert.equal(C.SCORE_TYPE,'EVIDENCE_COMPLETENESS');

{
  const s=C.computeEvidenceScore({bookStructure:25,htfAlignment:20,liquiditySmc:20,volumeRvol:12,derivatives:10,retestReclaim:8});
  assert.equal(s.rawScore,95);
  assert.equal(s.rawMax,95);
  assert.equal(s.normalizedScore,100);
  assert.equal(s.rankingContribution,0);
}
{
  const r=C.createBookAnalysisResult(valid());
  const expectedRaw=Object.values(BASE_COMPONENTS).reduce((a,b)=>a+b,0);
  assert.equal(r.bookEvidence.rawScore,expectedRaw);
  assert.equal(r.bookEvidence.normalizedScore,Math.round(expectedRaw/95*100));
  assert.equal(r.sampleDna.scoreContribution,0);
  assert.equal(r.sampleDna.rankingContribution,0);
  assert.equal(r.symbol,'BTCUSDT');
  assert(Object.isFrozen(r));
  assert(Object.isFrozen(r.bookEvidence));
  assert.equal(C.validateBookAnalysisResult(r),true);
}
assert.throws(()=>C.computeEvidenceScore({...BASE_COMPONENTS,sampleSimilarity:3}),/exactly/i);
assert.throws(()=>C.createBookAnalysisResult(valid({bookEvidence:{components:BASE_COMPONENTS,rawMax:100}})),/rawMax/i);
assert.throws(()=>C.createBookAnalysisResult(valid({bookEvidence:{components:BASE_COMPONENTS,rankingContribution:1}})),/rankingContribution/i);
assert.throws(()=>C.createBookAnalysisResult(valid({sampleDna:{mode:'SHADOW_ONLY',scoreContribution:1,rankingContribution:0,status:'NOT_EVALUATED'}})),/scoreContribution/i);
assert.throws(()=>C.createBookAnalysisResult(valid({sampleDna:{mode:'SHADOW_ONLY',scoreContribution:0,rankingContribution:1,status:'NOT_EVALUATED'}})),/rankingContribution/i);
assert.throws(()=>C.createBookAnalysisResult(valid({dataPolicy:{candlePolicy:'CLOSED_ONLY',closedThrough:{'1h':1001}}})),/analysisAsOf/i);
assert.throws(()=>C.createBookAnalysisResult(valid({dataPolicy:{candlePolicy:'LIVE',closedThrough:{'1h':900}}})),/CLOSED_ONLY/i);
assert.throws(()=>C.createBookAnalysisResult(valid({generatedAt:999})),/generatedAt/i);
assert.throws(()=>C.createBookAnalysisResult(valid({bookSetups:[{
  ruleId:'BREAKOUT_RETEST',ruleVersion:1,status:'CONFIRMED',paramsHash:'p',sourceBookId:'b',sourceReference:'r',sequenceId:'seq-1',evidenceEventIds:[]
}]})),/evidenceEventIds/i);
{
  const candidate=valid({bookSetups:[{
    ruleId:'MA_COMPRESSION',ruleVersion:1,status:'CANDIDATE',paramsHash:'p',sourceBookId:'b',sourceReference:'r',sequenceId:null,evidenceEventIds:[]
  }]});
  assert.equal(C.createBookAnalysisResult(candidate).bookSetups[0].status,'CANDIDATE');
}
assert.equal(C.assertInheritedFactsUnchanged(
  {bias:{value:'bullish'},stage:{code:'A_PRE',paramsHash:'stage-p1'}},
  {bias:{value:'bullish'},stage:{code:'A_PRE',paramsHash:'stage-p1'}}
),true);
assert.throws(()=>C.assertInheritedFactsUnchanged(
  {bias:{value:'bullish'},stage:{code:'A_PRE'}},
  {bias:{value:'bearish'},stage:{code:'A_PRE'}}
),/bias mutation/i);
assert.throws(()=>C.assertInheritedFactsUnchanged(
  {bias:{value:'bullish'},stage:{code:'A'}},
  {bias:{value:'bullish'},stage:{code:'A_PRE'}}
),/stage mutation/i);
assert.throws(()=>C.assertInheritedFactsUnchanged(
  {bias:{value:'bullish'},stage:{code:'A',paramsHash:'p1'}},
  {bias:{value:'bullish'},stage:{code:'A',paramsHash:'p2'}}
),/paramsHash mutation/i);

assert.equal(C.assertEvidenceWithinAnalysisAsOf({analysisAsOf:1000,events:[{confirmedAt:999}],candles:[{closeTime:1000,isClosed:true}]}),true);
assert.throws(()=>C.assertEvidenceWithinAnalysisAsOf({analysisAsOf:1000,events:[{confirmedAt:1001}]}),/event after/i);
assert.throws(()=>C.assertEvidenceWithinAnalysisAsOf({analysisAsOf:1000,candles:[{closeTime:1001,isClosed:true}]}),/candle after/i);
assert.throws(()=>C.assertEvidenceWithinAnalysisAsOf({analysisAsOf:1000,candles:[{closeTime:999,isClosed:false}]}),/incomplete candle/i);

assert.equal(C.assertBookStorageKey('pulse_book_ai_analysis_v1'),true);
assert.throws(()=>C.assertBookStorageKey('pulse_legacy_ai_history'),/Legacy AI/i);
assert.throws(()=>C.assertBookStorageKey('other_key'),/pulse_book_ai_/i);

assert.equal(C.assertPresurgeReadOnly(null,null),true);
assert.equal(C.assertPresurgeReadOnly({state:'A_PRE',source:'scanner'},{state:'A_PRE',source:'scanner'}),true);
assert.throws(()=>C.assertPresurgeReadOnly(null,{state:'A_PRE'}),/may not create PRE-SURGE/i);
assert.throws(()=>C.assertPresurgeReadOnly({state:'A_PRE'},{state:'A'}),/may not mutate PRE-SURGE/i);

console.log('book ai contract PASS');
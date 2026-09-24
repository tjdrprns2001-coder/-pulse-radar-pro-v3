'use strict';
const assert=require('assert');
const S=require('../ui/book-ai/summary-template.js');

const BASE={
  version:'BOOK_AI_FUSION_v1',
  analysisAsOf:1000,
  symbol:'BTCUSDT',
  bias:{value:'bullish',source:'scanner'},
  stage:{code:'A',source:'scanner',paramsHash:'p1'},
  setupState:'READY',
  setupLifecycle:{dataState:'FRESH',transition:{reason:'FRESH_READINESS_GAINED'}},
  htfAlignment:'ALIGNED',
  bookSetups:[
    {ruleId:'BREAKOUT_RETEST',status:'CANDIDATE'},
    {ruleId:'LIQUIDITY_SWEEP_RECLAIM',status:'CONFIRMED'},
    {ruleId:'MOVING_AVERAGE_COMPRESSION',status:'NOT_CONFIRMED'}
  ],
  bookEvidence:{normalizedScore:78},
  engineSources:{
    scanner:{status:'AVAILABLE',reason:null},
    journal:{status:'AVAILABLE',reason:null}
  }
};

{
  const s=S.buildCanonicalSummary(BASE);
  assert.equal(s.generatedBy,'TEMPLATE_ENGINE');
  assert.equal(s.llmUsed,false);
  assert.equal(s.referencedPrices.length,0);
  assert(s.headline.includes('BTCUSDT'));
  assert(s.headline.includes('준비'));
  assert(s.htf.includes('상위 프레임 정렬'));
  assert(s.setup.includes('돌파 후 리테스트 후보'));
  assert(s.setup.includes('유동성 스윕 후 회복 확인'));
  assert(!s.setup.includes('이평 압축'),'NOT_CONFIRMED rules must not enter active setup text');
  assert.equal(S.assertCanonicalSummaryGrounded(s,BASE),true);
}
{
  const s=S.buildCanonicalSummary(BASE);
  const tampered={...s,headline:s.headline+' · INVALIDATED'};
  assert.throws(()=>S.assertCanonicalSummaryGrounded(tampered,BASE),/diverges/i,'invented state text must fail');
}
{
  const s=S.buildCanonicalSummary(BASE);
  const tampered={...s,evidence:'근거 완성도 99/100'};
  assert.throws(()=>S.assertCanonicalSummaryGrounded(tampered,BASE),/diverges/i,'invented score must fail');
}
{
  const s=S.buildCanonicalSummary(BASE);
  const tampered={...s,referencedPrices:[12345]};
  assert.throws(()=>S.assertCanonicalSummaryGrounded(tampered,BASE),/may not emit prices/i,'price not present in fusion must fail');
}
{
  const s=S.buildCanonicalSummary(BASE);
  const changed=JSON.parse(JSON.stringify(s));
  const biasClaim=changed.claims.find(x=>x.claimId==='bias');
  biasClaim.rawValue='bearish';
  assert.throws(()=>S.assertCanonicalSummaryGrounded(changed,BASE),/diverges|mismatch/i,'claim raw value must match fusion');
}
{
  const degraded={
    ...BASE,
    setupLifecycle:{dataState:'DEGRADED',transition:{reason:'DATA_DEGRADED_HOLD'}},
    engineSources:{
      scanner:{status:'STALE',reason:'AGE_EXCEEDED'},
      journal:{status:'AVAILABLE',reason:null}
    }
  };
  const s=S.buildCanonicalSummary(degraded);
  assert(s.dataQuality.includes('데이터 품질 저하'));
  assert(s.dataQuality.includes('scanner STALE'));
  assert(s.counterEvidence.includes('기존 상태 유지'));
  assert.equal(S.assertCanonicalSummaryGrounded(s,degraded),true);
}
{
  const invalid={...BASE,setupState:'INVALIDATED',setupLifecycle:{dataState:'FRESH',transition:{reason:'EXPLICIT_INVALIDATION'}}};
  const s=S.buildCanonicalSummary(invalid);
  assert.equal(s.counterEvidence,'명시적 무효화 근거 확인');
  assert(s.nextConfirmation.includes('새 sequence'));
}
{
  const a=S.buildCanonicalSummary(BASE);
  const b=S.buildCanonicalSummary(JSON.parse(JSON.stringify(BASE)));
  assert.deepEqual(a,b,'same fusion input must reproduce identical canonical summary');
}
{
  const reordered={...BASE,bookSetups:[...BASE.bookSetups].reverse()};
  const a=S.buildCanonicalSummary(BASE),b=S.buildCanonicalSummary(reordered);
  assert.equal(a.setup,b.setup,'rule input order must not change canonical setup text');
}
{
  const s=S.buildCanonicalSummary(BASE);
  assert.throws(()=>S.assertCanonicalSummaryGrounded({...s,llmUsed:true},BASE),/may not use LLM/i);
}
console.log('book ai canonical summary PASS');
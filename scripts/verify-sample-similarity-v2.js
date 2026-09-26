'use strict';
const assert=require('assert');
const Similarity=require('../lib/coin-scan/sample-similarity-v2.js');

Similarity.resetCache();
const out=Similarity.evaluate({
  symbol:'TESTUSDT',
  price24hPct:2.5,
  oi1hPct:1.4,
  oi4hPct:4.0,
  oi24hPct:7.5,
  taker1h:[1.0,1.12,1.28],
  taker15m:[1.05,1.22],
  rvol1h:4.0,
  rvol15m:3.2,
  rsi1h:58,
  rsi15m:62,
  fundingRate:.01,
  basisPct:0,
  bosUp:true,
  sslSweep:true,
  dnaTags:['ZETA_FLOW_COMPRESSION'],
  dnaPrimary:'ZETA_FLOW_COMPRESSION',
  dnaStage:'FLOW-LED PRE-SURGE',
  spotConfirmed:true
});
assert.equal(out.version,'SAMPLE_SIMILARITY_v2');
assert.equal(out.successTop5.length,5,'success TOP5 required');
assert.equal(out.negativeTop3.length,3,'negative/control TOP3 required');
assert(typeof out.ignitionPath==='string'&&out.ignitionPath.length>0,'ignition path required');
assert(Number.isFinite(out.successScore));
assert(Number.isFinite(out.negativeScore));
assert(Number.isFinite(out.netEvidenceScore));
assert(Array.isArray(out.conflictEvidence));
assert(out.successTop5.every(x=>['SURGE','REIGNITION'].includes(x.label)));
assert(out.negativeTop3.every(x=>['FAILED_BOS','CONTROL','NO_TRIGGER','PRE_OUTCOME'].includes(x.label)));
console.log('sample similarity v2 PASS',JSON.stringify({path:out.ignitionPath,success:out.successTop5[0],negative:out.negativeTop3[0],net:out.netEvidenceScore}));

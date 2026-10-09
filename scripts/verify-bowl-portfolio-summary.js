'use strict';
const assert=require('node:assert/strict');
const {summarizeWalkForwardCohort}=require('../lib/research-backtest-v2/bowl-portfolio-summary.js');
const make=(symbol,date,hit)=>({
 version:'BOWL_WALK_FORWARD_v1',status:'READY',symbol,
 bySplit:{train:{controls:{count:7,hit72h10Count:1}},validation:{controls:{count:7,hit72h10Count:1}},test:{controls:{count:7,hit72h10Count:2}}},
 events:{train:[],validation:[],test:[{at:Date.parse(date),hit72h10:hit,return7dPct:1}]}
});
const a=make('AUSDT','2026-09-01T03:00:00Z',true),b=make('BUSDT','2026-09-01T17:00:00Z',false),c=make('CUSDT','2026-09-04T12:00:00Z',true);
const s=summarizeWalkForwardCohort([a,b,c]);
assert.equal(s.status,'READY');assert.equal(s.eventCount,3);
assert.equal(s.bySplit.test.signalDateClusters,2,'same UTC day across symbols must be one macro cluster');
assert.equal(s.bySplit.test.correlationWarning,true);
assert.equal(s.bySplit.test.hitRate,2/3);
assert.equal(s.bySplit.test.controlCount,21);
assert.equal(s.bySplit.test.controlHitRate,6/21);
assert.equal(s.bySplit.test.clusters[0].events,2);
assert.deepEqual(s.bySplit.test.clusters[0].symbols,['AUSDT','BUSDT']);
assert.equal(summarizeWalkForwardCohort([]).status,'UNAVAILABLE');
console.log('bowl cross-asset cohort clustering PASS');

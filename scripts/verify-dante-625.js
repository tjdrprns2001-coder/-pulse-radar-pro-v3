'use strict';
const assert=require('assert');
const D=require('../ui/dante/dante-625-engine.js');
const c=[
 {time:1000,closeTime:1000,open:100,high:101,low:99,close:100,volume:1000,partial:false},
 {time:2000,closeTime:2000,open:101,high:108,low:100,close:107,volume:2000,partial:false},
 {time:3000,closeTime:3000,open:105,high:108,low:104,close:107,volume:1200,partial:false}
];
const r=D.analyze({candles:c,analysisAsOf:4000,market:'KR_EQUITY'});
assert.equal(r.status,'CANDIDATE');assert.equal(r.state,'SETUP');assert.equal(r.rankingContribution,0);
const crypto=D.analyze({candles:c,analysisAsOf:4000,market:'CRYPTO'});
assert.equal(crypto.status,'NOT_APPLICABLE');assert.equal(crypto.state,'MARKET_SESSION_UNSUPPORTED');
console.log('dante 625 PASS');
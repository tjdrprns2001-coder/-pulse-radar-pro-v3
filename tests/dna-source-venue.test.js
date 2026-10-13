'use strict';
const assert=require('node:assert/strict');
const {classify}=require('../scripts/dna-source-venue.js');
const d={status:'ok',stage:'universe',method:'dna',items:[],sourceState:{marketSource:'binance-futures'}};
assert.equal(classify(d).status,'PASS');
assert.equal(classify({...d,sourceState:{marketSource:'bybit-futures-fallback'}}).status,'DEGRADED');
assert.equal(classify({...d,sourceState:null}).status,'FAIL');
console.log('DNA venue provenance PASS');

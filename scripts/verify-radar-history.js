const assert=require('assert');
const history=require('../ui/radar-history.js');

history.reset();
const id='binance:spot:BTCUSDT';
const base={id,price:100,quoteVolumeUsd:1000,txCount:100};

history.record(base,0);
history.record({...base,price:101,quoteVolumeUsd:1200,txCount:115},60000);
history.record({...base,price:105,quoteVolumeUsd:1800,txCount:150},300000);
history.record({...base,price:106,quoteVolumeUsd:2000,txCount:165},360000);

const m=history.metricsFor(id,{...base,price:106,quoteVolumeUsd:2000,txCount:165},360000);
assert(Math.abs(m.change1m-0.95238)<0.01,'1m change should use observation at/before 60s ago');
assert(Math.abs(m.change5m-4.95049)<0.01,'5m change should use observation at/before 300s ago');
assert.equal(m.volumeDelta1m,200,'1m volume delta');
assert.equal(m.volumeDelta5m,800,'5m volume delta');
assert.equal(m.txDelta1m,15,'1m tx delta');
assert.equal(m.txDelta5m,50,'5m tx delta');

history.reset();
history.record(base,100000);
const insufficient=history.metricsFor(id,{...base,price:101},120000);
assert.equal(insufficient.change1m,null,'insufficient 1m history must be null');
assert.equal(insufficient.change5m,null,'insufficient 5m history must be null');

history.record({...base,price:102},100000);
assert.equal(history._debugCount(id),1,'same timestamp should replace instead of duplicate');

history.record({...base,price:103},100000+7*60000);
assert(history._debugOldestTs(id)>=100000+60000,'history older than retention should be pruned');

console.log('radar history behavior PASS');

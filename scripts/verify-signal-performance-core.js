const assert=require('assert');
const Core=require('../lib/signal-performance/core.js');

assert.equal(Core.isEligibleClass('PRE-SURGE'),true);
assert.equal(Core.isEligibleClass('ACCUMULATION-PRE'),true);
assert.equal(Core.isEligibleClass('META-PRE'),true);
assert.equal(Core.isEligibleClass('SECTOR-ROTATION'),true);
assert.equal(Core.isEligibleClass('ANOMALY'),true);
for(const k of ['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE'])assert.equal(Core.isEligibleClass(k),false);

assert.equal(Core.bucketStart(35*60*1000),30*60*1000);
assert.equal(Core.snapshotId({symbol:'ONEUSDT',scanClassKey:'PRE-SURGE',capturedAt:35*60*1000}),'ONEUSDT:PRE-SURGE:1800000');
assert.deepEqual(Core.targetTimestamps(1000),{m15:901000,h1:3601000,h4:14401000,h24:86401000});
assert(Math.abs(Core.returnPct(100,105)-5)<1e-9);

const snap=Core.buildSnapshot({symbol:'ONEUSDT',scanClass:{key:'PRE-SURGE',label:'🔥 급등 직전'},capturedAt:1000,lastPrice:100,tradeSignal:{level:'매수 후보',confidence:82},candidateScore:77,sector:'AI',priceChange24h:2.1,volumeAcceleration:3.4,takerRatio:1.3,momentumSignals:{rsi15m:55},reasons:['x']});
assert(Object.isFrozen(snap));
assert.equal(snap.entryPrice,100);
assert.equal(snap.scanClassKey,'PRE-SURGE');
assert.equal(snap.targets.h1,3601000);

const small=Core.aggregate([{status:'evaluated',returnPct:2},{status:'evaluated',returnPct:-1},{status:'pending'}],30);
assert.equal(small.sampleCount,3);
assert.equal(small.evaluatedCount,2);
assert.equal(small.pendingCount,1);
assert.equal(small.positiveRatio,.5);
assert.equal(small.meanReturnPct,.5);
assert.equal(small.medianReturnPct,.5);
assert.equal(small.bestReturnPct,2);
assert.equal(small.worstReturnPct,-1);
assert.equal(small.sampleState,'표본 부족');
console.log('signal performance core PASS');

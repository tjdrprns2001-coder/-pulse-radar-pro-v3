'use strict';
const assert=require('assert');
const O=require('../lib/coin-scan/sampling-v3-oos.js');

const hour=3600000,start=Date.parse('2026-01-01T00:00:00Z');
const events=Array.from({length:120},(_,i)=>{
  const surge=i%3===0;
  return{
    id:'e'+i,
    startTime:start+i*hour,
    endTime:start+(i+3)*hour,
    label:surge?'SURGE':(i%3===1?'FAILED_BOS':'NO_TRIGGER'),
    score:surge?80:20
  };
});
const u=O.uniquenessWeights(events);
assert.equal(Object.keys(u).length,120);
assert(Object.values(u).every(x=>x>0&&x<=1));

const boot=O.sequentialBootstrap(events,60,{seed:42});
assert.equal(boot.length,60);
assert(boot.every((x,i)=>x.bootstrapDraw===i),'sequential bootstrap draw order must be explicit');
assert(new Set(boot.map(x=>x.id)).size<=60,'bootstrap sampling may draw overlapping events with replacement');

const folds=O.buildPurgedWalkForward(events,{folds:4,minTrain:20,embargoMs:hour});
assert(folds.length>=3,'purged walk-forward folds required');
for(const f of folds){
  assert(f.train.every(x=>x.endTime<f.testStart-hour),'training labels must finish before embargo cutoff');
  assert(f.purged.every(x=>x.endTime>=f.testStart-hour),'purged records must be overlap/embargo risks');
}
const v=O.validate(events,{folds:4,minTrain:20,embargoMs:hour,bootstrapSize:50,seed:7});
assert.equal(v.version,'SAMPLING_V3_OOS_v1');
assert.equal(v.status,'READY');
assert(v.foldCount>=3);
assert(v.meanAccuracy>.9,'synthetic causal fixture should classify cleanly');
assert.equal(v.promotionGate.passed,true);

console.log('sampling v3 OOS PASS',JSON.stringify({folds:v.foldCount,meanAccuracy:v.meanAccuracy,gate:v.promotionGate}));

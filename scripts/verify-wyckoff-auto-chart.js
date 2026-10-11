'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const W=require('../ui/auto-chart/analysis/wyckoff-evidence.js');
const Core=require('../ui/auto-chart/analysis/core.js');
const t0=1700000000000,step=3600000;
function bar(i,{open=100,high=102,low=98,close=100,volume=1000}={}){
 return{openTime:t0+i*step,closeTime:t0+(i+1)*step-1,open,high,low,close,volume,closed:true};
}
const seq=Array.from({length:60},(_,i)=>bar(i,{open:100,high:102+(i%2)*.1,low:98-(i%2)*.1,close:100+(i%4)*.2,volume:900+(i%5)*50}));
const asOf=seq.at(-1).closeTime;
const quiet=W.detect(seq,{asOf});assert.equal(quiet.status,'READY');assert.equal(quiet.pattern,'RANGE_WATCH');
const springSeq=seq.slice(0,-1).concat([bar(59,{open:98.5,high:101,low:96.8,close:100.7,volume:2600})]);
const spring=W.detect(springSeq,{asOf});assert.equal(spring.pattern,'SPRING_CANDIDATE');
assert.equal(spring.invalidation.price,96.8);assert(spring.evidence.some(x=>x.field==='springReclaim'));
assert.equal(spring.cvdAvailable,false);assert.equal(spring.absorptionVerified,false);
const upSeq=seq.slice(0,-1).concat([bar(59,{open:101.5,high:104.5,low:99,close:99.5,volume:2500})]);
const up=W.detect(upSeq,{asOf});assert.equal(up.pattern,'UPTHRUST_CANDIDATE');
assert.equal(up.invalidation.price,104.5);assert(up.evidence.some(x=>x.field==='upthrustRejection'));
const future=springSeq.concat([bar(60,{open:100,high:125,low:50,close:120,volume:99999})]);
assert.deepEqual(W.detect(future,{asOf}),spring,'unclosed future data must not leak');
const partial=springSeq.map((c,i)=>i===59?{...c,closed:false}:c);
assert.equal(W.detect(partial,{asOf}).pattern,'RANGE_WATCH','forming bars must be excluded');
const short=W.detect(seq.slice(0,20),{asOf});assert.equal(short.status,'INSUFFICIENT_HISTORY');
const evidence=fs.readFileSync('auto-chart-lab.html','utf8');
for(const id of ['cardWyckoff','cardWyckoffEvidence','cardWyckoffCounter','cardWyckoffInvalidation'])
 assert(evidence.includes('id="'+id+'"'));
assert(evidence.includes('analysis/wyckoff-evidence.js'));
const card=fs.readFileSync('ui/auto-chart/ui/analysis-card.js','utf8');
assert(card.includes("setText('cardWyckoff'")&&card.includes("setText('cardWyckoffInvalidation'"));
assert(Core.analyze.toString().includes('wyckoffEvidence'));
console.log('Wyckoff Spring/Upthrust close-only evidence, invalidation, future leak, UI integration PASS');

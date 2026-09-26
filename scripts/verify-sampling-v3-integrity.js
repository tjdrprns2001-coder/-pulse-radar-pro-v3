'use strict';
const assert=require('assert');
const Sampling=require('../lib/coin-scan/sampling-v3.js');
const I=require('../lib/coin-scan/sampling-v3-integrity.js');

const minute=60000,start=Math.floor(Date.parse('2026-09-27T00:00:00Z')/(15*minute))*(15*minute),asOf=start+181*minute;
const rows=Array.from({length:180},(_,i)=>{
  const p=100+i*.01,v=1000+i;
  return[start+i*minute,String(p),String(p+.1),String(p-.1),String(p+.02),String(v),start+(i+1)*minute-1,String(v*p),100,String(v*.55),String(v*.55*p),'0'];
});
const annotated=I.annotateRows(rows,'1m',{asOf,source:'FIXTURE'});
assert.equal(annotated.length,180);
assert(annotated.every(x=>x.isClosed&&x.isComplete&&!x.isSynthetic));
assert(annotated.every(x=>x.featureAvailableAt===x.closeTime));

const a=I.auditSeries(rows,'1m',{asOf});
assert.equal(a.status,'PASS');
assert.equal(a.gapCount,0);
assert.equal(a.duplicateCount,0);

const bad=[rows[1],rows[0],...rows.slice(2),rows[10]];
const ab=I.auditSeries(bad,'1m',{asOf});
assert(['WARN','FAIL'].includes(ab.status));
assert(ab.outOfOrderCount>0);
assert(ab.duplicateCount>0);

const native5=Sampling.resampleOHLCV(rows,'1m','5m',{asOf,dropPartial:true});
const native15=Sampling.resampleOHLCV(rows,'1m','15m',{asOf,dropPartial:true});
const audit=I.auditNativeVsSynthetic({rows1m:rows,native5m:native5,native15m:native15,asOf});
assert.equal(audit.status,'PASS');
assert.equal(audit.comparisons['5m'].mismatchCount,0);
assert.equal(audit.comparisons['15m'].mismatchCount,0);

const decisions=[start+31*minute,start+61*minute,start+91*minute];
const merged=I.asOfMerge(decisions,native15,'15m');
assert.equal(merged.length,3);
assert(merged.every(x=>!x.lookahead));
assert(merged.every(x=>x.feature==null||x.feature.closeTime<x.decisionTime),'HTF value must only become available after close');

const partial=rows.slice(0,179);
const synth=Sampling.resampleOHLCV(partial,'1m','15m',{asOf:start+180*minute,dropPartial:true});
assert.equal(synth.length,11,'incomplete final 15m bucket must be dropped');

console.log('sampling v3 integrity PASS');

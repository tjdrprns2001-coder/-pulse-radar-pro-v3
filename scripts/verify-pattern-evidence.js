'use strict';
const assert=require('node:assert/strict');
const {toClosedCandles,candlePatterns,analyzePatternEvidence}=require('../lib/coin-scan/pattern-evidence.js');
const day=86400000,rows=[],anchor=1700000000000;
const push=(close,volume=100)=>{const t=anchor+rows.length*day;rows.push([t,String(close),String(close*1.004),String(close*.996),String(close),String(volume),t+day-1])};
for(let i=0;i<448;i++)push(100);
for(let i=0;i<30;i++)push(100-20*(i+1)/30);
for(let i=0;i<35;i++)push(80+Math.sin(i/5)*.6);
push(88,300);
const asOf=rows.at(-1)[6]+10;
const out=analyzePatternEvidence({frames:{'1d':rows,'4h':rows},asOf});
assert.equal(out.status,'READY');
assert.equal(out.shadowOnly,true);
assert.equal(out.daily.bowl.signal,false,'Price is below MA224/448 and should not be promoted');
assert.equal(out.fourHour.bowl.status,'BREAKOUT_CONFIRMED');
assert.equal(out.fourHour.bowl.signal,true);
assert(out.daily.bowl.movingAverages.ma448!==null);
const future=[...rows,[asOf+1,50,500,1,500,9000,asOf+day]];
assert.equal(toClosedCandles(future,asOf).length,rows.length,'In-progress candle must be excluded');
const futureResult=analyzePatternEvidence({frames:{'1d':future,'4h':future},asOf});
assert.deepEqual(futureResult.fourHour.bowl,out.fourHour.bowl);
assert.equal(analyzePatternEvidence({frames:{'1d':rows},asOf:null}).status,'UNAVAILABLE');
assert.equal(analyzePatternEvidence({frames:{'1d':rows.slice(-20)},asOf}).daily.status,'INSUFFICIENT_HISTORY');
const hammer=[{open:12,high:12.3,low:11.7,close:11.9},{open:11.9,high:12,low:11.3,close:11.4},{open:11.4,high:11.5,low:10.9,close:11},{open:11,high:11.1,low:10.6,close:10.7},{open:10.7,high:10.8,low:10.4,close:10.5},{open:10.6,high:10.66,low:9.5,close:10.65}];
assert(candlePatterns(hammer).some(x=>x.key==='HAMMER'));
const engulf=[{open:10,close:9,high:10.2,low:8.9},{open:8.9,close:10.3,high:10.5,low:8.8}];
assert(candlePatterns(engulf).some(x=>x.key==='BULLISH_ENGULFING'));
const morning=[
 {open:10,close:8,high:10.1,low:7.9},
 {open:8,close:8.1,high:8.3,low:7.9},
 {open:8.1,close:9.5,high:9.6,low:8.05}
];
assert(candlePatterns(morning).some(x=>x.key==='MORNING_STAR'));
const shooting=[8,8.3,8.6,8.9,9.2].map(x=>({open:x,close:x+.25,high:x+.3,low:x-.05}));
shooting.push({open:9.5,close:9.6,high:10.2,low:9.47});
assert(candlePatterns(shooting).some(x=>x.key==='SHOOTING_STAR'));
assert(candlePatterns([{open:11,close:9,high:11.2,low:8.8},{open:9.5,close:10,high:10.1,low:9.4}]).some(x=>x.key==='BULLISH_HARAMI'));
assert(candlePatterns([{open:10,close:9,high:10.2,low:8.9},{open:9,close:9.7,high:9.8,low:8.8}]).some(x=>x.key==='PIERCING'));
assert(candlePatterns(morning).every(x=>x.confirmed===false),'pattern geometry alone cannot confirm a trade');
console.log('pattern evidence adapter PASS');

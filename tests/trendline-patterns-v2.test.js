const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyTrendlinePattern,evaluateTrendlineBreak}=require('../lib/trendline-patterns.js');

test('classifies a converging falling wedge from ATR-normalized slopes',()=>{
  const out=classifyTrendlinePattern({
    support:{normalizedSlope:-0.12,currentLinePrice:90,anchorA:{barIndex:10}},
    resistance:{normalizedSlope:-0.28,currentLinePrice:94,anchorA:{barIndex:10}},
    pair:{parallelScore:45,convergencePct:55,widthNowAtr:2.1,barsToApex:18}
  });
  assert.equal(out.type,'falling_wedge');
  assert.equal(out.confirmed,true);
});

test('classifies parallel positive-width lines as channel',()=>{
  const out=classifyTrendlinePattern({
    support:{normalizedSlope:0.11,currentLinePrice:100,anchorA:{barIndex:5}},
    resistance:{normalizedSlope:0.12,currentLinePrice:106,anchorA:{barIndex:5}},
    pair:{parallelScore:92,convergencePct:4,widthNowAtr:3.5,barsToApex:null}
  });
  assert.equal(out.type,'channel');
  assert.equal(out.confirmed,true);
});

test('classifies converging mixed slopes as triangle',()=>{
  const out=classifyTrendlinePattern({
    support:{normalizedSlope:0.14,currentLinePrice:101,anchorA:{barIndex:8}},
    resistance:{normalizedSlope:-0.16,currentLinePrice:105,anchorA:{barIndex:8}},
    pair:{parallelScore:30,convergencePct:48,widthNowAtr:2.7,barsToApex:22}
  });
  assert.equal(out.type,'triangle');
  assert.equal(out.subtype,'symmetrical');
});

test('requires two ATR-qualified closes for a confirmed break',()=>{
  const candles=[
    {open:101,high:102,low:99,close:101,atr:2},
    {open:100,high:101,low:97,close:98,atr:2},
    {open:98,high:99,low:96,close:97,atr:2}
  ];
  const line={slope:0,intercept:100};
  const out=evaluateTrendlineBreak({candles,line,side:'support',start:0,end:2,strongCloseAtr:.5,confirmBars:2});
  assert.equal(out.confirmed,true);
  assert.equal(out.brokenAt,2);
});

test('single close beyond line does not confirm break',()=>{
  const candles=[{open:101,high:102,low:99,close:101,atr:2},{open:100,high:101,low:97,close:98,atr:2}];
  const out=evaluateTrendlineBreak({candles,line:{slope:0,intercept:100},side:'support',start:0,end:1,strongCloseAtr:.5,confirmBars:2});
  assert.equal(out.confirmed,false);
});

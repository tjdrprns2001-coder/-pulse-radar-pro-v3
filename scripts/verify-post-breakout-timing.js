'use strict';
const assert=require('assert');
const S=require('../lib/coin-scan/strategy-pattern-engine.js');

function base(){
  const out=[];let p=99.2;
  for(let i=0;i<30;i++){
    const open=p,close=99.25+(i%3)*.05;
    out.push({index:i,time:i,open,high:Math.max(open,close)+.45,low:Math.min(open,close)-.45,close,volume:1000,closeTime:i,confirmed:true,isClosed:true,partial:false});
    p=close;
  }
  return out;
}
function bar(i,o,h,l,c){return{index:i,time:i,open:o,high:h,low:l,close:c,volume:1200,closeTime:i,confirmed:true,isClosed:true,partial:false}}
const book={trendline:{best:{side:'상승',line:100,state:'CLOSE_CONFIRMED',kind:'하락추세선 상방돌파'}}};

let c=base();
c.splice(-7,7,
  bar(23,99.4,100.9,99.2,100.7),
  bar(24,100.8,101.7,100.6,101.5),
  bar(25,101.5,102.3,101.3,102.1),
  bar(26,102.1,102.9,101.9,102.7),
  bar(27,102.7,103.5,102.5,103.3),
  bar(28,103.3,104.0,103.1,103.8),
  bar(29,103.8,104.5,103.6,104.2)
);
let x=S.postBreakoutState(c,'4h',null,book);
assert(x,'late-entry state required');
assert.equal(x.stage,'LATE_ENTRY_WARNING');
assert(x.distanceAtr>=1.5,'late entry must be ATR-extended');

c=base();
c.splice(-7,7,
  bar(23,99.4,100.9,99.2,100.7),
  bar(24,100.7,101.5,100.5,101.3),
  bar(25,101.3,101.6,99.95,100.55),
  bar(26,100.55,101.2,100.05,100.8),
  bar(27,100.8,101.4,100.4,101.0),
  bar(28,101.0,101.5,100.6,101.2),
  bar(29,101.2,101.7,100.8,101.3)
);
x=S.postBreakoutState(c,'4h',null,book);
assert.equal(x.stage,'RETEST_SUPPORT_HOLD');
assert.equal(x.held,true);
assert.equal(x.touched,true);

c=base();
c.splice(-7,7,
  bar(23,99.4,100.9,99.2,100.7),
  bar(24,100.7,101.5,100.5,101.3),
  bar(25,101.3,101.4,99.8,100.2),
  bar(26,100.2,100.6,99.3,99.55),
  bar(27,99.55,100.0,99.0,99.4),
  bar(28,99.4,99.8,98.9,99.2),
  bar(29,99.2,99.7,98.7,99.0)
);
x=S.postBreakoutState(c,'4h',null,book);
assert.equal(x.stage,'FAILED_RETEST_RESISTANCE');
assert.equal(x.failed,true);
assert(x.scoreDelta<0,'failed retest must reduce promotion score');

console.log('post-breakout timing PASS');

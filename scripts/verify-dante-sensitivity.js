'use strict';
const assert=require('assert');
const S=require('../lib/dante/sensitivity.js');
{
 const a={breakout:{breakoutBufferAtr:.2,minPriorClosesBelowPivot:80}},b=S.deepMerge(a,{breakout:{breakoutBufferAtr:.1}});
 assert.equal(b.breakout.breakoutBufferAtr,.1);assert.equal(b.breakout.minPriorClosesBelowPivot,80);assert.equal(a.breakout.breakoutBufferAtr,.2,'merge must not mutate base params');
 assert(S.DEFAULT_GRID.some(x=>x.id==='prior-below-60'));assert(S.DEFAULT_GRID.some(x=>x.id==='prior-below-100'));assert(S.DEFAULT_GRID.some(x=>x.id==='256-dist-2.0'));
}
{
 const row={id:'x',eventCount:2,summary:{overall:{n:2,horizons:{'20':{netReturnPct:{n:2,mean:1,median:.5,positiveRate:.5,tradeSharpe:.2}},'40':{netReturnPct:{n:2,mean:2,median:1,positiveRate:1,tradeSharpe:.4}}}},byStrategy:{DANTE_256:{n:2,horizons:{'20':{netReturnPct:{n:2,mean:1}},'40':{netReturnPct:{n:2,mean:2}}}}},bySplit:{train:{n:1,horizons:{'20':{netReturnPct:{n:1,mean:1}},'40':{netReturnPct:{n:1,mean:2}}}},validation:{n:1,horizons:{'20':{netReturnPct:{n:1,mean:1}},'40':{netReturnPct:{n:1,mean:2}}}}}}};
 const x=S.compactSummary(row);assert.equal(x.id,'x');assert.equal(x.overall.h40.mean,2);assert.equal(x.strategies.DANTE_256.n,2);assert.equal(x.validation.n,1);
}
console.log('dante sensitivity PASS');
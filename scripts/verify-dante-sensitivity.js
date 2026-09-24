'use strict';
const assert=require('assert');
const S=require('../lib/dante/sensitivity.js');
{
 const a={breakout:{breakoutBufferAtr:.2,minPriorClosesBelowPivot:80}},b=S.deepMerge(a,{breakout:{breakoutBufferAtr:.1}});
 assert.equal(b.breakout.breakoutBufferAtr,.1);assert.equal(b.breakout.minPriorClosesBelowPivot,80);assert.equal(a.breakout.breakoutBufferAtr,.2,'merge must not mutate base params');
 assert(S.DEFAULT_GRID.some(x=>x.id==='prior-below-60'));assert(S.DEFAULT_GRID.some(x=>x.id==='prior-below-100'));assert(S.DEFAULT_GRID.some(x=>x.id==='256-dist-2.0'));
}
console.log('dante sensitivity PASS');
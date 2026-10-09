'use strict';
const assert=require('node:assert/strict');
const {detectBowlSymmetry,sma}=require('../lib/coin-scan/bowl-symmetry.js');
const c=[];
function add(price,volume=100){c.push({open:price,high:price*1.004,low:price*.996,close:price,volume});}
// Warm-up contains 448 observations, then a clear decline, base and breakout.
for(let i=0;i<448;i++)add(100,100);
for(let i=0;i<30;i++)add(100-(20*(i+1)/30),100);
for(let i=0;i<35;i++)add(80+Math.sin(i/5)*.6,100);
add(88,300);
const result=detectBowlSymmetry(c,{requireLongMa:false});
assert.equal(result.status,'BREAKOUT_CONFIRMED',JSON.stringify(result));
assert.equal(result.signal,true);
assert(result.symmetryRatio>=0.8);
assert(result.volumeRatio>=1.2);
assert.equal(result.movingAverages.ma448!==null,true);
assert.equal(detectBowlSymmetry(c.slice(0,10)).status,'INSUFFICIENT_HISTORY');
assert.equal(detectBowlSymmetry([...c.slice(0,-1),{...c.at(-1),close:NaN}]).status,'INVALID_CANDLES');
assert.equal(detectBowlSymmetry(c,{requireLongMa:true}).signal,false,'Long MA confirmation must be enforced');
assert.equal(sma([1,2,3,4],3),3);
console.log('bowl symmetry detector PASS');

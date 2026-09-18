'use strict';
const assert=require('assert');
const {compute1hIntersectionFeatures,qualifiesIntersection,findFirst1hIntersection}=require('../lib/research-backtest-v2/bowl224/intersection.js');
const {build4hContext}=require('../lib/research-backtest-v2/bowl224/context4h.js');
const H=3600000;
function bar(i,{c=100,v=100,h=101,l=99}={}){return[i*H,c,h,l,c,v,(i+1)*H-1,c*v,1,v/2,c*v/2,0]}
assert.equal(qualifiesIntersection({volume_ratio_12h:3,ribbon_width_atr:1.5,price_distance_atr:2}),true);
assert.equal(qualifiesIntersection({volume_ratio_12h:2.999,ribbon_width_atr:1,price_distance_atr:1}),false);
assert.equal(qualifiesIntersection({volume_ratio_12h:3,ribbon_width_atr:1.501,price_distance_atr:1}),false);
assert.equal(qualifiesIntersection({volume_ratio_12h:3,ribbon_width_atr:1,price_distance_atr:2.001}),false);

const pre=Array.from({length:100},(_,i)=>bar(i));
const candidate=bar(100,{v:300});
const later=bar(101,{v:350});
const rows=[...pre,candidate,later,...Array.from({length:75},(_,j)=>bar(102+j))];
const f=compute1hIntersectionFeatures(rows,100);
assert.equal(f.volume_ratio_12h,3);
assert(Math.abs(f.ribbon_width_atr)<=1e-12);
assert(Math.abs(f.price_distance_atr)<=1e-12);
assert.equal(f.qualifies,true);

const found=findFirst1hIntersection(rows,{afterTs:pre[99][6],maxCompletedBars:72});
assert(found.primary);assert.equal(found.primary.index,100);
assert(found.repeats.some(x=>x.index===101));
assert.equal(found.examinedBars,72);

const tooLate=pre.concat(Array.from({length:72},(_,j)=>bar(100+j)),bar(172,{v:300}));
assert.equal(findFirst1hIntersection(tooLate,{afterTs:pre[99][6],maxCompletedBars:72}).primary,null);

const ctx=build4hContext(Array.from({length:120},(_,i)=>bar(i,{c:100+i*.1,v:100+i})),{cutoffTs:120*H-1});
assert.equal(typeof ctx.return_4h_pct,'number');
assert.equal(typeof ctx.ema_distance_atr,'number');
assert.equal(Object.prototype.hasOwnProperty.call(ctx,'gate'),false);
assert.equal(Object.prototype.hasOwnProperty.call(ctx,'included'),false);
console.log('bowl224 intersection PASS');
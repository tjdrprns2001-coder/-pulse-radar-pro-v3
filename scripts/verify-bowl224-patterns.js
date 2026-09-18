'use strict';
const assert=require('assert');
const {detect3A,annotate3B,annotate3C}=require('../lib/research-backtest-v2/bowl224/patterns.js');
const DAY=86400000;
function base(n=360){return Array.from({length:n},(_,i)=>({openTime:i*DAY,closeTime:(i+1)*DAY-1,close:90,high:91,low:89,ma224:100,atr14:5}))}
let s=base();
s[348]={...s[348],close:100,ma224:100};
s[349]={...s[349],close:101,ma224:100};
let e=detect3A(s,349);assert(e&&e.is_3a);assert.equal(e.signalIndex,349);assert.equal(e.strict_bowl_120d,true);
const snap=JSON.stringify(e);
s[350]={...s[350],close:102};s[351]={...s[351],close:103};s[352]={...s[352],close:99};
let b=annotate3B(s,e);assert.equal(b.is_3b,true);assert.equal(b.aboveCount,2);assert.equal(b.confirmationIndex,351);
assert.equal(JSON.stringify(e),snap,'3B mutated 3A event');

let s2=base();s2[348]={...s2[348],close:100};s2[349]={...s2[349],close:101};
s2[350]={...s2[350],close:102};s2[351]={...s2[351],close:99};s2[352]={...s2[352],close:103};
e=detect3A(s2,349);b=annotate3B(s2,e);assert.equal(b.is_3b,true);assert.equal(b.confirmationIndex,352);
s2[352]={...s2[352],close:99};b=annotate3B(s2,e);assert.equal(b.is_3b,false);

// strict gate failure
let bad=base();bad[300]={...bad[300],close:101};bad[348]={...bad[348],close:100};bad[349]={...bad[349],close:101};
assert.equal(detect3A(bad,349),null);

// Continuous above run does not create another 3A
s[350]={...s[350],close:102};assert.equal(detect3A(s,350),null);

// 3C: first qualifying retest within 14 days
let cseries=base(370);cseries[348]={...cseries[348],close:100};cseries[349]={...cseries[349],close:105,high:106,low:104};
e=detect3A(cseries,349);assert(e);
for(let i=350;i<=363;i++)cseries[i]={...cseries[i],close:108,high:109,low:107,ma224:100,atr14:5};
cseries[354]={...cseries[354],close:104,high:105,low:101,ma224:100,atr14:5}; // low within 1 ATR; close > prior? prior 108 => no
cseries[355]={...cseries[355],close:106,high:107,low:103,ma224:100,atr14:5}; // qualifies vs 104
let cc=annotate3C(cseries,e);assert.equal(cc.is_3c,true);assert.equal(cc.confirmationIndex,355);assert.equal(cc.days_3a_to_3c,6);
assert.equal(JSON.stringify(e),JSON.stringify(detect3A(cseries,349)),'3C mutated event');

let late=base(370);late[348]={...late[348],close:100};late[349]={...late[349],close:105};
for(let i=350;i<370;i++)late[i]={...late[i],close:110,high:111,low:109,ma224:100,atr14:5};
late[364]={...late[364],close:102,low:101}; // day15, outside exactly 14
cc=annotate3C(late,detect3A(late,349));assert.equal(cc.is_3c,false);
console.log('bowl224 patterns PASS');
'use strict';
const assert=require('assert');
const F=require('../lib/coin-scan/fakeout-state-engine.js');

function bar(i,close,high=close+.5,low=close-.5,open=close-.1){return{index:i,time:i,open,high,low,close,volume:1000,closeTime:i}}
function base(){const a=[];for(let i=0;i<18;i++)a.push(bar(i,99.2+(i%3)*.08,99.8,98.8));return a}

let c=base();
c.push(bar(18,100.8,101.1,99.7,99.5));
c.push(bar(19,101.1,101.4,100.5,100.8));
c.push(bar(20,99.7,100.3,99.2,100.9));
c.push(bar(21,99.5,100.05,99.0,99.7));
let x=F.analyzeLevel(c,'4h',100,{closeBufferFraction:.001,minBarsBeforeFakeout:1,recoveryBufferFraction:.001});
assert(x&&x.longBlocked,'fakeout must block long');
assert(['FAKEOUT_CONFIRMED','RESISTANCE_FLIP'].includes(x.stage),'fakeout risk stage required');

c=base();
c.push(bar(18,100.8,101.1,99.7,99.5));
c.push(bar(19,101.1,101.4,100.5,100.8));
c.push(bar(20,99.7,100.3,99.2,100.9));
c.push(bar(21,100.7,101.0,100.2,99.8));
c.push(bar(22,100.9,101.2,100.3,100.7));
x=F.analyzeLevel(c,'4h',100,{closeBufferFraction:.001,minBarsBeforeFakeout:1,recoveryBufferFraction:.001});
assert(x&&!x.longBlocked,'recovered fakeout must release long block');
assert.equal(x.stage,'RECOVERED');

c=base();
c.push(bar(18,100.8,101.1,99.7,99.5));
c.push(bar(19,101.2,101.5,100.5,100.8));
c.push(bar(20,101.4,101.7,100.9,101.2));
x=F.analyzeLevel(c,'4h',100,{closeBufferFraction:.001,minBarsBeforeFakeout:1,recoveryBufferFraction:.001});
assert.equal(x.stage,'BREAKOUT_ACTIVE');
assert.equal(x.longBlocked,false);
console.log('fakeout state engine PASS');

'use strict';
const assert=require('assert');
const D=require('../ui/dante/dante-256-engine.js');
function rows(vals){return vals.map((v,i)=>({time:1000+i*1000,closeTime:1000+i*1000,open:v-.1,high:v+.4,low:v-.4,close:v,volume:100,partial:false}))}
const vals=[];for(let i=0;i<70;i++)vals.push(100-i*.2);for(let i=0;i<8;i++)vals.push(86+i*.6);
const c=rows(vals),asOf=c.at(-1).closeTime+1;
const r=D.analyze({candles:c,analysisAsOf:asOf,params:{emaFast:3,emaMid:5,emaSlow:8,emaSeedBars:8,atrPeriod:3,maxDistanceToEma60Atr:20}});
assert.equal(r.mode,'SHADOW_ONLY');assert.equal(r.rankingContribution,0);assert(['CANDIDATE','NOT_CONFIRMED'].includes(r.status));
assert.throws(()=>D.analyze({candles:[...c.slice(0,-1),{...c.at(-1),partial:true}],analysisAsOf:asOf,params:{emaFast:3,emaMid:5,emaSlow:8,emaSeedBars:8,atrPeriod:3,maxDistanceToEma60Atr:20}}),/CLOSED_ONLY/i);
console.log('dante 256 PASS');
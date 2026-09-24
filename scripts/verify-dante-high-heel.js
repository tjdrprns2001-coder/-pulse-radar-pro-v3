'use strict';
const assert=require('assert');
const D=require('../ui/dante/high-heel-engine.js');
function c(i,v,vol=100){return{time:1000+i*1000,closeTime:1000+i*1000,open:v-.2,high:v+.6,low:v-.6,close:v,volume:vol,partial:false}}
const rows=[];for(let i=0;i<25;i++)rows.push(c(i,100+i*.1,100));for(let i=25;i<30;i++)rows.push(c(i,102-(i-24)*4,150));rows.push(c(30,86,200));rows.push(c(31,91,250));rows.push(c(32,96,300));rows.push(c(33,99,400));
const r=D.analyze({candles:rows,analysisAsOf:rows.at(-1).closeTime+1,params:{lookbackBars:20,minDropPct:10,reversalWindowBars:5,minRecoveryPctOfDrop:.35,minRvol:1.5,volumeLookback:10}});
assert.equal(r.status,'CANDIDATE');assert(r.evidenceFactIds.includes('SHARP_DROP'));assert(r.evidenceFactIds.includes('V_RECOVERY'));assert.equal(r.rankingContribution,0);
console.log('dante high heel PASS');
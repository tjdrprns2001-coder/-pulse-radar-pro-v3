'use strict';
const assert=require('node:assert/strict');
const FX=require('../ui/forex-book/forex-book-engine.js');

function candles(n=120){
  return Array.from({length:n},(_,i)=>{
    const v=100+i*.25+Math.sin(i/8)*2;
    return{time:i,open:v-.15,high:v+1.2,low:v-1.1,close:v,volume:100+i};
  });
}
const src=candles();
const raw=FX.ichimoku(src);
assert.equal(raw.spanA[0],null,'no projected spans before tenkan/kijun warmup');
assert.equal(raw.spanB[0],null,'no 52-bar span before warmup');
assert(Number.isFinite(raw.spanA[80])&&Number.isFinite(raw.spanB[80]));

const short=FX.computeIndicators(src.slice(0,60));
assert.equal(short.ichimoku.cloudTop,null,'a current cloud requires 52+26 closed observations');
assert(!short.signals.some(x=>x.id==='ichimoku'),'an unknown cloud must not promote a direction');

const t=100,report=FX.computeIndicators(src.slice(0,t));
const sourceIdx=t-1-26;
assert.equal(report.ichimoku.cloudSourceIndex,sourceIdx);
assert.equal(report.ichimoku.displacement,26);
assert.equal(report.ichimoku.currentCloudSpanA,raw.spanA[sourceIdx]);
assert.equal(report.ichimoku.currentCloudSpanB,raw.spanB[sourceIdx]);
assert.equal(report.ichimoku.cloudTop,Math.max(raw.spanA[sourceIdx],raw.spanB[sourceIdx]));
assert.equal(report.ichimoku.cloudBottom,Math.min(raw.spanA[sourceIdx],raw.spanB[sourceIdx]));
assert.equal(report.ichimoku.spanA,raw.spanA[t-1],'projected Senkou A remains available separately');
assert.equal(report.ichimoku.spanB,raw.spanB[t-1],'projected Senkou B remains available separately');

// A price known at index 99 must not use an index 99 cloud projected to 125.
const nowCloud=report.ichimoku.cloudTop;
const projectedTop=Math.max(raw.spanA[t-1],raw.spanB[t-1]);
assert.notEqual(nowCloud,projectedTop,'current and forward-projected clouds are different objects');
console.log('causal Ichimoku cloud PASS');

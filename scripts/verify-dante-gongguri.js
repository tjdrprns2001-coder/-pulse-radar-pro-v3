'use strict';
const assert=require('assert');
const G=require('../ui/dante/gongguri-engine.js');
function c(i,close,high,low,volume=100){return{time:1000+i*1000,closeTime:1000+i*1000,open:close-.1,high,low,close,volume,partial:false}}
const rows=[];
for(let i=0;i<22;i++)rows.push(c(i,99+(i%2)*.3,100+(i%3===0?.1:0),98.5,100));
rows.push(c(22,101.3,101.8,99.9,300));
rows.push(c(23,100.2,100.8,99.7,120));
rows.push(c(24,101.0,101.3,99.9,140));
rows.push(c(25,101.2,101.5,100.2,150));
const asOf=rows.at(-1).closeTime+1;
{
  const r=G.analyze({candles:rows,analysisAsOf:asOf,params:{boxLookback:20,minPriorTouches:2,maxBoxAtrWidth:20,breakoutBufferAtr:.05,retestToleranceAtr:.4,reclaimBufferAtr:.02,minHoldBars:1,maxRetestBars:5},level:100});
  assert(['CANDIDATE','CONFIRMED'].includes(r.status));
  assert(r.evidenceFactIds.includes('GONGGURI_LEVEL_QUALIFIED'));
  assert(r.evidenceFactIds.includes('GONGGURI_BREAKOUT'));
  assert(r.paramsHash);
}
{
  const sparse=rows.map((x,i)=>({...x,high:i===5?100:99.2,close:98.8,low:98}));
  const r=G.analyze({candles:sparse,analysisAsOf:asOf,params:{boxLookback:20,minPriorTouches:2,maxBoxAtrWidth:20},level:100});
  assert.equal(r.status,'NOT_CONFIRMED');
}
{
  assert.throws(()=>G.analyze({candles:[...rows.slice(0,-1),{...rows.at(-1),partial:true}],analysisAsOf:asOf,level:100}),/CLOSED_ONLY/i);
}
console.log('dante gongguri PASS');
'use strict';
const assert=require('assert');
const E=require('../ui/dante/ema-strike-engine.js');
function rows(vals){return vals.map((v,i)=>({time:1000+i*1000,closeTime:1000+i*1000,open:v-.2,high:v+.5,low:v-.5,close:v,volume:100,partial:false}))}
const vals=[];for(let i=0;i<30;i++)vals.push(120-i*1.5);for(let i=0;i<10;i++)vals.push(76+i*1.8);
const c=rows(vals),asOf=c.at(-1).closeTime+1;
{
  const r=E.analyze({candles:c,analysisAsOf:asOf,params:{ema:{fast:3,pivot:5,long:8}}});
  assert.notEqual(r.state,'NO_STRIKE');
  assert.equal(r.status==='CANDIDATE'||r.status==='INVALIDATED',true);
  assert(r.paramsHash);
}
{
  const bad=[...c.slice(0,-1),{...c.at(-1),partial:true}];
  assert.throws(()=>E.analyze({candles:bad,analysisAsOf:asOf,params:{ema:{fast:3,pivot:5,long:8}}}),/CLOSED_ONLY/i);
}
console.log('dante ema strike PASS');
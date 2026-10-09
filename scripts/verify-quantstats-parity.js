'use strict';
// Actual QuantStats parity: run pinned Python quantstats==0.0.86 as reference, no reimplementation.
const assert=require('node:assert/strict');
const child=require('node:child_process'),path=require('node:path');
const {riskFromDailyEquity}=require('../lib/research-backtest-v2/quantstyle-performance.js');

const DAY=86400000,START=Date.parse('2025-01-01T23:59:59.999Z');
const fixtures={};
function make(name,n,returnFn){
 let equity=10000;const values=[{time:START,equity}];
 for(let i=1;i<n;i++){
  equity*=1+returnFn(i);
  assert(Number.isFinite(equity)&&equity>0);
  values.push({time:START+i*DAY,equity});
 }
 fixtures[name]=values;
}
make('flat_120',120,()=>0);
make('trend_180',180,i=>.00055+.0012*Math.sin(i*.117)+.0003*Math.cos(i*.047));
make('sawtooth_260',260,i=>.004*Math.sin(i*.47)-.001*Math.cos(i*.16)+.0001);
make('shock_recovery_260',260,i=>i===70?-.21:i===71?.13:i===129?-.16:i===151?.09:.0007+.003*Math.sin(i*.19));
make('initial_loss_150',150,i=>i===1?-.18:.0015+.002*Math.sin(i*.12));
make('rising_only_150',150,i=>.0001+(i%5)*.0004);

const output=child.execFileSync('python3',[path.join(__dirname,'quantstats-parity-reference.py')],{
 input:JSON.stringify({fixtures}),encoding:'utf8',maxBuffer:4*1024*1024,timeout:90000
});
const oracle=JSON.parse(output);
assert.equal(oracle.reference,'quantstats');
assert.equal(oracle.version,'0.0.86','pinned reference version must not drift');
assert.equal(oracle.periodsPerYear,365.25);
assert.equal(oracle.riskFreeRate,0);
const metrics=['totalReturnPct','cagrPct','annualizedVolPct','sharpe','sortino','maxDrawdownPct'];
const comparisons=[];
for(const [name,series] of Object.entries(fixtures)){
 const js=riskFromDailyEquity(series,{annualRiskFreePct:0,minDays:30}),py=oracle.results[name];
 assert.equal(js.status,'READY',name);
 assert.equal(js.observationDays,py.observationDays,name);
 for(const metric of metrics){
  const current=js[metric],target=py[metric];
  if(current===null||target===null){
   assert.equal(current,target,name+' '+metric+' null parity');
   comparisons.push({fixture:name,metric,status:'BOTH_UNDEFINED'});
   continue;
  }
  const diff=Math.abs(current-target),tolerance=1e-6;
  assert(diff<=tolerance,JSON.stringify({fixture:name,metric,current,target,diff,tolerance}));
  comparisons.push({fixture:name,metric,maxAbsDelta:diff,status:'PASS'});
 }
}
const first=fixtures.initial_loss_150;
assert(riskFromDailyEquity(first).maxDrawdownPct<=-17.9,'first daily mark negative must be counted');
const tooShort=riskFromDailyEquity(fixtures.flat_120.slice(0,12));
assert.equal(tooShort.status,'INSUFFICIENT_DAILY_MARKS');
assert.equal(tooShort.sharpe,null);
assert.equal(tooShort.sortino,null);
const gap=fixtures.sawtooth_260.slice();gap[30]={...gap[30],time:gap[30].time+60000};
assert.equal(riskFromDailyEquity(gap).status,'UNAVAILABLE');
console.log('REAL QuantStats '+oracle.version+' parity PASS '+JSON.stringify({
 fixtures:Object.keys(fixtures),metrics,checks:comparisons.length,
 tolerance:1e-6,undefinedCases:comparisons.filter(x=>x.status==='BOTH_UNDEFINED').length
}));

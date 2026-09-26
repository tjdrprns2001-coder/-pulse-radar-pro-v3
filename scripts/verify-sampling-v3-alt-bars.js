'use strict';
const assert=require('assert');
const A=require('../lib/coin-scan/sampling-v3-alt-bars.js');

const start=Date.parse('2026-09-27T00:00:00Z');
const trades=[];
for(let i=0;i<600;i++){
  const block=Math.floor(i/12),buy=block%3!==2;
  trades.push({a:i,p:String(100+i*.002),q:String(2+(i%5)*.1),T:start+i*1000,m:!buy});
}
trades.push({...trades[100]}); // duplicate id must be removed

const n=A.normalizeAggTrades(trades);
assert.equal(n.length,600,'duplicate aggregate trade id must be removed');
assert(n.every((x,i)=>i===0||x.time>=n[i-1].time));

const d=A.buildDollarBars(trades,{minThresholdUsd:1000,dollarTargetTrades:20});
const im=A.buildImbalanceBars(trades,{minThresholdUsd:500,imbalanceTargetTrades:8});
const run=A.buildRunBars(trades,{minThresholdUsd:500,minRunTrades:6});
assert(d.length>0,'dollar bars required');
assert(im.length>0,'imbalance bars required');
assert(run.length>0,'run bars required');
assert(d.every(x=>x.tradeCount>0&&x.dollarVolume>=x.thresholdUsd));
assert(im.every(x=>Math.abs(x.signedImbalanceUsd)>=x.thresholdUsd));
assert(run.every(x=>x.runTrades>=6&&['BUY','SELL'].includes(x.direction)));

const s=A.summarize(trades,{minThresholdUsd:500,dollarTargetTrades:20,imbalanceTargetTrades:8,minRunTrades:6});
assert.equal(s.version,'SAMPLING_V3_ALT_BARS_v1');
assert.equal(s.status,'READY');
assert.equal(s.tradeCount,600);
assert.equal(s.diagnostics.duplicateSafe,true);
assert.equal(s.diagnostics.causalThresholds,true);
assert(s.bars.dollarCount>0&&s.bars.imbalanceCount>0&&s.bars.runCount>0);

console.log('sampling v3 alternative bars PASS',JSON.stringify(s.bars));

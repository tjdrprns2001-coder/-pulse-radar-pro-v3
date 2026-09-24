'use strict';
const assert=require('assert');
const P=require('../lib/research-backtest-v2/dante-presets.js');
const E=require('../lib/research-backtest-v2/execution-simulator.js');
const B=require('../lib/research-backtest-v2/dante-backtest.js');
const R=require('../lib/research-backtest-v2/performance-report.js');
const {createPaperTradingService}=require('../lib/research-backtest-v2/paper-trading.js');
const {createMemoryResearchStore}=require('../lib/research-backtest-v2/store.js');

function rows(n=700){
  const out=[];let p=100;
  for(let i=0;i<n;i++){
    const trend=i<250?-.04:i<500?.005:.06;
    p=Math.max(10,p+trend+Math.sin(i/7)*.25);
    const o=p-.1,c=p,h=p+.8,l=p-.8,v=1000+(i%13)*50;
    out.push([i*86400000,String(o),String(h),String(l),String(c),String(v),(i+1)*86400000-1,String(v*c),100,String(v*.55),String(v*c*.55),'0']);
  }
  return out;
}
(async()=>{
 const rs=rows();
 for(const id of ['256','bowl224','ma-hit']){
   const x=P.evaluatePreset(id,rs,{});
   assert(x&&x.version===P.VERSION);
   assert(/research proxy/i.test(x.semantics));
 }
 assert.equal(P.PRESETS['256'].sourceBoundary,'research proxy');

 const trade=E.simulateTrade({rows:rs,signalIndex:300,costAssumptions:{feeBps:10,spreadBps:2,slippageBps:5},exitPolicy:{type:'ema20-2close',maxHoldBars:20,atrStopMultiple:1.5}});
 assert.equal(trade.status,'filled');
 assert.equal(trade.entryIndex,301,'must fill at next eligible bar');
 assert(trade.costs.roundTripPct>0);

 const sigs=[{index:300,presetId:'256'},{index:360,presetId:'256'},{index:420,presetId:'256'}];
 const trades=E.simulateSignals({rows:rs,signals:sigs,costAssumptions:{feeBps:10,spreadBps:2,slippageBps:5},exitPolicy:{maxHoldBars:15}});
 const perf=R.buildPerformanceReport(trades);
 assert.equal(perf.sampleCount,3);
 for(const k of ['profitFactor','maxDrawdownPct','averageHoldingBars','totalCostDragPct'])assert(Object.prototype.hasOwnProperty.call(perf,k));

 const bt=B.runPresetBacktest({rows:rs,presetId:'256',costAssumptions:{feeBps:10,spreadBps:2,slippageBps:5},costMultipliers:[1,1.5,2]});
 assert(bt.stress['1x']&&bt.stress['1.5x']&&bt.stress['2x']);
 assert.equal(bt.executionPolicy,'NEXT_ELIGIBLE_BAR');
 assert.equal(bt.lookaheadSafe,true);

 const wf=B.walkForward({rows:rs,presetId:'256',paramGrid:{emaDistanceAtrMax:[1.5,2.5]},trainBars:300,validationBars:120,stepBars:120});
 assert(wf.summary.foldCount>=1);
 assert.equal(wf.summary.lookaheadSafe,true);

 const store=createMemoryResearchStore(),paper=createPaperTradingService({store,now:()=>999999});
 const opened=await paper.open({symbol:'BTCUSDT',presetId:'256',ruleVersion:'DANTE_256_PROXY_v1',signalTime:1000,entryTime:2000,entryPrice:100,notional:1000,featureSnapshot:{a:1}});
 assert.equal(opened.state,'OPEN');
 const marked=await paper.mark({id:opened.id,price:105,time:3000});assert(marked.unrealizedReturnPct>0);
 const closed=await paper.close({id:opened.id,price:110,time:4000,reason:'test'});assert.equal(closed.state,'CLOSED');assert(closed.realizedReturnPct>0);
 const stats=await paper.stats();assert.equal(stats.closed,1);assert.equal(stats.winRate,1);
 console.log('Dante crypto research suite PASS');
})().catch(e=>{console.error(e);process.exit(1)});

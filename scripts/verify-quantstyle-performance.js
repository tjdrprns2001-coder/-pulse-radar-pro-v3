'use strict';
const assert=require('node:assert/strict');
const {simulateSignalCloseToNextOpen,riskFromDailyEquity,buildHypotheticalPortfolio}=require('../lib/research-backtest-v2/quantstyle-performance.js');
const DAY=86400000,STEP=4*3600000,t0=1700000000000,rows=[];
for(let i=0;i<600;i++){
 const t=t0+i*STEP,price=100+i*.025;
 rows.push([t,price,price+1,price-1,price+.1,100,t+STEP-1]);
}
const asOf=rows.at(-1)[6];
const events=[200,201,310,410].map(i=>({at:rows[i][6],price:rows[i][4]}));
const x=simulateSignalCloseToNextOpen({symbol:'BTCUSDT',rows,events,asOf,timeframe:'4h'});
assert.equal(x.status,'READY');
assert.equal(x.trades.length,4);
assert.equal(x.rejected.length,0);
assert.equal(x.funding,'UNAVAILABLE');
assert.equal(x.trades[0].entryTime,rows[201][0],'fill starts after signal close');
assert.equal(x.trades[0].exitTime,rows[242][6],'7-day close exit');
assert.equal(x.trades[0].fundingCostPct,null);
assert.equal(x.trades[0].realTrade,false);
assert(x.trades[0].estimatedAfterCostsExFundingPct<x.trades[0].grossReturnPct);
const zero=simulateSignalCloseToNextOpen({symbol:'BTCUSDT',rows,events:[events[0]],asOf,timeframe:'4h',
 costs:{feeBps:0,slippageBps:0,spreadBps:0}});
assert(Math.abs(zero.trades[0].grossReturnPct-zero.trades[0].estimatedAfterCostsExFundingPct)<1e-8);
const pos=buildHypotheticalPortfolio({
 datasets:[{symbol:'BTCUSDT',rows,source:'BINANCE_FUTURES',asOf}],
 audits:[x],minDays:30,initialEquity:10000
});
assert.equal(pos.status,'READY');
assert.equal(pos.acceptedCount,3);
assert.equal(pos.rejectedCount,1,'overlapping trade must not be counted twice');
assert.equal(pos.rejected[0].reason,'SINGLE_POSITION_CONFLICT');
assert.equal(pos.kind,'HYPOTHETICAL_SINGLE_POSITION');
assert.equal(pos.funding,'NOT_INCLUDED');
assert.equal(pos.dailyRisk.status,'READY');
assert(pos.dailyRisk.observationDays>=30);
assert(pos.dailyRisk.sharpe!==null,'daily mark to market must compute a valid Sharpe where variance exists');
assert(pos.tradeStats.returnPct<pos.accepted.reduce((s,t)=>s+t.grossReturnPct,0),'fees should reduce capital gains');
assert.equal(pos.dailyEquity[0].time,Math.floor(pos.accepted[0].entryTime/DAY)*DAY-1);
const short=riskFromDailyEquity([100,110,90,115].map((equity,i)=>({time:i*DAY,equity})));
assert.equal(short.status,'INSUFFICIENT_DAILY_MARKS');
assert.equal(short.sharpe,null);
assert(Math.abs(short.maxDrawdownPct-(-18.18181818))<1e-6);
assert.equal(short.recoveryDays,1);
const flat=riskFromDailyEquity(Array.from({length:45},(_,i)=>({time:i*DAY,equity:100})));
assert.equal(flat.status,'READY');
assert.equal(flat.sharpe,null,'zero variance Sharpe is undefined');
const gap=riskFromDailyEquity([{time:0,equity:100},{time:2*DAY,equity:101}]);
assert.equal(gap.status,'UNAVAILABLE','missing daily marks must prevent Sharpe');
const truncated=rows.slice(0,216),partial=simulateSignalCloseToNextOpen({
 symbol:'BTCUSDT',rows:truncated,events:[events[0]],asOf:truncated.at(-1)[6]});
assert.equal(partial.trades.length,0);
assert.equal(partial.rejected[0].reason,'NO_COMPLETE_FUTURE_7D');
const gapped=rows.map(x=>x.slice());
gapped[222][0]+=1234;
const bad=simulateSignalCloseToNextOpen({symbol:'BTCUSDT',rows:gapped,events:[events[0]],asOf,timeframe:'4h'});
assert.equal(bad.trades.length,0);
assert.equal(bad.rejected[0].reason,'MISSING_CANDLE_IN_HOLD');
const future=rows.concat([[asOf+1,999,1000,998,999,1000,asOf+STEP]]);
const strict=simulateSignalCloseToNextOpen({symbol:'BTCUSDT',rows:future,events,asOf,timeframe:'4h'});
assert.deepEqual(strict.trades,x.trades,'future candle must not change historical replay');
assert.equal(buildHypotheticalPortfolio({
 datasets:[{symbol:'BTCUSDT',rows,source:'BYBIT_LINEAR',asOf}],audits:[x]
}).status,'INVALID_INPUT');
assert.equal(simulateSignalCloseToNextOpen({
 symbol:'BTCUSDT',rows,events,asOf,timeframe:'4h',costs:{feeBps:-1}
}).status,'INVALID_INPUT');
console.log('quantstyle cost/funding/censored/overlap/daily-risk research PASS');

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = '../lib/coin-scan/trader-engine.js';
assert(fs.existsSync(require('node:path').join(__dirname, path)), 'trader scanner engine must exist');
const E = require(path);
const NOW = 1800000000000;
const durations = {'1w':604800000,'1d':86400000,'4h':14400000,'1h':3600000,'15m':900000,'5m':300000};
function bars(tf, n=150) {
  const dt=durations[tf];
  return Array.from({length:n},(_,i)=>{const c=85+i*.1;const end=NOW-(n-1-i)*dt-1000;return [end-dt+1,c-.05,c+.6,c-.6,c,1000,end,100000,100,600,60000,0]});
}
function fixture() {
  const frames=Object.fromEntries(Object.keys(durations).map(tf=>[tf,bars(tf)]));
  // Old confirmed resistance provides real headroom; last 1H bar retests EMA20.
  frames['4h'][120][2]=110;
  const h=frames['1h']; h.at(-1)[3]=98.9; h.at(-1)[4]=99.9;
  const m=frames['15m']; m.at(-1)[2]=100.8; m.at(-1)[4]=100.6; m.at(-1)[5]=2400;
  return {symbol:'TESTUSDT',frames,ticker:{lastPrice:100.6,priceChangePercent:2,quoteVolume:40000000,closeTime:NOW},
    regime:{state:'SUPPORTIVE',observedAt:NOW},now:NOW,
    derivatives:{rows:Array.from({length:9},(_,i)=>({timestamp:NOW-(8-i)*3600000,sumOpenInterest:1000+i*10})),
      taker15m:[3,2,1].map(i=>({timestamp:NOW-i*900000,ratio:1.4})),fundingRate:.01},fundingIntervalHours:8,
    execution:{available:true,observedAt:NOW,ask:100.6,bid:100.58,spreadBps:2,depthUsd:{bid10bps:50000,ask10bps:50000}}};
}
let f=fixture(), r=E.evaluate(f);
assert.equal(r.state,'CONFIRMED','aligned pullback with closed trigger, flow and resistance headroom qualifies');
assert(r.plan.netRR>=2 && r.plan.stop<r.plan.entry && r.plan.target>r.plan.entry);
assert.equal(r.plan.targetSource,'4h-confirmed-pivot');
const future=[NOW,1,10000,.01,9999,999999,NOW+900000,1,1,1,1,0];
f=fixture();f.frames['15m'].push(future);
assert.deepEqual(E.evaluate(f),r,'an unfinished candle must not alter decisions');
for(const [name,mutate] of [
  ['missing OI',f=>{f.derivatives.rows=[]}],
  ['missing taker',f=>{f.derivatives.taker15m=[]}],
  ['missing funding',f=>{f.derivatives.fundingRate=null}],
  ['unknown regime',f=>{f.regime.state='UNKNOWN'}],
  ['stale book',f=>{f.execution.observedAt=NOW-300000}],
  ['missing weekly',f=>{f.frames['1w']=[]}],
  ['neutral taker',f=>{f.derivatives.taker15m.forEach(x=>x.ratio=1)}],
]){f=fixture();mutate(f);const out=E.evaluate(f);assert.notEqual(out.state,'CONFIRMED',name+' cannot qualify');assert(out.missing.length||out.waiting.length||out.blockers.length,name+' must be explained')}
for(const [name,mutate] of [
  ['extended price',f=>{f.ticker.priceChangePercent=15}],
  ['risk-off market',f=>{f.regime.state='RISK_OFF'}],
  ['wide spread',f=>{f.execution.spreadBps=30}],
  ['crowded funding',f=>{f.derivatives.fundingRate=.08}],
  ['near resistance',f=>{f.frames['4h'][120][2]=101}],
]){f=fixture();mutate(f);assert.equal(E.evaluate(f).state,'EXCLUDED',name)}
f=fixture();f.frames['5m'].forEach(x=>{x[0]-=1800000;x[6]-=1800000});
assert.equal(E.evaluate(f).state,'DATA_GAP','stale candles cannot qualify');
f=fixture();f.derivatives.rows[4].sumOpenInterest=null;
assert.notEqual(E.evaluate(f).state,'CONFIRMED','null OI must not become zero');
assert.equal(E.frameStats(bars('1h').map(x=>[x[0],99.9,100.2,99.8,100,...x.slice(5)]),'1h',NOW).rsi,50,'flat RSI must be neutral');
assert.equal(E.regimeFromFrames({BTCUSDT:[],ETHUSDT:[]},NOW).state,'UNKNOWN');
f=fixture();f.frames['1h'].at(-1)[3]=96;f.frames['1h'].at(-1)[4]=100;f.frames['1h'].at(-1)[2]=100.5;
assert.equal(E.evaluate(f).setup.type,'SWEEP_RECLAIM','a sweep must pierce and reclaim a prior low');
f=fixture();const breakout=f.frames['1h'].at(-2);breakout[2]=101;breakout[4]=100.8;
Object.assign(f.frames['1h'].at(-1),{1:100.2,2:100.9,3:100.1,4:100.5});
assert.equal(E.evaluate(f).setup.type,'BREAKOUT_RETEST','retest level must be established before breakout');
f=fixture();f.derivatives.taker15m.push({timestamp:NOW,ratio:99});
assert(Math.abs(E.evaluate(f).flow.takerRatio-1.4)<1e-10,'unfinished taker interval cannot drive a signal');
f=fixture();f.fundingIntervalHours=1;
assert.equal(E.evaluate(f).state,'EXCLUDED','short funding intervals must normalize to 8h');
f=fixture();f.frames['4h'][120][2]=f.frames['4h'][120][4]+.6;
assert.notEqual(E.evaluate(f).state,'CONFIRMED','no resistance means no invented 2R target');
f=fixture();f.frames['1w']=f.frames['1w'].slice(-30);
assert.equal(E.evaluate(f).state,'CONFIRMED','weekly context must not require 2.4 years of listing history');
console.log('trader engine: closed-bar signals, risk vetoes and missing-data cases PASS');
module.exports={fixture,bars,NOW};

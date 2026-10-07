'use strict';
const assert=require('assert');
const BT=require('../lib/chart-v1/backtest.js');

const TF=4*60*60*1000,start=1700000000000,rows=[];
for(let i=0;i<700;i++){
  const t=start+i*TF,base=100+i*.015,wave=Math.sin(i/6)*2.5+Math.sin(i/19)*1.1,close=base+wave,open=base+Math.sin((i-1)/6)*2.5,high=Math.max(open,close)+.7,low=Math.min(open,close)-.7,vol=1000+(i%31)*25;
  rows.push([t,open,high,low,close,vol,t+TF-1,vol*close,100,0,vol*close*.55]);
}
const cutoff=rows[449][6];
const full=BT.replaySnapshot(rows,{tf:'4h',asOf:cutoff,bins:80}),prefix=BT.replaySnapshot(rows.slice(0,450),{tf:'4h',asOf:cutoff,bins:80});
assert.equal(full.available,true);assert.equal(full.last_closed_candle,cutoff);assert.equal(full.bar_count,450);
assert.deepStrictEqual(full.market_structure,prefix.market_structure,'future rows must not alter replay market structure');
assert.deepStrictEqual(full.volume_profile,prefix.volume_profile,'future rows must not alter replay volume profile');
assert.equal(full.causal_policy.includes('close_time <= as_of'),true);
const test=BT.backtestStructure(rows,{tf:'4h',asOf:rows.at(-1)[6],horizonBars:10,feeBps:4,slippageBps:2,minWarmup:100});
assert.equal(test.assumptions.no_future_data,true);assert.equal(test.assumptions.entry,'next confirmed candle open');assert(Math.abs(test.assumptions.round_trip_friction_pct-.12)<1e-9);assert(test.sample_size>0,'synthetic series should create confirmed structure events');
for(const e of test.events){assert(e.entry_time>e.event_time);assert(e.exit_time>=e.entry_time);assert(Math.abs((e.gross_return_pct-e.net_return_pct)-.12)<1e-8)}
console.log('chart v1 causal replay/backtest PASS');

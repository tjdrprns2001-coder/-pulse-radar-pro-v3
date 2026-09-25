'use strict';
const assert=require('assert');
const Pit=require('../lib/research-backtest-v2/setup-point-in-time-replay.js');

const TFMS={ '5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000,'1w':604800000 };
function bars(tf,count,start=0){
  const ms=TFMS[tf],out=[];
  for(let i=0;i<count;i++){
    const ot=start+i*ms,base=100+Math.sin(i/5)*2+i*.01,ct=ot+ms-1;
    out.push([ot,String(base),String(base+1),String(base-1),String(base+.2),String(1000+i),ct,String((1000+i)*(base+.2))]);
  }
  return out;
}
const frames={
  '1w':bars('1w',20),'1d':bars('1d',100),'4h':bars('4h',130),'1h':bars('1h',160),'15m':bars('15m',180),'5m':bars('5m',240)
};
const grid=Pit.decisionGrid(frames,'15m',{startTs:frames['15m'][120][6],endTs:frames['15m'][150][6]});
assert(grid.length>5);

const ctx=grid.map(t=>({
  availableAt:t,
  execution:{
    updatedAt:t,
    spot:{available:true,observedAt:t,spreadBps:3,depthUsd:{bid10bps:50000,ask10bps:50000},slippage:{buy:[{notional:10000,slippageBps:5}],sell:[{notional:10000,slippageBps:5}]}},
    futures:{available:true,observedAt:t,spreadBps:4,depthUsd:{bid10bps:50000,ask10bps:50000},slippage:{buy:[{notional:10000,slippageBps:5}],sell:[{notional:10000,slippageBps:5}]}}
  },
  spot15m:frames['15m'].filter(r=>r[6]<=t),
  intelligence:{updatedAt:t},
  eventRisk:{hard:false,level:'LOW'},
  derivativesProfile:{oi4hPct:0,oi8hPct:0,fundingRate:0,taker1h:[],taker15m:[]},
  data:{stale:false}
}));

const out=Pit.replayPointInTime({
  symbol:'TESTUSDT',frames,signalTimeframe:'15m',startTs:grid[0],endTs:grid.at(-1),contextTimeline:ctx,includeSnapshots:true
});
assert.equal(out.decisionCount,grid.length);
assert.equal(out.snapshots.length,grid.length);
for(const s of out.snapshots){
  for(const [tf,count] of Object.entries(s.frameCounts))assert(count>=0,tf);
  assert(s.contextAvailableAt<=s.cutoff);
}
assert(Pit.assertCausalFrames(require('../lib/research-backtest-v2/features.js').trimClosedFrames(frames,grid[3]),grid[3]));

// Future context must never leak backward.
const tl=Pit.normalizeTimeline([{availableAt:100,value:'past'},{availableAt:300,value:'future'}]);
assert.equal(Pit.timelineAt(tl,200).value,'past');

// Prefix invariance: appending future bars/context cannot rewrite earlier state/features.
const pref=Pit.prefixInvariant({
  symbol:'TESTUSDT',frames,signalTimeframe:'15m',startTs:grid[0],endTs:grid[8],contextTimeline:ctx
});
assert.equal(pref.pass,true);
assert(pref.checks.length>0);

// Explicit future bar in a supposedly closed frame must be rejected.
const bad={'15m':frames['15m'].slice(0,3)};
assert.throws(()=>Pit.assertCausalFrames(bad,frames['15m'][1][6]),/future closed bar leaked/);

console.log('setup point-in-time replay verification passed');

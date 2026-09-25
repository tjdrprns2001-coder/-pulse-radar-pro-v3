'use strict';
const assert=require('assert');
const Gate=require('../lib/coin-scan/setup-execution-gate.js');

function kline(i,{o=100,h=101,l=99,c=100,v=100,q=10000,closeTime=null}={}){
  const ct=closeTime??(i+1)*60000;
  return[i*60000,String(o),String(h),String(l),String(c),String(v),ct,String(q)];
}

const execGood={
  spot:{available:true,spreadBps:4,depthUsd:{bid10bps:50000,ask10bps:60000},slippage:{buy:[{notional:10000,slippageBps:8}],sell:[{notional:10000,slippageBps:7}]}},
  futures:{available:true,spreadBps:5,depthUsd:{bid10bps:40000,ask10bps:45000},slippage:{buy:[{notional:10000,slippageBps:9}],sell:[{notional:10000,slippageBps:9}]}}
};
let ex=Gate.executionMetrics(execGood);
assert.equal(ex.hardReject,false);
assert.equal(ex.spreadBps,5);
assert.equal(ex.depth10Usd,40000);
assert.equal(ex.maxSlippageBps,9);

ex=Gate.executionMetrics({spot:{available:true,spreadBps:30,depthUsd:{bid10bps:50000,ask10bps:50000},slippage:{buy:[],sell:[]}}});
assert.equal(ex.hardReject,true);
assert(ex.reasons.includes('spread_limit'));

const spot=[];
for(let i=0;i<21;i++)spot.push(kline(i,{q:10000+(i%3)*100}));
spot.push(kline(21,{q:50000}));
spot.push(kline(22,{q:100000,closeTime:9999999999999})); // incomplete/future candle: must be ignored
const sig=Gate.spotVolumeSignal(spot,22*60000);
assert.equal(sig.confirmed,true);
assert(sig.z>=1);

const r=Gate.costAdjustedR({entry:100,stop:95,target:110,feeBps:4,slippageBps:6,fundingBps:1});
assert.equal(r.available,true);
assert(r.netR>1.5&&r.netR<2);

const frames={'5m':[],'15m':[],'1h':[]};
for(let i=0;i<30;i++){
  const c=95+i*0.2;
  frames['5m'].push(kline(i,{o:c-.1,h:c+.5,l:c-.5,c,q:12000,closeTime:(i+1)*300000}));
  frames['15m'].push(kline(i,{o:c-.2,h:c+.8,l:c-.8,c,q:18000,closeTime:(i+1)*900000}));
  frames['1h'].push(kline(i,{o:c-.3,h:c+3,l:c-1,c,q:30000,closeTime:(i+1)*3600000}));
}
const now=30*3600000;
const item={
  symbol:'TESTUSDT',updatedAt:now,fundingRate:.01,oi4hChangePct:1,priceChange1h:1,
  setupFeatures:{
    bottom:{evidence:{bottomStruct:{sweepLow:98}},sweepLowCloseBreak:false,zoneCloseBreak:false,mssConfirmed:true},
    breakout:{futuresVolumeConfirmed:true,closeAboveResistance:true,breakoutBodyConfirmed:true,closeBackBelowResistance:false,evidence:{breakout:{retestLow:99}}}
  }
};
Gate.apply({item,frames,execution:execGood,spot15m:spot,eventRisk:null,sequenceGap:false,feeBps:4});
assert.equal(item.setupExecution.execution.hardReject,false);
assert.equal(item.setupFeatures.bottom.executionPass,true);
assert.equal(item.setupFeatures.breakout.spotVolumeConfirmed,true);

const fake={...item,setupFeatures:{bottom:{...item.setupFeatures.bottom},breakout:{...item.setupFeatures.breakout,closeAboveResistance:true,breakoutBodyConfirmed:false}}};
Gate.apply({item:fake,frames,execution:execGood,spot15m:spot,eventRisk:null,sequenceGap:false,feeBps:4});
assert.equal(fake.setupExecution.fakeBreakout,true);
assert.equal(fake.setupFeatures.breakout.hardReject,true);

const knife={...item,priceChange1h:-2,oi4hChangePct:3,setupFeatures:{bottom:{evidence:{bottomStruct:{sweepLow:98}},sweepLowCloseBreak:false,zoneCloseBreak:false,mssConfirmed:false},breakout:{...item.setupFeatures.breakout}}};
Gate.apply({item:knife,frames,execution:execGood,spot15m:spot,eventRisk:null,sequenceGap:false,feeBps:4});
assert.equal(knife.setupExecution.fallingKnife,true);
assert.equal(knife.setupFeatures.bottom.hardReject,true);

console.log('setup execution gate verification passed');

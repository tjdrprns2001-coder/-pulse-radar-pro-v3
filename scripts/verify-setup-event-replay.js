'use strict';
const assert=require('assert');
const Replay=require('../lib/research-backtest-v2/setup-event-replay.js');

function bar(i,{o=100,h=101,l=99,c=100,v=100}={}){
  const ot=Date.UTC(2026,0,1+i),ct=ot+86400000-1;
  return[ot,String(o),String(h),String(l),String(c),String(v),ct,String(v*c)];
}

// 1) Confirmed close signal must fill at next bar open, never same close.
const rows=[
  bar(0,{o:100,h:101,l:99,c:100}),
  bar(1,{o:101,h:103,l:100,c:102}),
  bar(2,{o:103,h:111,l:102,c:109})
];
let r=Replay.runEventReplay({
  rows,
  signals:[{id:'S1',symbol:'DEMO',setupType:'BOTTOM_REVERSAL',state:'BOTTOM_CONFIRMED',signalIndex:0,stopPrice:95,targetPrice:110}],
  config:{initialCash:100000,commissionRate:.0005,slippageRate:.0005,riskPerTradeFraction:.01,maxPositionValueFraction:.25,stopTargetPriority:'stop_first'}
});
const buy=r.events.find(x=>x.eventType==='FillEvent'&&x.side==='BUY');
assert(buy,'entry fill required');
assert.equal(buy.barIndex,1,'entry must occur at next bar');
assert(buy.fillPrice>101,'buy slippage must worsen next-open price');

// 2) Same-bar stop/target ambiguity defaults to conservative stop_first.
r=Replay.runEventReplay({
  rows:[
    bar(0,{o:100,h:101,l:99,c:100}),
    bar(1,{o:100,h:106,l:94,c:101}),
    bar(2,{o:101,h:102,l:100,c:101})
  ],
  signals:[{id:'S2',symbol:'DEMO',setupType:'PREBREAKOUT',state:'BREAKOUT_CONFIRMED',signalIndex:0,stopPrice:95,targetPrice:105}],
  config:{initialCash:100000,commissionRate:0,slippageRate:0,stopTargetPriority:'stop_first'}
});
const sell2=r.events.find(x=>x.eventType==='FillEvent'&&x.side==='SELL');
assert.equal(sell2.reason,'STOP_LOSS');
assert.equal(sell2.dualHit,true);

// 3) Gap through stop exits at actual open, not theoretical stop.
r=Replay.runEventReplay({
  rows:[
    bar(0,{o:100,h:101,l:99,c:100}),
    bar(1,{o:100,h:102,l:99,c:101}),
    bar(2,{o:90,h:93,l:88,c:91})
  ],
  signals:[{id:'S3',symbol:'DEMO',setupType:'BOTTOM_REVERSAL',state:'BOTTOM_CONFIRMED',signalIndex:0,stopPrice:95,targetPrice:110}],
  config:{initialCash:100000,commissionRate:0,slippageRate:0}
});
const sell3=r.events.find(x=>x.eventType==='FillEvent'&&x.side==='SELL');
assert.equal(sell3.reason,'STOP_GAP');
assert.equal(sell3.basePrice,90);

// 4) Event ordering: Signal/Order on close precede next bar Buy Fill.
const signalSeq=r.events.find(x=>x.eventType==='SignalEvent').sequence;
const orderSeq=r.events.find(x=>x.eventType==='OrderEvent').sequence;
const fillSeq=r.events.find(x=>x.eventType==='FillEvent'&&x.side==='BUY').sequence;
assert(signalSeq<orderSeq&&orderSeq<fillSeq);

// 5) Invalid OHLC must fail fast.
assert.throws(()=>Replay.runEventReplay({
  rows:[bar(0),bar(1,{o:100,h:99,l:98,c:101})],
  signals:[]
}),/invalid OHLC/);

// 6) Transition adapter accepts only confirmed states.
const sigs=Replay.signalsFromSetupTransitions([
  {eventId:'E0',symbol:'X',setupType:'BOTTOM_REVERSAL',toState:'WATCH_BOTTOM',candleCloseTime:1},
  {eventId:'E1',symbol:'X',setupType:'BOTTOM_REVERSAL',toState:'BOTTOM_CONFIRMED',candleCloseTime:2,features:{evidence:{risk:{stop:90,target:120}}}}
]);
assert.equal(sigs.length,1);
assert.equal(sigs[0].id,'E1');
assert.equal(sigs[0].stopPrice,90);
assert.equal(sigs[0].targetPrice,120);

console.log('setup event replay kernel verification passed');

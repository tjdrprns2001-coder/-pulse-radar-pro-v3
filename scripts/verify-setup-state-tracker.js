'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createSetupStateTracker}=require('../lib/coin-scan/setup-state-tracker.js');

(async()=>{
  const store=createMemoryStore(),tracker=createSetupStateTracker({store,now:()=>1000});
  const item={
    symbol:'TESTUSDT',
    setupFeatures:{
      candleCloseTime:300000,observedAt:300100,availableAt:300200,decisionTime:300300,
      bottom:{setupType:'BOTTOM_REVERSAL',shockScore:60},
      breakout:{setupType:'PREBREAKOUT',resistanceDefined:true,compressionScore:65}
    }
  };
  const r1=await tracker.observe([item]);
  assert.equal(r1.transitions,2);
  assert.equal(item.bottomSetupState,'WATCH_BOTTOM');
  assert.equal(item.breakoutSetupState,'WATCH_BREAKOUT');

  const item2={
    symbol:'TESTUSDT',
    setupFeatures:{
      candleCloseTime:600000,observedAt:600100,availableAt:600200,decisionTime:600300,
      bottom:{setupType:'BOTTOM_REVERSAL',shockScore:70,sweepReclaimed:true,mssConfirmed:true,zoneCreated:true},
      breakout:{setupType:'PREBREAKOUT',resistanceDefined:true,compressionScore:80,closeAboveResistance:true,volumeConfirmed:true,breakoutBodyConfirmed:true}
    }
  };
  const r2=await tracker.observe([item2]);
  assert.equal(r2.transitions,2);
  assert.equal(item2.bottomSetupState,'BOTTOM_TRIGGER');
  assert.equal(item2.breakoutSetupState,'PREBREAKOUT_TRIGGER');

  const states=await tracker.getStates('TESTUSDT');
  assert.equal(states.bottom.state,'BOTTOM_TRIGGER');
  assert.equal(states.breakout.state,'PREBREAKOUT_TRIGGER');

  const evidence=await tracker.listEvidence({symbol:'TESTUSDT',limit:10});
  assert.equal(evidence.length,4);
  assert.ok(evidence.every(x=>x.kind==='setup-transition'));
  assert.ok(evidence.every(x=>Number(x.decisionTime)>0));

  console.log('setup-state-tracker verification passed');
})().catch(e=>{console.error(e);process.exit(1)});

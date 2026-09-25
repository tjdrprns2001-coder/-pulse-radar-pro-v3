'use strict';
const assert=require('assert');
const M=require('../lib/coin-scan/setup-state-machine.js');

function ctx(n){return{candleCloseTime:n*300000,observedAt:n*300000+100,availableAt:n*300000+200,decisionTime:n*300000+300}}

let b=M.initial(M.SETUP_TYPE.BOTTOM);
b=M.updateBottom(b,{shockScore:55},ctx(1));
assert.equal(b.state,M.STATE.WATCH_BOTTOM,'shock opens WATCH_BOTTOM');

// Regression: trigger must win over WATCH persistence even when shock remains >=50.
b=M.updateBottom(b,{shockScore:70,sweepReclaimed:true,mssConfirmed:true,zoneCreated:true},ctx(2));
assert.equal(b.state,M.STATE.BOTTOM_TRIGGER,'WATCH_BOTTOM must advance to BOTTOM_TRIGGER');

const same=M.updateBottom(b,{zoneRetestValid:true,higherLowConfirmed:true,executionPass:true,netRPass:true},ctx(2));
assert.equal(same.state,M.STATE.BOTTOM_TRIGGER,'same candle cannot advance twice');

b=M.updateBottom(b,{zoneRetestValid:true,higherLowConfirmed:true,executionPass:true,netRPass:true},ctx(3));
assert.equal(b.state,M.STATE.BOTTOM_CONFIRMED,'valid retest advances to confirmed');

b=M.updateBottom(b,{sweepLowCloseBreak:true},ctx(4));
assert.equal(b.state,M.STATE.FAILED_SETUP,'invalidation overrides confirmed state');

let p=M.initial(M.SETUP_TYPE.BREAKOUT);
p=M.updateBreakout(p,{resistanceDefined:true,compressionScore:60},ctx(1));
assert.equal(p.state,M.STATE.WATCH_BREAKOUT);
p=M.updateBreakout(p,{resistanceDefined:true,compressionScore:80,closeAboveResistance:true,volumeConfirmed:true,breakoutBodyConfirmed:true},ctx(2));
assert.equal(p.state,M.STATE.PREBREAKOUT_TRIGGER);
p=M.updateBreakout(p,{retestHolds:true,executionPass:true,netRPass:true},ctx(3));
assert.equal(p.state,M.STATE.BREAKOUT_CONFIRMED);
p=M.updateBreakout(p,{closeBackBelowResistance:true},ctx(4));
assert.equal(p.state,M.STATE.FAILED_SETUP);

let f=M.initial(M.SETUP_TYPE.BREAKOUT);
f=M.updateBreakout(f,{dataStale:true,resistanceDefined:true,compressionScore:100},ctx(1));
assert.equal(f.state,M.STATE.FAILED_SETUP,'hard filter overrides score');

console.log('setup-state-machine verification passed');

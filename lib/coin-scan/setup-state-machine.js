'use strict';

const SETUP_TYPE=Object.freeze({BOTTOM:'BOTTOM_REVERSAL',BREAKOUT:'PREBREAKOUT'});
const STATE=Object.freeze({
  NO_SETUP:'NO_SETUP',
  WATCH_BOTTOM:'WATCH_BOTTOM',
  BOTTOM_TRIGGER:'BOTTOM_TRIGGER',
  BOTTOM_CONFIRMED:'BOTTOM_CONFIRMED',
  WATCH_BREAKOUT:'WATCH_BREAKOUT',
  PREBREAKOUT_TRIGGER:'PREBREAKOUT_TRIGGER',
  BREAKOUT_CONFIRMED:'BREAKOUT_CONFIRMED',
  FAILED_SETUP:'FAILED_SETUP',
  EXPIRED:'EXPIRED'
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function bool(v){return v===true}
function initial(setupType){
  return{
    setupType,
    state:STATE.NO_SETUP,
    enteredAt:null,
    lastTransitionAt:null,
    lastProcessedCloseTime:null,
    transitionCount:0,
    failureReason:null,
    expiryReason:null
  };
}
function stamp(prev,next,ctx,reason=null){
  if(next===prev.state)return{...prev,lastProcessedCloseTime:ctx.candleCloseTime??prev.lastProcessedCloseTime};
  const ts=finite(ctx.decisionTime)??finite(ctx.availableAt)??finite(ctx.observedAt)??Date.now();
  return{
    ...prev,
    state:next,
    enteredAt:ts,
    lastTransitionAt:ts,
    lastProcessedCloseTime:ctx.candleCloseTime??prev.lastProcessedCloseTime,
    transitionCount:(Number(prev.transitionCount)||0)+1,
    failureReason:next===STATE.FAILED_SETUP?String(reason||'invalidated'):null,
    expiryReason:next===STATE.EXPIRED?String(reason||'expired'):null
  };
}
function sameClosedCandle(prev,ctx){
  const c=finite(ctx?.candleCloseTime),p=finite(prev?.lastProcessedCloseTime);
  return c!=null&&p!=null&&c<=p;
}
function hardFailure(f={}){
  if(bool(f.dataStale))return'data_stale';
  if(bool(f.hardReject))return'hard_reject';
  if(bool(f.sequenceGap))return'sequence_gap';
  if(bool(f.eventRiskHard))return'event_risk_hard';
  return null;
}
function updateBottom(prevInput,features={},ctx={}){
  const prev=prevInput||initial(SETUP_TYPE.BOTTOM);
  if(sameClosedCandle(prev,ctx))return prev;
  const hard=hardFailure(features);
  if(hard)return stamp(prev,STATE.FAILED_SETUP,ctx,hard);
  if(bool(features.expired))return stamp(prev,STATE.EXPIRED,ctx,'retest_window_expired');
  if(bool(features.sweepLowCloseBreak))return stamp(prev,STATE.FAILED_SETUP,ctx,'sweep_low_close_break');
  if(bool(features.zoneCloseBreak))return stamp(prev,STATE.FAILED_SETUP,ctx,'zone_close_break');
  if(bool(features.mssOriginFailure))return stamp(prev,STATE.FAILED_SETUP,ctx,'mss_origin_failure');

  // Advanced-state transitions are intentionally checked before watch-state persistence.
  if(prev.state===STATE.BOTTOM_CONFIRMED)return stamp(prev,STATE.BOTTOM_CONFIRMED,ctx);
  if(prev.state===STATE.BOTTOM_TRIGGER){
    if(bool(features.zoneRetestValid)&&bool(features.higherLowConfirmed)&&bool(features.executionPass)&&bool(features.netRPass))
      return stamp(prev,STATE.BOTTOM_CONFIRMED,ctx);
    return stamp(prev,STATE.BOTTOM_TRIGGER,ctx);
  }
  if(prev.state===STATE.WATCH_BOTTOM){
    if(bool(features.sweepReclaimed)&&bool(features.mssConfirmed)&&bool(features.zoneCreated))
      return stamp(prev,STATE.BOTTOM_TRIGGER,ctx);
    return stamp(prev,STATE.WATCH_BOTTOM,ctx);
  }
  if(prev.state===STATE.NO_SETUP){
    if((finite(features.shockScore)??0)>=50||bool(features.htfDiscountLiquidationCluster))
      return stamp(prev,STATE.WATCH_BOTTOM,ctx);
    return stamp(prev,STATE.NO_SETUP,ctx);
  }
  if(prev.state===STATE.FAILED_SETUP||prev.state===STATE.EXPIRED){
    if(bool(features.resetEligible)&&((finite(features.shockScore)??0)>=50||bool(features.htfDiscountLiquidationCluster)))
      return stamp({...initial(SETUP_TYPE.BOTTOM),transitionCount:prev.transitionCount},STATE.WATCH_BOTTOM,ctx,'reset');
    return stamp(prev,prev.state,ctx);
  }
  return stamp(prev,STATE.NO_SETUP,ctx);
}
function updateBreakout(prevInput,features={},ctx={}){
  const prev=prevInput||initial(SETUP_TYPE.BREAKOUT);
  if(sameClosedCandle(prev,ctx))return prev;
  const hard=hardFailure(features);
  if(hard)return stamp(prev,STATE.FAILED_SETUP,ctx,hard);
  if(bool(features.expired))return stamp(prev,STATE.EXPIRED,ctx,'retest_window_expired');
  if(bool(features.closeBackBelowResistance))return stamp(prev,STATE.FAILED_SETUP,ctx,'close_back_below_resistance');
  if(bool(features.retestLowBreak))return stamp(prev,STATE.FAILED_SETUP,ctx,'retest_low_break');

  if(prev.state===STATE.BREAKOUT_CONFIRMED)return stamp(prev,STATE.BREAKOUT_CONFIRMED,ctx);
  if(prev.state===STATE.PREBREAKOUT_TRIGGER){
    if(bool(features.retestHolds)&&bool(features.executionPass)&&bool(features.netRPass))
      return stamp(prev,STATE.BREAKOUT_CONFIRMED,ctx);
    return stamp(prev,STATE.PREBREAKOUT_TRIGGER,ctx);
  }
  if(prev.state===STATE.WATCH_BREAKOUT){
    if(bool(features.closeAboveResistance)&&bool(features.volumeConfirmed)&&bool(features.breakoutBodyConfirmed))
      return stamp(prev,STATE.PREBREAKOUT_TRIGGER,ctx);
    return stamp(prev,STATE.WATCH_BREAKOUT,ctx);
  }
  if(prev.state===STATE.NO_SETUP){
    if(bool(features.resistanceDefined)&&(finite(features.compressionScore)??0)>=60&&!bool(features.crowdingReject))
      return stamp(prev,STATE.WATCH_BREAKOUT,ctx);
    return stamp(prev,STATE.NO_SETUP,ctx);
  }
  if(prev.state===STATE.FAILED_SETUP||prev.state===STATE.EXPIRED){
    if(bool(features.resetEligible)&&bool(features.resistanceDefined)&&(finite(features.compressionScore)??0)>=60)
      return stamp({...initial(SETUP_TYPE.BREAKOUT),transitionCount:prev.transitionCount},STATE.WATCH_BREAKOUT,ctx,'reset');
    return stamp(prev,prev.state,ctx);
  }
  return stamp(prev,STATE.NO_SETUP,ctx);
}
function update(prev,features={},ctx={}){
  const setupType=String(prev?.setupType||features.setupType||'');
  if(setupType===SETUP_TYPE.BOTTOM)return updateBottom(prev,features,ctx);
  if(setupType===SETUP_TYPE.BREAKOUT)return updateBreakout(prev,features,ctx);
  throw new Error('unsupported setup type');
}
function isEntryReady(state){return state===STATE.BOTTOM_CONFIRMED||state===STATE.BREAKOUT_CONFIRMED}
function isWatch(state){return state===STATE.WATCH_BOTTOM||state===STATE.BOTTOM_TRIGGER||state===STATE.WATCH_BREAKOUT||state===STATE.PREBREAKOUT_TRIGGER}

module.exports={SETUP_TYPE,STATE,initial,updateBottom,updateBreakout,update,isEntryReady,isWatch};

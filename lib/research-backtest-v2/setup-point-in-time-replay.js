'use strict';

const {trimClosedFrames}=require('./features.js');
const SetupFeatures=require('../coin-scan/setup-feature-engine.js');
const SetupExecution=require('../coin-scan/setup-execution-gate.js');
const Machine=require('../coin-scan/setup-state-machine.js');

const VERSION='SETUP_POINT_IN_TIME_REPLAY_r0.1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function closeTime(r){return finite(Array.isArray(r)?r[6]:r?.closeTime)}
function openTime(r){return finite(Array.isArray(r)?r[0]:r?.openTime??r?.time)}
function close(r){return finite(Array.isArray(r)?r[4]:r?.close)}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}

function decisionGrid(frames={},signalTimeframe='15m',{startTs=null,endTs=null}={}){
  const s=finite(startTs),e=finite(endTs),rows=Array.isArray(frames?.[signalTimeframe])?frames[signalTimeframe]:[];
  const times=[];
  for(const r of rows){
    const t=closeTime(r);
    if(t==null)continue;
    if(s!=null&&t<s)continue;
    if(e!=null&&t>e)continue;
    times.push(t);
  }
  return[...new Set(times)].sort((a,b)=>a-b);
}
function assertCausalFrames(frames={},cutoff){
  const c=finite(cutoff);if(c==null)throw new Error('cutoff required');
  for(const [tf,rows] of Object.entries(frames||{})){
    let prev=null;
    for(const r of Array.isArray(rows)?rows:[]){
      const ot=openTime(r),ct=closeTime(r);
      if(ot==null||ct==null)throw new Error('missing timestamp in '+tf);
      if(ct>c)throw new Error('future closed bar leaked into '+tf);
      if(prev!=null&&ot<=prev)throw new Error('non-increasing bars in '+tf);
      prev=ot;
    }
  }
  return true;
}
function normalizeTimeline(rows=[]){
  return(Array.isArray(rows)?rows:[]).map((x,i)=>{
    const availableAt=finite(x?.availableAt??x?.observedAt??x?.timestamp);
    if(availableAt==null)throw new Error('timeline item '+i+' missing availableAt');
    return{...clone(x),availableAt};
  }).sort((a,b)=>a.availableAt-b.availableAt);
}
function timelineAt(timeline,cutoff){
  let best=null;
  for(const x of timeline||[]){if(x.availableAt<=cutoff)best=x;else break}
  return best?clone(best):null;
}
function contextAt(timeline,cutoff){
  const x=timelineAt(timeline,cutoff)||{};
  return{
    availableAt:finite(x.availableAt),
    derivativesProfile:x.derivativesProfile||x.v2Profile||null,
    execution:x.execution||null,
    spot15m:Array.isArray(x.spot15m)?x.spot15m:[],
    intelligence:x.intelligence||null,
    eventRisk:x.eventRisk||null,
    data:x.data||null,
    sequenceGap:x.sequenceGap==null?null:Boolean(x.sequenceGap),
    feeBps:finite(x.feeBps)??4
  };
}
function transitionRow({symbol,setupType,prev,next,features,cutoff}={}){
  if(!prev||!next||prev.state===next.state)return null;
  return{
    kind:'setup-transition',
    schemaVersion:'setup-transition-r0.1',
    eventId:[cleanSymbol(symbol),setupType,prev.state,next.state,cutoff].join(':'),
    symbol:cleanSymbol(symbol),setupType,fromState:prev.state,toState:next.state,
    candleCloseTime:cutoff,observedAt:cutoff,availableAt:cutoff,decisionTime:cutoff,
    transitionCount:next.transitionCount,failureReason:next.failureReason,expiryReason:next.expiryReason,
    entryReady:Machine.isEntryReady(next.state),watch:Machine.isWatch(next.state),features:clone(features)
  };
}
function lastClosedPrice(frames={},tf='15m'){
  const rows=Array.isArray(frames?.[tf])?frames[tf]:[];
  return rows.length?close(rows.at(-1)):null;
}
function replayPointInTime({
  symbol,frames={},signalTimeframe='15m',startTs=null,endTs=null,contextTimeline=[],
  defaultDataState='live',includeSnapshots=false
}={}){
  const sym=cleanSymbol(symbol);if(!sym)throw new Error('symbol required');
  const grid=decisionGrid(frames,signalTimeframe,{startTs,endTs});if(!grid.length)throw new Error('decision grid empty');
  const timeline=normalizeTimeline(contextTimeline);
  let bottom=Machine.initial(Machine.SETUP_TYPE.BOTTOM),breakout=Machine.initial(Machine.SETUP_TYPE.BREAKOUT);
  const transitions=[],snapshots=[];
  for(const cutoff of grid){
    const closed=trimClosedFrames(frames,cutoff);assertCausalFrames(closed,cutoff);
    const ctx=contextAt(timeline,cutoff);
    const setupFeatures=SetupFeatures.build({
      frames:closed,derivativesProfile:ctx.derivativesProfile,v2Profile:ctx.derivativesProfile,
      execution:null,data:{stale:String(defaultDataState).toLowerCase()!=='live',...(ctx.data||{})},
      eventRisk:ctx.eventRisk,now:cutoff
    });
    const item={
      symbol:sym,updatedAt:cutoff,dataState:defaultDataState,
      fundingRate:finite(ctx.derivativesProfile?.fundingRate),
      oi4hChangePct:finite(ctx.derivativesProfile?.oi4hPct),
      priceChange1h:null,setupFeatures
    };
    if(ctx.execution){
      SetupExecution.apply({
        item,frames:closed,execution:ctx.execution,spot15m:ctx.spot15m,intelligence:ctx.intelligence,
        eventRisk:ctx.eventRisk,sequenceGap:ctx.sequenceGap,feeBps:ctx.feeBps
      });
    }else{
      // Research split-lane policy: missing historical execution must block CONFIRMED,
      // but it must not erase structural WATCH/TRIGGER evidence.
      for(const key of ['bottom','breakout']){
        item.setupFeatures[key]={...(item.setupFeatures[key]||{}),executionPass:false,netRPass:false,hardReject:false,
          executionCoverage:'UNAVAILABLE',
          evidence:{...(item.setupFeatures[key]?.evidence||{}),pointInTimeContextMissing:'execution',executionCoverage:'UNAVAILABLE'}};
      }
      // Split-lane research policy: missing historical execution cannot erase a structural breakout trigger.
      // Use the candle-derived volume confirmation for the structure lane; CONFIRMED remains blocked above.
      item.setupFeatures.breakout.volumeConfirmed=item.setupFeatures.breakout.futuresVolumeConfirmed===true;
    }
    // Research replay reset policy: FAILED/EXPIRED represents one failed attempt, not a permanent symbol lock.
    // Re-arm only when a fresh watch condition exists and the current feature snapshot is not still invalidated.
    if(bottom.state==='FAILED_SETUP'||bottom.state==='EXPIRED'){
      const f=item.setupFeatures.bottom||{};
      f.resetEligible=!f.dataStale&&!f.hardReject&&!f.sequenceGap&&!f.eventRiskHard&&!f.sweepLowCloseBreak&&!f.zoneCloseBreak&&!f.mssOriginFailure;
    }
    if(breakout.state==='FAILED_SETUP'||breakout.state==='EXPIRED'){
      const f=item.setupFeatures.breakout||{};
      f.resetEligible=!f.dataStale&&!f.hardReject&&!f.sequenceGap&&!f.eventRiskHard&&!f.closeBackBelowResistance&&!f.retestLowBreak&&!f.crowdingReject;
    }
    const machineCtx={candleCloseTime:cutoff,observedAt:cutoff,availableAt:cutoff,decisionTime:cutoff};
    const prevBottom=bottom,prevBreakout=breakout;
    bottom=Machine.updateBottom(bottom,item.setupFeatures.bottom,machineCtx);
    breakout=Machine.updateBreakout(breakout,item.setupFeatures.breakout,machineCtx);
    const tb=transitionRow({symbol:sym,setupType:Machine.SETUP_TYPE.BOTTOM,prev:prevBottom,next:bottom,features:item.setupFeatures.bottom,cutoff});
    const tp=transitionRow({symbol:sym,setupType:Machine.SETUP_TYPE.BREAKOUT,prev:prevBreakout,next:breakout,features:item.setupFeatures.breakout,cutoff});
    if(tb)transitions.push(tb);if(tp)transitions.push(tp);
    if(includeSnapshots)snapshots.push({
      symbol:sym,cutoff,signalTimeframe,price:lastClosedPrice(closed,signalTimeframe),
      frameCounts:Object.fromEntries(Object.entries(closed).map(([tf,rows])=>[tf,rows.length])),
      contextAvailableAt:ctx.availableAt,bottomState:bottom.state,breakoutState:breakout.state,
      setupFeatures:clone(item.setupFeatures)
    });
  }
  return{
    version:VERSION,symbol:sym,signalTimeframe,startTs:grid[0],endTs:grid.at(-1),decisionCount:grid.length,
    contextCount:timeline.length,transitions,snapshots:includeSnapshots?snapshots:undefined,
    finalStates:{bottom,breakout},
    confirmedTransitions:transitions.filter(x=>x.toState==='BOTTOM_CONFIRMED'||x.toState==='BREAKOUT_CONFIRMED'),
    causalPolicy:'for each decision close, all frames and context require availableAt/closeTime <= cutoff',
    executionResearchPolicy:'missing historical execution blocks CONFIRMED but preserves WATCH/TRIGGER structural evidence'
  };
}
function prefixInvariant(args={}){
  const full=replayPointInTime({...args,includeSnapshots:true});
  const grid=decisionGrid(args.frames,args.signalTimeframe||'15m',{startTs:args.startTs,endTs:args.endTs});
  if(grid.length<2)return{pass:true,checks:[]};
  const checks=[];
  for(let i=1;i<grid.length;i++){
    const cutoff=grid[i-1];
    const partialFrames={};
    for(const [tf,rows] of Object.entries(args.frames||{}))partialFrames[tf]=(Array.isArray(rows)?rows:[]).filter(r=>(closeTime(r)??Infinity)<=cutoff);
    const partialTimeline=(args.contextTimeline||[]).filter(x=>(finite(x?.availableAt??x?.observedAt??x?.timestamp)??Infinity)<=cutoff);
    const partial=replayPointInTime({...args,frames:partialFrames,contextTimeline:partialTimeline,endTs:cutoff,includeSnapshots:true});
    const a=full.snapshots.find(x=>x.cutoff===cutoff),b=partial.snapshots.at(-1);
    const pass=Boolean(a&&b&&a.bottomState===b.bottomState&&a.breakoutState===b.breakoutState&&JSON.stringify(a.setupFeatures)===JSON.stringify(b.setupFeatures));
    checks.push({cutoff,pass,fullBottom:a?.bottomState,partialBottom:b?.bottomState,fullBreakout:a?.breakoutState,partialBreakout:b?.breakoutState});
  }
  return{pass:checks.every(x=>x.pass),checks};
}

module.exports={VERSION,decisionGrid,assertCausalFrames,normalizeTimeline,timelineAt,contextAt,replayPointInTime,prefixInvariant};

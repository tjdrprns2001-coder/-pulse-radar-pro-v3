(function(root,factory){
 const dep=typeof module==='object'&&module.exports?{Levels:require('./levels.js'),Ranges:require('./ranges.js'),Setup:require('./setup-state.js')}:{Levels:root.PulseAutoChartLevels,Ranges:root.PulseAutoChartRanges,Setup:root.PulseAutoChartSetupState};
 const api=factory(dep);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartReplay=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(dep){'use strict';
const {Levels,Ranges,Setup}=dep;
function track({candles,swings,atrSeries,timeframe,settings={}}={}){
  if(!candles?.length)return{setup:{state:Setup.STATES.NONE,label:'관찰 조건 미충족',range:null},range:null,levels:[],history:[]};
  let lockedRange=null,currentRange=null,currentSetup=null,currentLevels=[],lastEventKey=null;
  const invalidatedIds=new Set(),history=[];
  for(let i=0;i<candles.length;i++){
    const c=candles[i],atrNow=Number(atrSeries?.[i]);
    if(!(atrNow>0))continue;
    const prefix=candles.slice(0,i+1),knownSwings=(swings||[]).filter(s=>Number(s.knownAt)<=Number(c.closeTime));
    currentLevels=Levels.build(knownSwings,{atrNow,currentPrice:c.close,timeframe,zoneAtr:settings.zoneAtr??.20,minTouches:settings.minTouches??2,maxEachSide:settings.maxEachSide??3});
    let candidate=lockedRange;
    if(!candidate){
      candidate=Ranges.detect(prefix,currentLevels,{atrNow,timeframe,minWidthAtr:settings.minWidthAtr??1.5,minInsideRatio:settings.minInsideRatio??.68,lookback:settings.rangeLookback??80,excludeTail:settings.rangeExcludeTail??2});
      if(candidate&&invalidatedIds.has(candidate.id))candidate=null;
    }
    const setup=Setup.derive(prefix,candidate,{atrNow,atrSeries:atrSeries.slice(0,i+1),breakoutAtr:settings.breakoutAtr??.10,retestAtr:settings.retestAtr??.25});
    currentSetup=setup;currentRange=setup.range||candidate||null;
    if(!lockedRange&&[Setup.STATES.BREAKOUT,Setup.STATES.RETEST,Setup.STATES.CONFIRMED].includes(setup.state))lockedRange=setup.range;
    if(lockedRange&&setup.state===Setup.STATES.INVALID){invalidatedIds.add(lockedRange.id);lockedRange=null}
    const eventKey=[setup.state,setup.changedAt,setup.range?.id||'none'].join('|');
    if(eventKey!==lastEventKey){history.push({state:setup.state,label:setup.label,changedAt:setup.changedAt,range:setup.range?{id:setup.range.id,low:setup.range.low,high:setup.range.high,frozen:!!setup.range.frozen,lockedAt:setup.range.lockedAt||null}:null,event:setup.event||null});lastEventKey=eventKey}
  }
  if(!currentSetup)currentSetup={state:Setup.STATES.NONE,label:'관찰 조건 미충족',changedAt:candles.at(-1)?.closeTime,knownAt:candles.at(-1)?.closeTime,range:null,invalidation:null};
  return{setup:currentSetup,range:currentRange,levels:currentLevels,history,invalidatedRangeIds:[...invalidatedIds]};
}
return{track};
});
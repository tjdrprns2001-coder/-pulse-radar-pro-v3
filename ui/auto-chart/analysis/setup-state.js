(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartSetupState=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const STATES=Object.freeze({NONE:'NO_SETUP',WATCH:'BOX_WATCH',BREAKOUT:'BREAKOUT_CONFIRMED',RETEST:'RETEST_IN_PROGRESS',CONFIRMED:'RETEST_CONFIRMED',INVALID:'INVALIDATED'});
function firstIndexAfter(candles,ts){for(let i=0;i<candles.length;i++)if(candles[i].closeTime>=ts)return i;return 0}
function atrAt(i,atrSeries,atrNow){const v=Array.isArray(atrSeries)?Number(atrSeries[i]):Number(atrNow);return Number.isFinite(v)&&v>0?v:Number(atrNow)}
function derive(candles,range,{atrNow,atrSeries=null,breakoutAtr=.10,retestAtr=.25}={}){
  const asOf=candles?.at(-1)?.closeTime||null;
  if(!candles?.length||!range||!(Number(atrNow)>0))return{state:STATES.NONE,label:'관찰 조건 미충족',changedAt:asOf,knownAt:asOf,reason:'유효 박스 없음',range:null,invalidation:null};
  const top=range.high,bottom=range.low,start=firstIndexAfter(candles,range.knownAt);
  let state=STATES.WATCH,changedAt=range.knownAt,breakoutIndex=-1,retestIndex=-1,event=null;
  for(let i=start;i<candles.length;i++){
    const c=candles[i],av=atrAt(i,atrSeries,atrNow),breakMargin=av*breakoutAtr,retestTol=av*retestAtr;
    if(state===STATES.WATCH){
      if(c.close>top+breakMargin){state=STATES.BREAKOUT;changedAt=c.closeTime;breakoutIndex=i;event='close-breakout';continue}
      if(c.high>top&&c.close<=top)event='wick-rejection';
      continue;
    }
    if(state===STATES.BREAKOUT){
      if(i<=breakoutIndex)continue;
      if(c.close<top-retestTol){state=STATES.INVALID;changedAt=c.closeTime;event='box-reentry';break}
      if(c.low<=top+retestTol){
        retestIndex=i;
        if(c.close>=top+breakMargin){state=STATES.CONFIRMED;changedAt=c.closeTime;event='retest-hold'}
        else{state=STATES.RETEST;changedAt=c.closeTime;event='retest-touch'}
        continue;
      }
    }else if(state===STATES.RETEST){
      if(i<=breakoutIndex)continue;
      if(c.close<top-retestTol){state=STATES.INVALID;changedAt=c.closeTime;event='retest-fail';break}
      if(c.close>=top+breakMargin){state=STATES.CONFIRMED;changedAt=c.closeTime;event='retest-reclaim';continue}
    }else if(state===STATES.CONFIRMED){
      if(i<=breakoutIndex)continue;
      if(c.close<top-retestTol){state=STATES.INVALID;changedAt=c.closeTime;event='confirmed-setup-invalidated';break}
    }
  }
  const map={
    [STATES.WATCH]:'박스 관찰 · 상단 돌파 대기',
    [STATES.BREAKOUT]:'종가 돌파 확인 · 재테스트 대기',
    [STATES.RETEST]:'재테스트 진행 · 지지 확인 중',
    [STATES.CONFIRMED]:'재테스트 확인 · 롱 후보 조건 충족',
    [STATES.INVALID]:'구조 무효화 · 기존 시나리오 종료'
  };
  const currentAtr=atrAt(candles.length-1,atrSeries,atrNow),breakMargin=currentAtr*breakoutAtr,retestTol=currentAtr*retestAtr;
  const frozen=state!==STATES.WATCH?{...range,frozen:true,lockedAt:candles[breakoutIndex]?.closeTime||changedAt}:range;
  return{state,label:map[state],changedAt,knownAt:changedAt,event,breakoutIndex,retestIndex,range:frozen,confirmation:state===STATES.WATCH?{type:'close-above',timeframe:range.timeframe,price:top+breakMargin}:state===STATES.BREAKOUT?{type:'retest-hold',timeframe:range.timeframe,low:top-retestTol,high:top+retestTol}:state===STATES.RETEST?{type:'close-reclaim',timeframe:range.timeframe,price:top+breakMargin}:null,invalidation:state===STATES.WATCH?{type:'range-low',price:bottom}:{type:'breakout-failure',price:top-retestTol,structuralPrice:bottom}};
}
return{STATES,derive};
});
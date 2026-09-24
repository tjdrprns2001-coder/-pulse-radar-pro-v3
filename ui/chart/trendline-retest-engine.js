(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseTrendlineRetestEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='TRENDLINE_RETEST_v1.1';
const DEFAULT_PARAMS=Object.freeze({
  touchToleranceAtr:.15,
  breakBufferAtr:.20,
  reclaimBufferAtr:.05,
  bounceConfirmAtr:.30,
  retestMinBars:1,
  retestMaxBars:20,
  sameBarConfirmAllowed:true,
  preActivationPenetrationBufferAtr:.20,
  minAbsSlopeAtrPerBar:.003,
  maxAbsSlopeAtrPerBar:.35,
  comparisonEpsilonRel:1e-10
});
const finite=v=>Number.isFinite(Number(v));
const n=(v,d=null)=>finite(v)?Number(v):d;
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));

function normalizeCandles(rows=[]){
  return (Array.isArray(rows)?rows:[]).filter(Boolean).filter(x=>x.partial!==true).map((x,i)=>({
    index:i,time:n(x.time??x.openTime,i),open:n(x.open),high:n(x.high),low:n(x.low),close:n(x.close),volume:n(x.volume,0),atr:n(x.atr,0),partial:false
  })).filter(x=>[x.open,x.high,x.low,x.close].every(finite));
}
function atrSeries(candles=[],period=14){
  let prev=0;
  return candles.map((x,i)=>{
    if(n(x.atr,0)>0){prev=Number(x.atr);return prev}
    const tr=i?Math.max(x.high-x.low,Math.abs(x.high-candles[i-1].close),Math.abs(x.low-candles[i-1].close)):x.high-x.low;
    prev=i?((prev||tr)*(period-1)+tr)/period:tr;
    return prev;
  });
}
function stableStringify(obj){
  if(obj==null||typeof obj!=='object')return JSON.stringify(obj);
  if(Array.isArray(obj))return '['+obj.map(stableStringify).join(',')+']';
  return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')+'}';
}
function fnv1a(s){
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}
  return (h>>>0).toString(16).padStart(8,'0');
}
function mergeParams(p={}){
  const out={...DEFAULT_PARAMS,...p};
  out.retestMinBars=Math.max(1,Math.round(n(out.retestMinBars,1)));
  out.retestMaxBars=Math.max(out.retestMinBars,Math.round(n(out.retestMaxBars,20)));
  return out;
}
function paramsHash(p={}){return 'tlr1-'+fnv1a(stableStringify(mergeParams(p)))}
function comparisonEpsilon(a,b,P){
  const scale=Math.max(1,Math.abs(n(a,0)),Math.abs(n(b,0)));
  return scale*Math.max(0,n(P?.comparisonEpsilonRel,1e-10));
}
function greaterThanEps(a,b,P){return Number(a)>Number(b)+comparisonEpsilon(a,b,P)}
function lessThanEps(a,b,P){return Number(a)<Number(b)-comparisonEpsilon(a,b,P)}
function linePriceAt(line,index){
  if(line?.scale==='log-price'&&finite(line.interceptLog)&&finite(line.logSlopePerBar))return Math.exp(Number(line.interceptLog)+Number(line.logSlopePerBar)*index);
  if(finite(line?.intercept)&&finite(line?.slope))return Number(line.intercept)+Number(line.slope)*index;
  if(finite(line?.anchorA?.barIndex)&&finite(line?.anchorA?.price)&&finite(line?.anchorB?.barIndex)&&finite(line?.anchorB?.price)&&Number(line.anchorB.barIndex)!==Number(line.anchorA.barIndex)){
    const slope=(Number(line.anchorB.price)-Number(line.anchorA.price))/(Number(line.anchorB.barIndex)-Number(line.anchorA.barIndex));
    return Number(line.anchorA.price)+slope*(index-Number(line.anchorA.barIndex));
  }
  return null;
}
function lineSlopePerBar(line){
  if(finite(line?.slope))return Number(line.slope);
  if(finite(line?.anchorA?.barIndex)&&finite(line?.anchorA?.price)&&finite(line?.anchorB?.barIndex)&&finite(line?.anchorB?.price)&&Number(line.anchorB.barIndex)!==Number(line.anchorA.barIndex))return(Number(line.anchorB.price)-Number(line.anchorA.price))/(Number(line.anchorB.barIndex)-Number(line.anchorA.barIndex));
  return null;
}
function roleFor(side){return side==='resistance'?'SUPPORT':'RESISTANCE'}
function breakDirection(side){return side==='resistance'?'UP':'DOWN'}
function stateLabel(state){
  return{
    ACTIVE:'활성',
    BROKEN:'돌파 후 리테스트 대기',
    RETESTING:'리테스트 중',
    CONFIRMED:'리테스트 확인',
    FAILED:'리테스트 실패',
    NO_RETEST_EXPIRED:'리테스트 없이 만료',
    RETEST_EXPIRED:'리테스트 확인 없이 만료',
    DISCARDED:'추세선 제외'
  }[state]||state;
}
function typeLabel(side){return side==='resistance'?'하락 저항선':'상승 지지선'}
function directionIsValid(line,side,atrAtConfirm,P){
  const slope=lineSlopePerBar(line);if(!finite(slope)||!(atrAtConfirm>0))return{ok:false,reason:'SLOPE_OR_ATR_UNAVAILABLE',normalized:null};
  const normalized=finite(line?.normalizedSlope)?Number(line.normalizedSlope):slope/atrAtConfirm;
  if(side==='resistance'&&normalized>=-P.minAbsSlopeAtrPerBar)return{ok:false,reason:'RESISTANCE_NOT_DESCENDING',normalized};
  if(side==='support'&&normalized<=P.minAbsSlopeAtrPerBar)return{ok:false,reason:'SUPPORT_NOT_ASCENDING',normalized};
  if(Math.abs(normalized)>P.maxAbsSlopeAtrPerBar)return{ok:false,reason:'SLOPE_TOO_STEEP',normalized};
  return{ok:true,normalized};
}
function touchesBand(c,linePrice,tol){return Number(c.low)<=linePrice+tol&&Number(c.high)>=linePrice-tol}
function closeBeyondOriginalSide(c,linePrice,buffer,side,P){
  return side==='resistance'?greaterThanEps(c.close,linePrice+buffer,P):lessThanEps(c.close,linePrice-buffer,P);
}
function preActivationPenetration({candles,line,side,atrByIndex,confirmedBarIndex,P}){
  const start=Math.max(0,Math.round(n(line?.anchorB?.barIndex,0)));
  for(let i=start;i<=confirmedBarIndex&&i<candles.length;i++){
    const lp=linePriceAt(line,i),atr=n(atrByIndex[i],0);if(!finite(lp)||!(atr>0))continue;
    if(closeBeyondOriginalSide(candles[i],lp,atr*P.preActivationPenetrationBufferAtr,side,P))return{barIndex:i,linePrice:lp,close:candles[i].close};
  }
  return null;
}
function breakDetected(prev,c,prevLine,linePrice,prevAtr,atr,side,P){
  if(side==='resistance')return !greaterThanEps(prev.close,prevLine+prevAtr*P.breakBufferAtr,P)&&greaterThanEps(c.close,linePrice+atr*P.breakBufferAtr,P);
  return !lessThanEps(prev.close,prevLine-prevAtr*P.breakBufferAtr,P)&&lessThanEps(c.close,linePrice-atr*P.breakBufferAtr,P);
}
function failDetected(c,linePrice,frozenAtr,side,P){
  return side==='resistance'?lessThanEps(c.close,linePrice-frozenAtr*P.breakBufferAtr,P):greaterThanEps(c.close,linePrice+frozenAtr*P.breakBufferAtr,P);
}
function confirmDetected(c,linePrice,frozenAtr,side,P){
  return side==='resistance'?greaterThanEps(c.close,linePrice+frozenAtr*P.reclaimBufferAtr,P):lessThanEps(c.close,linePrice-frozenAtr*P.reclaimBufferAtr,P);
}
function rejectionDetected(c,linePrice,atr,side,P){
  if(!touchesBand(c,linePrice,atr*P.touchToleranceAtr))return false;
  return side==='resistance'?!greaterThanEps(c.close,linePrice-atr*P.reclaimBufferAtr,P):!lessThanEps(c.close,linePrice+atr*P.reclaimBufferAtr,P);
}
function favorableDistanceAtr(c,linePrice,frozenAtr,side){
  if(!(frozenAtr>0))return null;
  return side==='resistance'?(Number(c.close)-linePrice)/frozenAtr:(linePrice-Number(c.close))/frozenAtr;
}
function displacementAtr(c,frozenAtr){return frozenAtr>0?Math.abs(Number(c.close)-Number(c.open))/frozenAtr:null}
function lineSnapshot(line,side,confirmedBarIndex,hash){
  return{
    lineId:String(line.id||side+'-'+n(line.anchorA?.barIndex,0)+'-'+n(line.anchorB?.barIndex,0)),
    type:side==='resistance'?'RESISTANCE':'SUPPORT',
    roleAfterBreak:roleFor(side),
    anchor1:{time:line.anchorA?.time??null,barIndex:n(line.anchorA?.barIndex),price:n(line.anchorA?.price)},
    anchor2:{time:line.anchorB?.time??null,barIndex:n(line.anchorB?.barIndex),price:n(line.anchorB?.price)},
    slopePerBar:lineSlopePerBar(line),
    intercept:n(line.intercept),
    scale:String(line.scale||'linear-price'),
    confirmedBarIndex,
    paramsHash:hash
  };
}
function qualityFor({line,breakout,retest,state,P}){
  const anchorAndTouches=n(line?.touchCount,0)>=3?20:n(line?.touchCount,0)>=2?12:6;
  const clearBreak=breakout?20:0;
  const d=n(breakout?.displacementAtr,0);
  const displacement=d>=.8?15:d>=.5?10:d>=.3?5:0;
  const timelyRetest=retest?.firstTouchBarIndex!=null?10:0;
  const roleHeld=state==='CONFIRMED'?15:0;
  const mssCisd=0,pdConfluence=0;
  const score=anchorAndTouches+clearBreak+displacement+timelyRetest+roleHeld+mssCisd+pdConfluence;
  return{score,max:100,phase1Max:80,label:'근거 완성도',components:{anchorAndTouches,clearBreak,displacement,timelyRetest,roleHeld,mssCisd,pdConfluence},note:'승률이 아님 · MSS/CISD 및 FVG/OB 결합은 2차 품질 항목'};
}
function buildCurrentLevels({line,side,state,breakout,candles,atrByIndex,P}){
  const index=candles.length-1,linePrice=linePriceAt(line,index),atr=breakout?.frozenAtr||n(atrByIndex[index],0),tol=atr*P.touchToleranceAtr,breakBuf=atr*P.breakBufferAtr;
  const invalidation=side==='resistance'?linePrice-breakBuf:linePrice+breakBuf;
  const formula=side==='resistance'?'L(x) − '+P.breakBufferAtr.toFixed(2)+'×frozenATR 종가 이탈':'L(x) + '+P.breakBufferAtr.toFixed(2)+'×frozenATR 종가 이탈';
  return{barIndex:index,linePrice,zoneBottom:linePrice-tol,zoneTop:linePrice+tol,invalidationPrice:invalidation,invalidationFormula:formula,atrBasis:breakout?.frozenAtr?'frozen':'live-before-break',atr,state};
}
function evaluateLineLifecycle({candles:rawCandles,line,side,params={}}={}){
  const P=mergeParams(params),hash=paramsHash(P),candles=normalizeCandles(rawCandles||[]),atrByIndex=atrSeries(candles);
  if(!line||!['support','resistance'].includes(side)||candles.length<3)return{ok:false,state:'DISCARDED',stateLabel:stateLabel('DISCARDED'),reason:'INVALID_INPUT',params:P,paramsHash:hash};
  const confirmedBarIndex=Math.max(
    Math.round(n(line.confirmedBarIndex,line.availableAt??line.anchorB?.barIndex??0)),
    Math.round(n(line.anchorB?.barIndex,0))
  );
  if(confirmedBarIndex>=candles.length)return{ok:false,state:'DISCARDED',stateLabel:stateLabel('DISCARDED'),reason:'LINE_NOT_YET_CONFIRMED',params:P,paramsHash:hash};
  const dirCheck=directionIsValid(line,side,n(atrByIndex[confirmedBarIndex],0),P);
  if(!dirCheck.ok)return{ok:false,state:'DISCARDED',stateLabel:stateLabel('DISCARDED'),reason:dirCheck.reason,normalizedSlope:dirCheck.normalized,params:P,paramsHash:hash,line:lineSnapshot(line,side,confirmedBarIndex,hash)};
  const pre=preActivationPenetration({candles,line,side,atrByIndex,confirmedBarIndex,P});
  if(pre)return{ok:false,state:'DISCARDED',stateLabel:stateLabel('DISCARDED'),reason:'PRE_CONFIRMATION_CLOSE_PENETRATION',preActivationPenetration:pre,params:P,paramsHash:hash,line:lineSnapshot(line,side,confirmedBarIndex,hash)};

  const events=[],frozenLine=lineSnapshot(line,side,confirmedBarIndex,hash),transitions=[];
  let state='ACTIVE',breakout=null,retest={firstTouchBarIndex:null,firstTouchTime:null,confirmedBarIndex:null,confirmedTime:null,touchDistanceAtr:null,bounceDistanceAtr:null,sameBarConfirm:false},failedAt=null,expiredAt=null,inTouchEpisode=false,rejectionCount=0;
  const telemetry={retestTouchObserved:false,sameBarWouldConfirm:false,sameBarConfirmed:false,confirmationBarsAfterTouch:null,retestLatencyBars:null,deadZoneBars:0,failedBeforeRetest:false,noRetestExpired:false,retestExpired:false,terminalBarsAfterBreak:null,comparisonEpsilonRel:P.comparisonEpsilonRel};
  const transition=(to,barIndex,time,reason)=>{
    const from=state;if(from===to)return;
    transitions.push({from,to,barIndex,time,reason});
    state=to;
  };

  for(let i=Math.max(1,confirmedBarIndex);i<candles.length;i++){
    const c=candles[i],prev=candles[i-1],lp=linePriceAt(line,i),prevLp=linePriceAt(line,i-1),atr=n(atrByIndex[i],0),prevAtr=n(atrByIndex[i-1],atr);
    if(!finite(lp)||!finite(prevLp)||!(atr>0))continue;

    if(state==='ACTIVE'){
      const touch=touchesBand(c,lp,atr*P.touchToleranceAtr);
      if(touch&&!inTouchEpisode){
        events.push({type:'TOUCH',barIndex:i,time:c.time,linePrice:lp,distanceAtr:Math.min(Math.abs(c.low-lp),Math.abs(c.high-lp))/atr});
        if(rejectionDetected(c,lp,atr,side,P)){
          rejectionCount++;
          events.push({type:'REJECTION',barIndex:i,time:c.time,linePrice:lp,close:c.close,distanceAtr:Math.abs(c.close-lp)/atr});
        }
      }
      inTouchEpisode=touch;
      if(i>=confirmedBarIndex&&breakDetected(prev,c,prevLp,lp,prevAtr,atr,side,P)){
        const frozenAtr=atr,dir=breakDirection(side),breakDist=side==='resistance'?(c.close-lp)/frozenAtr:(lp-c.close)/frozenAtr;
        breakout={barIndex:i,time:c.time,close:c.close,linePrice:lp,atr:frozenAtr,frozenAtr,direction:dir,breakDistanceAtr:breakDist,displacementAtr:displacementAtr(c,frozenAtr)};
        transition('BROKEN',i,c.time,'BREAK_CLOSE_BUFFER');inTouchEpisode=false;
        events.push({type:'BREAK',barIndex:i,time:c.time,linePrice:lp,close:c.close,direction:dir,frozenAtr,paramsHash:hash});
        continue;
      }
      continue;
    }

    if(state==='BROKEN'||state==='RETESTING'){
      const frozenAtr=breakout.frozenAtr,barsSinceBreak=i-breakout.barIndex;
      if(failDetected(c,lp,frozenAtr,side,P)){
        telemetry.failedBeforeRetest=retest.firstTouchBarIndex==null;
        telemetry.terminalBarsAfterBreak=i-breakout.barIndex;
        transition('FAILED',i,c.time,telemetry.failedBeforeRetest?'FAIL_BUFFER_BEFORE_RETEST':'FAIL_BUFFER_AFTER_RETEST');
        failedAt={barIndex:i,time:c.time,close:c.close,linePrice:lp};
        events.push({type:'FAILED_RETEST',barIndex:i,time:c.time,linePrice:lp,close:c.close,hadRetest:retest.firstTouchBarIndex!=null});
        break;
      }

      if(retest.firstTouchBarIndex==null&&barsSinceBreak>P.retestMaxBars){
        telemetry.noRetestExpired=true;telemetry.terminalBarsAfterBreak=i-breakout.barIndex;
        transition('NO_RETEST_EXPIRED',i,c.time,'RETEST_WINDOW_EXPIRED_WITHOUT_TOUCH');expiredAt={barIndex:i,time:c.time};
        events.push({type:'NO_RETEST_EXPIRED',barIndex:i,time:c.time});
        break;
      }
      if(retest.firstTouchBarIndex!=null&&barsSinceBreak>P.retestMaxBars){
        telemetry.retestExpired=true;telemetry.terminalBarsAfterBreak=i-breakout.barIndex;
        transition('RETEST_EXPIRED',i,c.time,'RETEST_WINDOW_EXPIRED_AFTER_TOUCH');expiredAt={barIndex:i,time:c.time};
        events.push({type:'RETEST_EXPIRED',barIndex:i,time:c.time});
        break;
      }

      if(retest.firstTouchBarIndex==null&&barsSinceBreak>=P.retestMinBars&&touchesBand(c,lp,frozenAtr*P.touchToleranceAtr)){
        const touchDistanceAtr=Math.min(Math.abs(c.low-lp),Math.abs(c.high-lp))/frozenAtr,wouldConfirm=confirmDetected(c,lp,frozenAtr,side,P);
        telemetry.retestTouchObserved=true;telemetry.retestLatencyBars=barsSinceBreak;telemetry.sameBarWouldConfirm=wouldConfirm;
        transition('RETESTING',i,c.time,'RETEST_TOUCH');
        retest={...retest,firstTouchBarIndex:i,firstTouchTime:c.time,touchDistanceAtr};
        events.push({type:'RETEST_TOUCH',barIndex:i,time:c.time,linePrice:lp,touchDistanceAtr,sameBarWouldConfirm:wouldConfirm});
        if(P.sameBarConfirmAllowed&&wouldConfirm){
          const bounce=favorableDistanceAtr(c,lp,frozenAtr,side);
          telemetry.sameBarConfirmed=true;telemetry.confirmationBarsAfterTouch=0;telemetry.terminalBarsAfterBreak=i-breakout.barIndex;
          transition('CONFIRMED',i,c.time,'SAME_BAR_RETEST_CONFIRM');
          retest={...retest,confirmedBarIndex:i,confirmedTime:c.time,bounceDistanceAtr:bounce,sameBarConfirm:true};
          events.push({type:'RETEST_CONFIRMED',barIndex:i,time:c.time,linePrice:lp,close:c.close,bounceDistanceAtr:bounce,sameBarConfirm:true});
          break;
        }
        telemetry.deadZoneBars++;
        continue;
      }

      if(state==='RETESTING'&&retest.firstTouchBarIndex!=null&&i>retest.firstTouchBarIndex&&confirmDetected(c,lp,frozenAtr,side,P)){
        const bounce=favorableDistanceAtr(c,lp,frozenAtr,side);
        telemetry.confirmationBarsAfterTouch=i-retest.firstTouchBarIndex;telemetry.terminalBarsAfterBreak=i-breakout.barIndex;
        transition('CONFIRMED',i,c.time,'POST_TOUCH_RECLAIM_CONFIRM');
        retest={...retest,confirmedBarIndex:i,confirmedTime:c.time,bounceDistanceAtr:bounce,sameBarConfirm:false};
        events.push({type:'RETEST_CONFIRMED',barIndex:i,time:c.time,linePrice:lp,close:c.close,bounceDistanceAtr:bounce,sameBarConfirm:false});
        break;
      }
      if(state==='RETESTING'&&retest.firstTouchBarIndex!=null)telemetry.deadZoneBars++;
      // Explicit dead-zone policy: neither confirmed nor failed -> keep current state and keep timeout counting.
    }
  }

  const current=buildCurrentLevels({line,side,state,breakout,candles,atrByIndex,P});
  const quality=qualityFor({line,breakout,retest,state,P});
  return{
    ok:true,version:VERSION,line:frozenLine,side,type:typeLabel(side),state,stateLabel:stateLabel(state),roleAfterBreak:roleFor(side),breakDirection:breakDirection(side),
    confirmedBarIndex,normalizedSlope:dirCheck.normalized,rejectionCount,events,transitions,transitionPath:['ACTIVE',...transitions.map(x=>x.to)],telemetry,breakout,retest,failedAt,expiredAt,current,quality,params:P,paramsHash:hash,
    sameBarConfirmAllowed:P.sameBarConfirmAllowed,
    deadZonePolicy:'BROKEN/RETESTING 유지 + retestMaxBars timeout 계속',
    frozenAtrPolicy:'BROKEN 진입 시 breakout ATR 고정; 이후 touch/reclaim/fail 판정에 동일 frozenATR 사용',
    lineProjectionPolicy:'매 봉 현재 barIndex에서 L(x) 재계산',
    eventFreezePolicy:'breakout 시 anchor/barIndex/slope/paramsHash를 event snapshot에 동결'
  };
}
function flattenCandidates(trendlines={}){
  const ev=trendlines?.eventCandidates||{},base=[
    ...(Array.isArray(ev.support)?ev.support:[]).map(line=>({line,side:'support'})),
    ...(Array.isArray(ev.resistance)?ev.resistance:[]).map(line=>({line,side:'resistance'}))
  ];
  if(base.length)return base;
  return[
    ...(trendlines?.support?[{line:trendlines.support,side:'support'}]:[]),
    ...(trendlines?.resistance?[{line:trendlines.resistance,side:'resistance'}]:[]),
    ...((trendlines?.secondary?.support||[]).map(line=>({line,side:'support'}))),
    ...((trendlines?.secondary?.resistance||[]).map(line=>({line,side:'resistance'})))
  ];
}
function statePriority(x){
  const p={RETESTING:100,BROKEN:95,CONFIRMED:88,FAILED:75,ACTIVE:65,RETEST_EXPIRED:45,NO_RETEST_EXPIRED:40,DISCARDED:0};
  const recency=n(x?.breakout?.barIndex,x?.line?.anchor2?.barIndex??0);
  return(p[x?.state]||0)*1e6+recency*1000+n(x?.quality?.score,0);
}
function analyzeTrendlineRetests({candles=[],trendlines={},timeframe='',params={}}={}){
  const evaluated=flattenCandidates(trendlines).map(x=>evaluateLineLifecycle({candles,line:x.line,side:x.side,params}));
  const valid=evaluated.filter(x=>x.ok&&x.state!=='DISCARDED').sort((a,b)=>statePriority(b)-statePriority(a));
  return{
    ok:true,version:VERSION,timeframe:String(timeframe||''),params:mergeParams(params),paramsHash:paramsHash(params),
    primary:valid[0]||null,events:valid,discarded:evaluated.filter(x=>!x.ok||x.state==='DISCARDED'),
    counts:valid.reduce((o,x)=>(o[x.state]=(o[x.state]||0)+1,o),{}),
    note:'Trendline retest quality is evidence completeness, not win probability.'
  };
}
return{VERSION,DEFAULT_PARAMS,normalizeCandles,atrSeries,paramsHash,comparisonEpsilon,greaterThanEps,lessThanEps,linePriceAt,mergeParams,evaluateLineLifecycle,analyzeTrendlineRetests,stateLabel,typeLabel};
});
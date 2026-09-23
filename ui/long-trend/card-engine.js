(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseLongTrendCardEngine=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const DEFAULT_PARAMS=Object.freeze({
  minBars:40,
  minConfirmedSwings:6,
  slopeNeutralDailyPct:.02,
  closeToleranceAtr:.35,
  structureLookbackPerSide:2,
  neutralOnBreakCandidate:true,
  confirmedBreakStages:Object.freeze(['BREAK_CONFIRMED','ROLE_FLIP'])
});
const finite=v=>Number.isFinite(Number(v)),num=v=>Number(v);
const sec=t=>{const n=num(t);return Math.trunc(n>1e12?n/1000:n)};
function mergeParams(p={}){return{...DEFAULT_PARAMS,...p,confirmedBreakStages:Array.isArray(p.confirmedBreakStages)?p.confirmedBreakStages:DEFAULT_PARAMS.confirmedBreakStages}}
function confirmedCandles(rows=[]){return rows.filter(x=>x&&x.partial!==true&&finite(x.close)&&finite(x.time??x.openTime))}
function normSwings(swings=[]){return swings.filter(s=>s&&s.status!=='provisional'&&s.status!=='discarded'&&s.status!=='replaced'&&s.confirmed!==false).map(s=>({type:String(s.type||'').toUpperCase(),price:num(s.price),index:num(s.index??s.pivotIndex??s.i),confirmedAt:num(s.confirmedAt??s.index??s.pivotIndex??s.i)})).filter(s=>finite(s.price)&&finite(s.index)&&finite(s.confirmedAt)&&['H','HIGH','L','LOW'].includes(s.type)).sort((a,b)=>a.confirmedAt-b.confirmedAt||a.index-b.index)}
function structureRegime(swings=[],lookback=2){
  const s=normSwings(swings),highs=s.filter(x=>x.type==='H'||x.type==='HIGH').slice(-lookback),lows=s.filter(x=>x.type==='L'||x.type==='LOW').slice(-lookback);
  if(highs.length<2||lows.length<2)return{key:'INSUFFICIENT',label:'구조 부족',hh:false,hl:false,lh:false,ll:false};
  const hh=highs.at(-1).price>highs.at(-2).price,lh=highs.at(-1).price<highs.at(-2).price,hl=lows.at(-1).price>lows.at(-2).price,ll=lows.at(-1).price<lows.at(-2).price;
  if(hh&&hl)return{key:'HH_HL',label:'HH/HL',hh,hl,lh,ll};
  if(lh&&ll)return{key:'LH_LL',label:'LH/LL',hh,hl,lh,ll};
  return{key:'MIXED',label:'혼조',hh,hl,lh,ll};
}
function lastAtr(rows=[]){for(let i=rows.length-1;i>=0;i--){if(finite(rows[i]?.atr)&&num(rows[i].atr)>0)return num(rows[i].atr)}if(rows.length<2)return 0;const p=14,start=Math.max(1,rows.length-p),trs=[];for(let i=start;i<rows.length;i++){const c=rows[i],prev=rows[i-1],tr=Math.max(num(c.high)-num(c.low),Math.abs(num(c.high)-num(prev.close)),Math.abs(num(c.low)-num(prev.close)));if(finite(tr))trs.push(tr)}return trs.length?trs.reduce((a,b)=>a+b,0)/trs.length:0}
function lineCloseRelation(line,close,atr,params){
  if(!line||!finite(line.projectedPrice)||!finite(close))return'unknown';
  const level=num(line.projectedPrice),tol=(atr>0&&level>0)?params.closeToleranceAtr*atr/level:0;
  const ratio=num(close)/level-1;
  return ratio>tol?'above':ratio<-tol?'below':'near';
}
function chooseDisplayLine(analysis){
  const lines=[analysis?.support,analysis?.resistance].filter(Boolean).filter(x=>x.state!=='broken');
  if(!lines.length)return null;
  return lines.sort((a,b)=>Math.abs(num(a.currentDistancePct)||0)-Math.abs(num(b.currentDistancePct)||0)||num(b.score)-num(a.score))[0]||null;
}
function buildCardResult({tf,raw,analysis,params}={}){
  const P=mergeParams(params),rows=confirmedCandles(raw?.candles||[]),swings=normSwings(raw?.canonicalSwings||[]),last=rows.at(-1)||null;
  const bars=rows.length,confirmedSwings=swings.length;
  if(!analysis?.eligible)return{tf,available:false,badge:'데이터 부족',badgeKey:'INSUFFICIENT',reason:analysis?.reason||'HTF-only',bars,confirmedSwings,validationStatus:'UNVALIDATED',signalStatus:'RESEARCH_ONLY'};
  if(bars<P.minBars||confirmedSwings<P.minConfirmedSwings||!analysis?.available||!last){
    return{tf,available:false,badge:'데이터 부족',badgeKey:'INSUFFICIENT',reason:bars<P.minBars?'확정봉 부족':confirmedSwings<P.minConfirmedSwings?'확정 Canonical Swing 부족':analysis?.reason||'유효 장기선 없음',bars,requiredBars:P.minBars,confirmedSwings,requiredSwings:P.minConfirmedSwings,validationStatus:'UNVALIDATED',signalStatus:'RESEARCH_ONLY'};
  }
  const structure=structureRegime(swings,P.structureLookbackPerSide),atr=lastAtr(rows),support=analysis.support||null,resistance=analysis.resistance||null,displayLine=chooseDisplayLine(analysis);
  const supportRel=lineCloseRelation(support,last.close,atr,P),resistanceRel=lineCloseRelation(resistance,last.close,atr,P);
  const stages=[support?.polarity?.stage,resistance?.polarity?.stage].filter(Boolean),hasCandidate=stages.includes('BREAK_CANDIDATE');
  const supportBreak=P.confirmedBreakStages.includes(support?.polarity?.stage),resistanceBreak=P.confirmedBreakStages.includes(resistance?.polarity?.stage);
  const supportSlope=finite(support?.dailySlopePct)?num(support.dailySlopePct):null,resistanceSlope=finite(resistance?.dailySlopePct)?num(resistance.dailySlopePct):null;
  const bullSupport=!!support&&supportSlope>P.slopeNeutralDailyPct&&['above','near'].includes(supportRel)&&!supportBreak;
  const bearResistance=!!resistance&&resistanceSlope<-P.slopeNeutralDailyPct&&['below','near'].includes(resistanceRel)&&!resistanceBreak;
  let badge='중립',badgeKey='NEUTRAL',reason='구조·기울기 합의 대기';
  if(P.neutralOnBreakCandidate&&hasCandidate){reason='추세선 돌파 후보 · 재확정 전';}
  else if((bullSupport&&structure.key==='HH_HL')||(resistanceBreak&&structure.key==='HH_HL')){badge='상승';badgeKey='UP';reason=resistanceBreak?'저항 돌파 확인 + HH/HL':'상승 지지선 유지 + HH/HL';}
  else if((bearResistance&&structure.key==='LH_LL')||(supportBreak&&structure.key==='LH_LL')){badge='하락';badgeKey='DOWN';reason=supportBreak?'지지 이탈 확인 + LH/LL':'하락 저항선 유지 + LH/LL';}
  const lead=displayLine,quality=finite(lead?.score)?num(lead.score):0,r2=finite(lead?.r2)?num(lead.r2):0,regressionScore=finite(lead?.regressionScore)?num(lead.regressionScore):Math.round(r2*100),integrity=finite(lead?.lineIntegrityScore)?num(lead.lineIntegrityScore):0;
  const slopeDailyPct=finite(lead?.dailySlopePct)?num(lead.dailySlopePct):0,distancePct=finite(lead?.currentDistancePct)?num(lead.currentDistancePct):null;
  const supportMaintained=!!support&&!supportBreak&&['above','near'].includes(supportRel);
  return{tf,available:true,badge,badgeKey,reason,bars,confirmedSwings,structure,latestClose:num(last.close),latestTime:sec(last.time??last.openTime),atr,displayLine,lineSide:lead?.effectiveSide||lead?.side||null,quality,r2,regressionScore,integrity,slopeDailyPct,dailyLogSlope:finite(lead?.dailyLogSlope)?num(lead.dailyLogSlope):0,distancePct,polarityStage:lead?.polarity?.stage||'ACTIVE',supportMaintained,validationStatus:'UNVALIDATED',signalStatus:'RESEARCH_ONLY',params:P};
}
return{DEFAULT_PARAMS,mergeParams,confirmedCandles,normSwings,structureRegime,lineCloseRelation,chooseDisplayLine,buildCardResult};
});
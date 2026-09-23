(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseLongTrendAggregateEngine=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const TF_ORDER=Object.freeze(['28d','14d','1w','3d','1d','4h']);
const TF_WEIGHTS=Object.freeze({'28d':.24,'14d':.20,'1w':.16,'3d':.16,'1d':.14,'4h':.10});
const HTF_DOMINANCE=Object.freeze(['28d','1w','3d']);
const DEFAULT_PARAMS=Object.freeze({
  directionThreshold:.15,
  r2Weight:.70,
  slopeWeight:.30,
  slopeFullScaleDailyPct:.50,
  minCompositeFrames:2,
  structureAnchorTf:'1d'
});
const finite=v=>Number.isFinite(Number(v)),num=v=>Number(v),clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,num(v)||0));
const dirScore=k=>k==='UP'?1:k==='DOWN'?-1:0;
function mergeParams(p={}){return{...DEFAULT_PARAMS,...p}}
function availableCards(cards={}){return TF_ORDER.map(tf=>cards[tf]).filter(x=>x?.available)}
function directionConsensus(cards={},params={}){
  const P=mergeParams(params),valid=availableCards(cards),total=valid.reduce((s,x)=>s+(TF_WEIGHTS[x.tf]||0),0);
  if(!valid.length||!total)return{key:'NEUTRAL',label:'중립',score:0,availableWeight:0};
  const score=valid.reduce((s,x)=>s+(TF_WEIGHTS[x.tf]||0)*dirScore(x.badgeKey),0)/total;
  const key=score>P.directionThreshold?'UP':score<-P.directionThreshold?'DOWN':'NEUTRAL';
  return{key,label:key==='UP'?'상승':key==='DOWN'?'하락':'중립',score,availableWeight:total};
}
function alignmentScore(cards={},directionKey){
  const valid=availableCards(cards);if(!valid.length)return 0;
  const target=directionKey||directionConsensus(cards).key;
  return valid.filter(x=>x.badgeKey===target).length/valid.length*100;
}
function strengthScore(cards={},params={}){
  const P=mergeParams(params),valid=availableCards(cards).filter(x=>finite(x.regressionScore)&&finite(x.slopeDailyPct));
  if(!valid.length)return{score:0,r2Score:0,slopeScore:0};
  const sw=valid.reduce((s,x)=>s+(TF_WEIGHTS[x.tf]||0),0)||1;
  const r2=valid.reduce((s,x)=>s+(TF_WEIGHTS[x.tf]||0)*clamp(x.regressionScore),0)/sw;
  const slope=valid.reduce((s,x)=>s+(TF_WEIGHTS[x.tf]||0)*clamp(Math.abs(num(x.slopeDailyPct))/P.slopeFullScaleDailyPct*100),0)/sw;
  return{score:clamp(r2*P.r2Weight+slope*P.slopeWeight),r2Score:r2,slopeScore:slope};
}
function htfDominance(cards={}){
  const group=HTF_DOMINANCE.map(tf=>cards[tf]);
  if(group.some(x=>!x?.available))return{active:false,label:'판정 불가',direction:'NEUTRAL',frames:HTF_DOMINANCE};
  const k=group[0].badgeKey,active=k!=='NEUTRAL'&&group.every(x=>x.badgeKey===k);
  return{active,label:active?(k==='UP'?'상승 우세':'하락 우세'):'불일치',direction:active?k:'NEUTRAL',frames:HTF_DOMINANCE};
}
function displayComposite(cards={},baseRows=[],params={}){
  const P=mergeParams(params),valid=availableCards(cards).filter(x=>x.displayLine&&finite(x.dailyLogSlope)&&finite(x.latestTime)&&finite(x.displayLine.projectedPrice)&&num(x.displayLine.projectedPrice)>0);
  const rows=(baseRows||[]).filter(x=>x&&x.partial!==true&&finite(x.close)&&finite(x.time??x.openTime));
  const last=rows.at(-1);if(valid.length<P.minCompositeFrames||!last)return null;
  const refTime=Math.trunc(num(last.time??last.openTime)>1e12?num(last.time??last.openTime)/1000:num(last.time??last.openTime)),price=num(last.close);
  let sw=0,weightedSlope=0,weightedLogLevel=0;
  for(const x of valid){
    const w=TF_WEIGHTS[x.tf]||0,lastTime=num(x.latestTime),deltaDays=(refTime-lastTime)/86400,levelAtRef=num(x.displayLine.projectedPrice)*Math.exp(num(x.dailyLogSlope)*deltaDays);
    if(!(w>0)||!(levelAtRef>0))continue;
    sw+=w;weightedSlope+=w*num(x.dailyLogSlope);weightedLogLevel+=w*Math.log(levelAtRef);
  }
  if(!(sw>0))return null;
  const dailyLogSlope=weightedSlope/sw,levelAtRef=Math.exp(weightedLogLevel/sw),dailySlopePct=(Math.exp(dailyLogSlope)-1)*100,distancePct=(price/levelAtRef-1)*100;
  return{baseTimeframe:'1d',refTime,price,dailyLogSlope,dailySlopePct,levelAtRef,distancePct,frameCount:valid.length,weightSum:sw,actualPriceAverage:false,method:'TF slope/intercept weighted in normalized log-time space',displayOnly:true};
}
function structureStatus(cards={},params={}){
  const P=mergeParams(params),anchor=cards[P.structureAnchorTf]||availableCards(cards)[0];
  if(!anchor?.available)return{maintained:false,label:'판정 불가',anchorTf:anchor?.tf||P.structureAnchorTf};
  return{maintained:!!anchor.supportMaintained,label:anchor.supportMaintained?'구조 유지':'지지 확인 필요',anchorTf:anchor.tf};
}
function buildSummary(cards={},baseRows=[],params={}){
  const P=mergeParams(params),direction=directionConsensus(cards,P),alignment=alignmentScore(cards,direction.key),strength=strengthScore(cards,P),composite=displayComposite(cards,baseRows,P),htf=htfDominance(cards),structure=structureStatus(cards,P),valid=availableCards(cards);
  const avgIntegrity=valid.length?valid.reduce((s,x)=>s+(TF_WEIGHTS[x.tf]||0)*(finite(x.integrity)?num(x.integrity):0),0)/(valid.reduce((s,x)=>s+(TF_WEIGHTS[x.tf]||0),0)||1):0;
  return{direction,alignment,strength,composite,htf,structure,avgIntegrity,validCount:valid.length,totalFrames:TF_ORDER.length,validationStatus:'UNVALIDATED',signalStatus:'RESEARCH_ONLY',scoreSemantics:'trend evidence quality; not win probability',actualPriceAverage:false,params:P};
}
return{TF_ORDER,TF_WEIGHTS,HTF_DOMINANCE,DEFAULT_PARAMS,mergeParams,directionConsensus,alignmentScore,strengthScore,htfDominance,displayComposite,structureStatus,buildSummary};
});
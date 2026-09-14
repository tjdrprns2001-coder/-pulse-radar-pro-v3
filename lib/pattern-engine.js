const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const finite=v=>Number.isFinite(Number(v));
const APEX_FACTOR={'15m':1.0,'1h':1.25,'4h':1.5,'1d':2.0};

function fitLine(points){
  if(!points||points.length<2)return null;
  const xs=points.map(p=>p.index),ys=points.map(p=>p.price),mx=avg(xs),my=avg(ys);
  let cov=0,varx=0;
  for(let i=0;i<points.length;i++){cov+=(xs[i]-mx)*(ys[i]-my);varx+=(xs[i]-mx)**2}
  if(!varx)return null;
  const slope=cov/varx,intercept=my-slope*mx;
  const ssTot=ys.reduce((s,y)=>s+(y-my)**2,0),ssRes=points.reduce((s,p)=>s+(p.price-(slope*p.index+intercept))**2,0);
  const r2=ssTot?clamp(1-ssRes/ssTot,0,1):0;
  return{slope,intercept,r2,valueAt:i=>slope*i+intercept};
}

function spacedTouches(points,line,atrByIndex,tolAtr=.35,minSpacing=3){
  const hits=[];
  for(const p of points){
    const atr=Number(atrByIndex[p.index]||0),tol=Math.max(Math.abs(p.price)*.0015,atr*tolAtr);
    if(Math.abs(p.price-line.valueAt(p.index))<=tol&&(!hits.length||p.index-hits.at(-1).index>=minSpacing))hits.push(p);
  }
  return hits;
}

function integrity({klines,line,side,start,end,atrByIndex,wickTolAtr=.30,strongCloseAtr=.50}){
  let wickBreaches=0,strongCloseBreaches=0,bodyCrossCount=0,wickDepthAtr=0,strongDepthAtr=0,samples=0;
  for(let i=Math.max(0,start);i<=Math.min(end,klines.length-1);i++){
    const k=klines[i],atr=Number(atrByIndex[i]||0);if(!atr)continue;
    samples++;
    const y=line.valueAt(i),wickLimit=atr*wickTolAtr,strongLimit=atr*strongCloseAtr;
    const wickExcursion=side==='upper'?Number(k.high)-y:y-Number(k.low);
    const closeExcursion=side==='upper'?Number(k.close)-y:y-Number(k.close);
    if(wickExcursion>wickLimit){wickBreaches++;wickDepthAtr+=Math.max(0,(wickExcursion-wickLimit)/atr)}
    if(closeExcursion>strongLimit){strongCloseBreaches++;strongDepthAtr+=Math.max(0,(closeExcursion-strongLimit)/atr)}
    const bodyHi=Math.max(Number(k.open),Number(k.close)),bodyLo=Math.min(Number(k.open),Number(k.close));
    if(y>bodyLo&&y<bodyHi)bodyCrossCount++;
  }
  const wickPenalty=Math.min(25,wickBreaches*2+wickDepthAtr*4);
  const bodyPenalty=Math.min(20,bodyCrossCount*1.5);
  const strongPenalty=Math.min(60,strongCloseBreaches*12+strongDepthAtr*14);
  const score=clamp(100-wickPenalty-bodyPenalty-strongPenalty,0,100);
  return{
    score:Math.round(score),
    breachCount:wickBreaches+strongCloseBreaches,
    wickBreaches,strongCloseBreaches,bodyCrossCount,
    breachDepthAtr:Number((wickDepthAtr+strongDepthAtr).toFixed(3)),
    wickDepthAtr:Number(wickDepthAtr.toFixed(3)),strongDepthAtr:Number(strongDepthAtr.toFixed(3)),samples
  };
}

function volumeContraction(klines,start){
  const inside=klines.slice(Math.max(0,start)),before=klines.slice(Math.max(0,start-30),start);
  if(inside.length<10||before.length<10)return false;
  const median=a=>{const x=[...a].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
  const a=median(inside.map(k=>k.volume)),b=median(before.map(k=>k.volume));
  return a!=null&&b!=null&&b>0&&a<b*.82;
}

function bullishDivergence(lows,rsi,atrByIndex){
  if(!rsi||lows.length<2)return false;
  const a=lows.at(-2),b=lows.at(-1),ra=Number(rsi[a.index]),rb=Number(rsi[b.index]),atr=Number(atrByIndex[b.index]||0);
  if(!finite(ra)||!finite(rb))return false;
  return b.price<a.price-Math.max(0,atr*.15)&&rb>ra;
}

function structureBonus(structure){
  const ev=(structure?.events||structure?.recentEvents||[]).slice(-6);let score=0;
  if(ev.some(x=>(x.type==='CHOCH'||x.type==='CHoCH')&&(x.dir==='up'||x.direction==='UP')))score+=6;
  if(ev.some(x=>x.type==='BOS'&&(x.dir==='up'||x.direction==='UP')))score+=4;
  return Math.min(10,score);
}

function analyzeFallingWedge({klines,swings,atrByIndex,rsi,structure,zones,lookbackSwings=12,interval='4h',apexFactor}){
  if(!klines?.length||!swings?.length||!atrByIndex?.length)return null;
  const confirmed=swings.filter(s=>s.confirmed!==false&&s.status!=='provisional'&&s.status!=='discarded'&&s.status!=='replaced').slice(-lookbackSwings);
  const highs=confirmed.filter(s=>s.type==='HIGH'||s.type==='H').map(s=>({index:s.index??s.pivotIndex,price:Number(s.price),raw:s})).filter(s=>finite(s.index)&&finite(s.price));
  const lows=confirmed.filter(s=>s.type==='LOW'||s.type==='L').map(s=>({index:s.index??s.pivotIndex,price:Number(s.price),raw:s})).filter(s=>finite(s.index)&&finite(s.price));
  if(highs.length<3||lows.length<3)return null;

  const upperPts=highs.slice(-4),lowerPts=lows.slice(-4),upper=fitLine(upperPts),lower=fitLine(lowerPts);
  if(!upper||!lower||upper.slope>=0||lower.slope>=0)return null;

  const last=klines.length-1,atr=Number(atrByIndex[last]||0);if(!atr)return null;
  const upperNorm=upper.slope/atr,lowerNorm=lower.slope/atr;
  if(upperNorm>=lowerNorm)return null;

  const startX=Math.max(upperPts[0].index,lowerPts[0].index);
  const endX=Math.min(upperPts.at(-1).index,lowerPts.at(-1).index);
  if(endX<=startX)return null;
  const startGap=upper.valueAt(startX)-lower.valueAt(startX),endGap=upper.valueAt(endX)-lower.valueAt(endX);
  if(startGap<=0||endGap<=0||endGap>=startGap)return null;
  const convergenceScore=Math.round(clamp((1-endGap/startGap)*120,0,100));
  if(convergenceScore<45)return null;

  const denom=upper.slope-lower.slope;if(Math.abs(denom)<1e-12)return null;
  const apexX=(lower.intercept-upper.intercept)/denom,wedgeDuration=Math.max(8,endX-startX),barsToApex=apexX-last;
  const factor=Number(apexFactor)||APEX_FACTOR[interval]||1.5;
  if(!Number.isFinite(apexX)||barsToApex<=0||barsToApex>wedgeDuration*factor)return null;

  const upperTouches=spacedTouches(upperPts,upper,atrByIndex,.35,3),lowerTouches=spacedTouches(lowerPts,lower,atrByIndex,.35,3);
  if(upperTouches.length<3||lowerTouches.length<3)return null;

  const integU=integrity({klines,line:upper,side:'upper',start:startX,end:last,atrByIndex});
  const integL=integrity({klines,line:lower,side:'lower',start:startX,end:last,atrByIndex});
  const lineIntegrityScore=Math.round((integU.score+integL.score)/2),regressionScore=Math.round(((upper.r2+lower.r2)/2)*100);
  if(lineIntegrityScore<45)return null;

  const current=Number(klines[last].close),upperNow=upper.valueAt(last),lowerNow=lower.valueAt(last),prev=klines[last-1],prevUpper=upper.valueAt(last-1),buffer=atr*.15;
  const softInvalidation=lowerNow-atr*.30,hardInvalidation=lowerNow-atr*.60;
  let state='FORMING';
  if(current<hardInvalidation)state='FAILED';
  else if(current>upperNow+buffer&&prev&&Number(prev.close)>prevUpper)state='BREAKOUT_CONFIRMED';
  else if(current>upperNow+buffer)state='BREAKOUT_CANDIDATE';
  else if(current>upperNow-atr*.25)state='PRE_BREAKOUT';
  else if(current<=lowerNow+atr*.20)state='AT_SUPPORT';

  const rsiDiv=bullishDivergence(lows,rsi,atrByIndex),volContr=volumeContraction(klines,startX),marketStructureScore=structureBonus(structure);
  const touchQuality=Math.min(100,(upperTouches.length+lowerTouches.length)*12);
  const geometry=Math.round(clamp(convergenceScore*.35+regressionScore*.20+lineIntegrityScore*.30+touchQuality*.15));
  const structureScore=Math.round(clamp(marketStructureScore*10,0,100));
  const confirmation=Math.round(clamp((rsiDiv?50:0)+(volContr?50:0),0,100));
  const breakoutQuality=state==='BREAKOUT_CONFIRMED'?100:state==='BREAKOUT_CANDIDATE'?65:state==='PRE_BREAKOUT'?45:state==='AT_SUPPORT'?30:state==='FAILED'?0:20;
  let confidence=Math.round(clamp(geometry*.50+structureScore*.10+confirmation*.20+breakoutQuality*.20,0,100));
  if(state==='FAILED')confidence=Math.min(confidence,35);
  if(confidence<55&&state!=='FAILED')return null;

  const breakoutLevel=upperNow,wedgeHeight=startGap;
  const res=(zones?.resistance||zones?.resistances||[]).map(x=>Number(x.center??x.price??x)).filter(x=>finite(x)&&x>breakoutLevel).sort((a,b)=>a-b),targets=[];
  if(res[0])targets.push({price:res[0],type:'STRUCTURE_RESISTANCE'});
  targets.push({price:breakoutLevel+wedgeHeight,type:'MEASURED_MOVE'});

  return{
    pattern:'falling_wedge',confidence,state,
    scores:{geometry,structure:structureScore,confirmation,breakout:breakoutQuality,convergence:convergenceScore,regression:regressionScore,lineIntegrity:lineIntegrityScore,marketStructure:marketStructureScore},
    touchCount:{upper:upperTouches.length,lower:lowerTouches.length},rsiDivergence:rsiDiv,volumeContraction:volContr,
    upperLine:{slope:upper.slope,normalizedSlope:upperNorm,intercept:upper.intercept,r2:upper.r2,startIndex:startX,endIndex:last,startPrice:upper.valueAt(startX),endPrice:upperNow},
    lowerLine:{slope:lower.slope,normalizedSlope:lowerNorm,intercept:lower.intercept,r2:lower.r2,startIndex:startX,endIndex:last,startPrice:lower.valueAt(startX),endPrice:lowerNow},
    apex:{index:apexX,barsFromNow:barsToApex,factor},integrity:{upper:integU,lower:integL},breakoutPrice:breakoutLevel,targets,
    invalidation:hardInvalidation,invalidationLevels:{soft:softInvalidation,hard:hardInvalidation},
    meta:{startGap,endGap,wedgeDuration,atr,commonStartIndex:startX,commonEndIndex:endX}
  };
}

module.exports={APEX_FACTOR,fitLine,spacedTouches,integrity,analyzeFallingWedge};

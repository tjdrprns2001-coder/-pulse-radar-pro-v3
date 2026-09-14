const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const finite=v=>Number.isFinite(Number(v));
const at=(L,i)=>L.intercept+L.slope*i;
const candleTime=c=>c?.time??c?.openTime??c?.open_time??null;

function fitLine(points){
  if(!points||points.length<2)return null;
  const mx=avg(points.map(p=>p.index)),my=avg(points.map(p=>p.price));
  let cov=0,varx=0;
  for(const p of points){cov+=(p.index-mx)*(p.price-my);varx+=(p.index-mx)**2}
  if(!varx)return null;
  const slope=cov/varx,intercept=my-slope*mx;
  const ssTot=points.reduce((s,p)=>s+(p.price-my)**2,0);
  const ssRes=points.reduce((s,p)=>s+(p.price-(slope*p.index+intercept))**2,0);
  const r2=ssTot?clamp(1-ssRes/ssTot,0,1):0;
  return{slope,intercept,r2,valueAt:i=>slope*i+intercept};
}

function normalizeSwings(swings=[]){
  return swings
    .filter(s=>s&&s.status!=='provisional'&&s.status!=='discarded'&&s.status!=='replaced'&&s.confirmed!==false)
    .map(s=>({index:Number(s.index??s.pivotIndex??s.i),price:Number(s.price),type:String(s.type||'').toUpperCase(),confirmedAt:Number(s.confirmedAt??s.index??s.pivotIndex??s.i),raw:s}))
    .filter(s=>finite(s.index)&&finite(s.price)&&finite(s.confirmedAt)&&(s.type==='H'||s.type==='HIGH'||s.type==='L'||s.type==='LOW'))
    .sort((a,b)=>a.confirmedAt-b.confirmedAt||a.index-b.index);
}

function spaced(points,minBars=3){const out=[];for(const p of points){if(!out.length||p.index-out.at(-1).index>=minBars)out.push(p)}return out}

function lineIntegrity({candles,line,side,start,end,atrByIndex,wickTolAtr=.30,strongCloseAtr=.50}){
  let wickBreaches=0,wickDepthAtr=0,bodyCrosses=0,strongCloseBreaches=0,breakConfirmations=0,brokenAt=null,consecutive=0,samples=0;
  for(let i=Math.max(0,start);i<=Math.min(end,candles.length-1);i++){
    const k=candles[i],atr=Number(atrByIndex[i]||k?.atr||0);if(!atr)continue;samples++;
    const y=at(line,i),wickExcess=side==='support'?y-Number(k.low):Number(k.high)-y;
    if(wickExcess>atr*wickTolAtr){wickBreaches++;wickDepthAtr+=(wickExcess-atr*wickTolAtr)/atr}
    const bodyLo=Math.min(Number(k.open),Number(k.close)),bodyHi=Math.max(Number(k.open),Number(k.close));if(y>bodyLo&&y<bodyHi)bodyCrosses++;
    const strong=side==='support'?Number(k.close)<y-atr*strongCloseAtr:Number(k.close)>y+atr*strongCloseAtr;
    if(strong){strongCloseBreaches++;consecutive++;if(consecutive===2){breakConfirmations++;brokenAt=i}}else consecutive=0;
  }
  const penalty=Math.min(35,wickBreaches*3+wickDepthAtr*5)+Math.min(20,bodyCrosses*2)+Math.min(55,strongCloseBreaches*8+breakConfirmations*20);
  return{score:Math.round(clamp(100-penalty)),wickBreaches,wickDepthAtr:Number(wickDepthAtr.toFixed(3)),bodyCrosses,strongCloseBreaches,breakConfirmations,brokenAt,samples};
}

function candidateLines({candles,swings,atrByIndex,side,asOf,recentPoints=18,minAnchorGap=8,minSpanBars=20,minTouches=3,touchToleranceAtr=.30,minTouchSpacing=3,maxBarsSinceTouch=60}){
  const wantHigh=side==='resistance';
  const pts=normalizeSwings(swings).filter(s=>s.confirmedAt<=asOf&&(wantHigh?(s.type==='H'||s.type==='HIGH'):(s.type==='L'||s.type==='LOW'))).slice(-recentPoints);
  const out=[];if(pts.length<minTouches)return out;
  for(let a=0;a<pts.length-1;a++)for(let b=a+1;b<pts.length;b++){
    const A=pts[a],B=pts[b];if(B.index-A.index<minAnchorGap)continue;
    const raw={slope:(B.price-A.price)/(B.index-A.index),intercept:A.price-((B.price-A.price)/(B.index-A.index))*A.index};
    let touches=spaced(pts.filter(p=>p.index>=A.index&&Math.abs(p.price-at(raw,p.index))<=Math.max(Math.abs(p.price)*.0015,Number(atrByIndex[p.index]||atrByIndex[asOf]||0)*touchToleranceAtr)),minTouchSpacing);
    if(touches.length<minTouches)continue;
    let L=fitLine(touches);if(!L)continue;
    touches=spaced(pts.filter(p=>p.index>=A.index&&Math.abs(p.price-at(L,p.index))<=Math.max(Math.abs(p.price)*.0015,Number(atrByIndex[p.index]||atrByIndex[asOf]||0)*touchToleranceAtr)),minTouchSpacing);
    if(touches.length<minTouches)continue;L=fitLine(touches)||L;
    const first=touches[0].index,lastTouch=touches.at(-1).index,spanBars=lastTouch-first;
    if(spanBars<minSpanBars||asOf-lastTouch>maxBarsSinceTouch)continue;
    const integ=lineIntegrity({candles,line:L,side,start:first,end:asOf,atrByIndex});if(integ.breakConfirmations>0)continue;
    const atrNow=Number(atrByIndex[asOf]||candles[asOf]?.atr||0)||1,currentLinePrice=at(L,asOf),close=Number(candles[asOf]?.close),distanceAtr=(close-currentLinePrice)/atrNow;
    const normalizedSlope=L.slope/atrNow,regressionScore=Math.round((L.r2||0)*100),touchScore=Math.min(25,touches.length*7),fitScore=regressionScore*.20,integrityScore=integ.score*.25,recencyScore=Math.max(0,12-(asOf-lastTouch)*.25),spanScore=Math.min(18,spanBars*.28),distanceScore=Math.max(0,8-Math.abs(distanceAtr)*1.2);
    const totalScore=Math.round(clamp(touchScore+fitScore+integrityScore+recencyScore+spanScore+distanceScore));
    let state=Math.abs(distanceAtr)<=.35?'retest':totalScore<60?'candidate':'active';
    out.push({id:`${side}-${first}-${lastTouch}`,side,state,slope:L.slope,normalizedSlope,intercept:L.intercept,r2:L.r2,regressionScore,lineIntegrityScore:integ.score,integrity:integ,totalScore,
      anchorA:{barIndex:first,price:at(L,first)},anchorB:{barIndex:lastTouch,price:at(L,lastTouch)},touchCount:touches.length,touchBars:touches.map(x=>x.index),touchPrices:touches.map(x=>x.price),touchConfirmedAt:touches.map(x=>x.confirmedAt),spanBars,lastTouchBarsAgo:asOf-lastTouch,currentLinePrice,currentDistanceAtr:distanceAtr,currentDistancePct:currentLinePrice?(close/currentLinePrice-1)*100:null,availableAt:Math.max(...touches.map(x=>x.confirmedAt)),brokenAt:null});
  }
  return out.sort((a,b)=>b.totalScore-a.totalScore||b.spanBars-a.spanBars||a.lastTouchBarsAgo-b.lastTouchBarsAgo);
}

function dedupe(lines,atrNow,asOf){
  const kept=[],clusters=[],av=atrNow||1;
  for(const L of lines){let idx=-1;for(let i=0;i<kept.length;i++){const K=kept[i],bars=Math.max(L.spanBars,K.spanBars,8),slopeGap=Math.abs((L.slope-K.slope)*bars)/av,endGap=Math.abs(at(L,asOf)-at(K,asOf))/av;if(slopeGap<.18&&endGap<.35){idx=i;break}}if(idx<0){kept.push(L);clusters.push({primaryId:L.id,members:[L.id]})}else clusters[idx].members.push(L.id)}
  return{kept,clusters,rawCount:lines.length,uniqueCount:kept.length};
}

function pairDiagnostics(support,resistance,atrNow,asOf){
  if(!support||!resistance)return null;const denom=resistance.slope-support.slope,slopeGapAtr=Math.abs(resistance.normalizedSlope-support.normalizedSlope),parallelScore=Math.round(clamp(100-slopeGapAtr*180));
  let apexIndex=null,barsToApex=null;if(Math.abs(denom)>1e-12){apexIndex=(support.intercept-resistance.intercept)/denom;barsToApex=apexIndex-asOf}
  const widthNow=resistance.currentLinePrice-support.currentLinePrice,start=Math.max(support.anchorA.barIndex,resistance.anchorA.barIndex),widthStart=at(resistance,start)-at(support,start),convergencePct=widthStart>0?clamp((1-widthNow/widthStart)*100,-100,100):null,channelCandidate=parallelScore>=78&&widthNow>0;
  return{parallelScore,channelCandidate,apexIndex,barsToApex,widthNowAtr:atrNow?widthNow/atrNow:null,widthStartAtr:atrNow?widthStart/atrNow:null,convergencePct:convergencePct==null?null:Number(convergencePct.toFixed(2))};
}

function buildTrendlines({candles,swings,bias=null,interval='1h',source='canonical_swing_regression_v2_2',asOf}){
  if(!Array.isArray(candles)||candles.length<20)return{source,support:null,resistance:null,secondary:{support:[],resistance:[]},pair:null,dedup:{support:{raw:0,unique:0},resistance:{raw:0,unique:0}}};
  const end=Number.isInteger(asOf)?Math.min(asOf,candles.length-1):candles.length-1,atrByIndex=candles.map(c=>Number(c?.atr||0));
  if(!atrByIndex[end]){for(let i=1;i<candles.length;i++){const prev=Number(candles[i-1].close),h=Number(candles[i].high),l=Number(candles[i].low),tr=Math.max(h-l,Math.abs(h-prev),Math.abs(l-prev));atrByIndex[i]=i===1?tr:((atrByIndex[i-1]||tr)*13+tr)/14}}
  const atrNow=Number(atrByIndex[end]||0)||1,minSpanByTf={'15m':28,'1h':24,'4h':20,'1d':14},maxAgeByTf={'15m':36,'1h':42,'4h':48,'1d':60},maxDistanceByTf={'15m':3.5,'1h':4,'4h':4.5,'1d':5};
  const cfg={minSpanBars:minSpanByTf[interval]||20,maxBarsSinceTouch:maxAgeByTf[interval]||48};
  const sc=candidateLines({candles,swings,atrByIndex,side:'support',asOf:end,...cfg}),rc=candidateLines({candles,swings,atrByIndex,side:'resistance',asOf:end,...cfg});
  const sd=dedupe(sc,atrNow,end),rd=dedupe(rc,atrNow,end),maxDist=maxDistanceByTf[interval]||4.5;
  const decorate=x=>x?{...x,source,anchorA:{...x.anchorA,time:candleTime(candles[x.anchorA.barIndex])},anchorB:{...x.anchorB,time:candleTime(candles[x.anchorB.barIndex])},touchPoints:x.touchBars.map((barIndex,i)=>({barIndex,time:candleTime(candles[barIndex]),price:x.touchPrices?.[i]??at(x,barIndex)})).filter(p=>p.time!=null),lastTouchTime:candleTime(candles[x.touchBars.at(-1)]),htfAlignment:'unknown'}:null;
  const choosePrimary=arr=>arr.filter(x=>Math.abs(x.currentDistanceAtr)<=maxDist).sort((a,b)=>(b.totalScore-a.totalScore)||(a.lastTouchBarsAgo-b.lastTouchBarsAgo)||(b.spanBars-a.spanBars))[0]||null;
  const sRaw=choosePrimary(sd.kept),rRaw=choosePrimary(rd.kept),support=decorate(sRaw),resistance=decorate(rRaw),pair=pairDiagnostics(support,resistance,atrNow,end);
  return{source,support,resistance,secondary:{support:sd.kept.filter(x=>x!==sRaw&&Math.abs(x.currentDistanceAtr)<=maxDist).slice(0,2).map(decorate),resistance:rd.kept.filter(x=>x!==rRaw&&Math.abs(x.currentDistanceAtr)<=maxDist).slice(0,2).map(decorate)},pair,dedup:{support:{raw:sd.rawCount,unique:sd.uniqueCount},resistance:{raw:rd.rawCount,unique:rd.uniqueCount}},parameters:{recentConfirmedPoints:18,minAnchorGapBars:8,minSpanBars:cfg.minSpanBars,minTouches:3,minTouchSpacingBars:3,touchToleranceAtr:.30,wickBreachAtr:.30,strongCloseBreachAtr:.50,breakConfirmBars:2,maxBarsSinceLastTouch:cfg.maxBarsSinceTouch,maxCurrentDistanceAtr:maxDist,regression:true,atrNormalizedSlope:true,timeAnchors:true}};
}

module.exports={fitLine,lineIntegrity,candidateLines,dedupe,pairDiagnostics,buildTrendlines};

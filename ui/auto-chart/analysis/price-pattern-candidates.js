(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulsePricePatternCandidates=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const VERSION='PRICE_PATTERN_CANDIDATES_v1';
function detect(rows,{asOf,maxBars=140}={}){
 const seen=new Set();
 const a=(Array.isArray(rows)?rows:[]).filter(c=>c&&c.closed===true&&Number.isFinite(Number(c.closeTime))&&Number(c.closeTime)<=Number(asOf)&&
  [c.open,c.high,c.low,c.close].every(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>0))
  .sort((x,y)=>Number(x.openTime)-Number(y.openTime)).filter(c=>{if(seen.has(Number(c.openTime)))return false;seen.add(Number(c.openTime));return true}).slice(-maxBars);
 const base={version:VERSION,shadowOnly:true,source:'CLOSED_OHLC_ONLY',asOf:Number(asOf),closedBars:a.length,
  candlesFutureExcluded:true,confirmedBreakout:false,notTradingAdvice:true};
 if(a.length<38)return{...base,status:'INSUFFICIENT_HISTORY',candidates:[]};
 const h=a.map(x=>Number(x.high)),l=a.map(x=>Number(x.low)),c=a.map(x=>Number(x.close));
 const pivH=[],pivL=[];
 // A pivot is known only after two CLOSED candles to its right.
 for(let i=2;i<a.length-2;i++){
  if(h[i]>h[i-1]&&h[i]>=h[i-2]&&h[i]>h[i+1]&&h[i]>=h[i+2])pivH.push({i,price:h[i],knownAt:a[i+2].closeTime});
  if(l[i]<l[i-1]&&l[i]<=l[i-2]&&l[i]<l[i+1]&&l[i]<=l[i+2])pivL.push({i,price:l[i],knownAt:a[i+2].closeTime});
 }
 const out=[],last=c.at(-1),tol=0.012;
 for(const [type,piv,opposite] of [['DOUBLE_TOP_CANDIDATE',pivH,pivL],['DOUBLE_BOTTOM_CANDIDATE',pivL,pivH]]){
  const pair=piv.slice(-8);let best=null;
  for(let j=0;j<pair.length;j++)for(let k=j+1;k<pair.length;k++){
   const x=pair[j],y=pair[k],separation=y.i-x.i;
   if(separation<5||separation>65||a.length-1-y.i>24)continue;
   if(Math.abs(x.price-y.price)/Math.max(x.price,y.price)>tol)continue;
   const middles=opposite.filter(p=>p.i>x.i&&p.i<y.i);
   if(!middles.length)continue;
   const neckline=type==='DOUBLE_TOP_CANDIDATE'?Math.min(...middles.map(q=>q.price)):Math.max(...middles.map(q=>q.price));
   const height=type==='DOUBLE_TOP_CANDIDATE'?((x.price+y.price)/2-neckline):(neckline-(x.price+y.price)/2);
   if(height<=0||height/neckline<0.008)continue;
   const confirmed=type==='DOUBLE_TOP_CANDIDATE'?last<neckline:last>neckline;
   const inv=type==='DOUBLE_TOP_CANDIDATE'?Math.max(x.price,y.price):Math.min(x.price,y.price);
   const candidate={kind:type,label:type==='DOUBLE_TOP_CANDIDATE'?'더블탑 후보':'더블바텀 후보',
    status:confirmed?'NECKLINE_BROKEN':'WAIT_NECKLINE',confirmedBreakout:confirmed,
    knownAt:y.knownAt,ageBars:a.length-1-y.i,pivots:[x,y],neckline,invalidation:inv,
    evidence:['확정된 두 스윙의 유사 가격','중간 반대 스윙으로 산출한 넥라인',confirmed?'종가 넥라인 돌파':'넥라인 종가 돌파 미확인'],
    contradictions:confirmed?['돌파 후 재테스트 지지는 아직 확인되지 않음']:['넥라인 돌파가 아직 확인되지 않음']};
   if(!best||y.i>best.pivots[1].i)best=candidate;
  }
  if(best)out.push(best);
 }
 // Triangle candidate: converging confirmed swing extrema with at least two peaks and troughs.
 const highs=pivH.slice(-4),lows=pivL.slice(-4);
 if(highs.length>=2&&lows.length>=2){
  const ph=highs.at(-2),qh=highs.at(-1),pl=lows.at(-2),ql=lows.at(-1);
  const slopeH=(qh.price-ph.price)/(qh.i-ph.i),slopeL=(ql.price-pl.price)/(ql.i-pl.i);
  const projectH=qh.price+slopeH*(a.length-1-qh.i),projectL=ql.price+slopeL*(a.length-1-ql.i);
  const baselineH=ph.price+slopeH*(a.length-1-ph.i),baselineL=pl.price+slopeL*(a.length-1-pl.i);
  const widthOld=ph.price-pl.price,widthNew=projectH-projectL;
  if(Number.isFinite(widthNew)&&widthOld>0&&widthNew>0&&widthNew<widthOld*.85&&
    slopeH<0&&slopeL>0&&last<=projectH&&last>=projectL&&
    Math.max(qh.i,ql.i)>a.length-28){
   out.push({kind:'SYMMETRICAL_TRIANGLE_CANDIDATE',label:'수렴 삼각형 후보',status:'WAIT_BREAKOUT',confirmedBreakout:false,
    knownAt:Math.max(qh.knownAt,ql.knownAt),ageBars:a.length-1-Math.max(qh.i,ql.i),
    upper:projectH,lower:projectL,invalidation:projectL,
    evidence:['확정된 고점 하향','확정된 저점 상향','추세선 간격 축소'],
    contradictions:['수렴은 방향을 확정하지 않음','돌파와 거래량 확인 필요']});
  }
 }
 return{...base,status:'READY',candidates:out.slice(0,3),confirmedBreakout:out.some(x=>x.confirmedBreakout),
  disclaimer:'수학적 가격 패턴 후보일 뿐 매집/세력 또는 매매 신호가 아닙니다'};
}
return{VERSION,detect};
});
'use strict';

const VERSION='ENTRY_CONFIRMATION_v1';
const TF_ORDER=['1d','4h','1h'];

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
function avg(a=[]){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function rows(raw=[]){
  const now=Date.now();
  return(Array.isArray(raw)?raw:[]).filter(Array.isArray).filter(r=>n(r[2])!=null&&n(r[3])!=null&&n(r[4])!=null&&(n(r[6])==null||n(r[6])<now)).map((r,i)=>({
    index:i,time:n(r[0])??i,open:n(r[1])??n(r[4]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5])??0,closeTime:n(r[6])??n(r[0])??i
  }));
}
function sma(v,p){const o=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=p)s-=v[i-p];if(i>=p-1)o[i]=s/p}return o}
function atr(c,p=14){const tr=c.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?c[i-1].close:x.close)),Math.abs(x.low-(i?c[i-1].close:x.close)))),o=Array(c.length).fill(null);let s=0;for(let i=0;i<tr.length;i++){s+=tr[i];if(i>=p)s-=tr[i-p];if(i>=p-1)o[i]=s/p}return o}
function median(a=[]){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function pivots(c,left=2,right=2){
  const out=[];for(let i=left;i<c.length-right;i++){const w=c.slice(i-left,i+right+1),x=c[i];if(w.every((z,j)=>j===left||x.high>=z.high))out.push({i,type:'H',price:x.high,time:x.time});if(w.every((z,j)=>j===left||x.low<=z.low))out.push({i,type:'L',price:x.low,time:x.time})}
  return out.sort((a,b)=>a.i-b.i);
}
function higherTrend(frames={}){
  let score=0,details=[];for(const tf of ['1d','4h']){const c=rows(frames[tf]);if(c.length<65)continue;const close=c.map(x=>x.close),m20=sma(close,20),m60=sma(close,60),i=c.length-1,bull=close[i]>m20[i]&&m20[i]>m60[i]&&m20[i]>m20[Math.max(0,i-3)],bear=close[i]<m20[i]&&m20[i]<m60[i];if(bull){score++;details.push(tf.toUpperCase()+' 상승')}else if(bear){score--;details.push(tf.toUpperCase()+' 하락')}else details.push(tf.toUpperCase()+' 중립')}
  return{bias:score>0?'bullish':score<0?'bearish':'neutral',score,details};
}
function nearestResistance(c,entry){
  if(!c.length||!(entry>0))return null;const ps=pivots(c).filter(p=>p.type==='H'&&p.price>entry).slice(-12);if(!ps.length)return null;return ps.sort((a,b)=>a.price-b.price)[0];
}
function volumeContext(c,entryTiming){
  if(c.length<25)return{available:false};
  const vols=c.map(x=>x.volume),base=median(vols.slice(-21,-1)),last=c.at(-1).volume,ratio=base>0?last/base:null;
  const recent=c.slice(-6),prior=c.slice(-12,-6),recentAvg=avg(recent.map(x=>x.volume)),priorAvg=avg(prior.map(x=>x.volume)),pullbackVolumeContracted=priorAvg>0?recentAvg<priorAvg*.92:null;
  const confirmed=ratio!=null&&ratio>=1.15;
  return{available:true,ratio,pullbackVolumeContracted,confirmed,entryTimingStage:entryTiming?.stage||null};
}
function setupType(strategy={}){
  const t=strategy.entryTiming?.stage;
  if(t==='RETEST_SUPPORT_HOLD')return'돌파 후 리테스트';
  if(t==='BREAKOUT_HOLD'||t==='WAIT_PULLBACK_RETEST')return'돌파 후 확인';
  if(t==='LATE_ENTRY_WARNING')return'돌파 후 늦은 진입';
  if(t==='FAILED_RETEST_RESISTANCE'||t==='RETEST_RESISTANCE_CHECK')return'돌파 실패/저항 전환 확인';
  const tracks=Array.isArray(strategy.activeTracks)?strategy.activeTracks:[];
  if(tracks.some(x=>x.key==='LIQUIDITY_RECLAIM'&&x.active))return'유동성 스윕 반전';
  if(tracks.some(x=>x.key==='MA_RETEST'&&x.active))return'이평선 눌림';
  if(strategy.reentryEligible)return'재상승·2차 파동';
  if(tracks.some(x=>x.key==='BOOK_PATTERN'&&x.active))return'반전 패턴 확인';
  if(strategy.patternEligible)return'패턴 확인';
  return'관찰';
}
function triggerText(strategy={},vol={}){
  const t=strategy.entryTiming;
  if(t?.stage==='RETEST_SUPPORT_HOLD')return'리테스트 저점 유지 후 단기 고점/반등 고점 재돌파';
  if(t?.stage==='BREAKOUT_HOLD')return'돌파선 위 종가 유지 + 후속 봉 고점 재돌파';
  if(t?.stage==='WAIT_PULLBACK_RETEST')return'되돌림 후 돌파선 지지 또는 후속 고점 돌파 확인';
  if(t?.stage==='LATE_ENTRY_WARNING')return'추격 금지 · 돌파선/이평 되돌림 후 새 트리거 대기';
  if(t?.stage==='FAILED_RETEST_RESISTANCE')return'현재 신규 롱 트리거 없음 · 돌파선 재회복 필요';
  const tracks=Array.isArray(strategy.activeTracks)?strategy.activeTracks:[];
  if(tracks.some(x=>x.key==='LIQUIDITY_RECLAIM'&&x.active))return'스윕 레벨 회복 + 후속 테스트 유지 + 단기 고점 돌파';
  if(tracks.some(x=>x.key==='MA_RETEST'&&x.active))return'20/60 이평 지지 반응 후 눌림 고점 돌파';
  if(strategy.reentryEligible)return'조정 고점 또는 단기 하락추세선 돌파';
  return vol.confirmed?'가격 구조 확인 + 거래량 확장':'구조 확인 후 거래량/후속 봉 확인';
}
function analyze({frames={},strategyCycle=null,bookManual=null,structure='neutral'}={}){
  const strategy=strategyCycle||{},timing=strategy.entryTiming||null,c1d=rows(frames['1d']),c4h=rows(frames['4h']),c1h=rows(frames['1h']),base=c4h.length?c4h:c1h.length?c1h:c1d;
  if(!base.length)return{version:VERSION,available:false,grade:'D',score:0,action:'판단 보류',reasons:['완료봉 데이터 부족']};
  const entry=base.at(-1).close,A=atr(base),av=A.at(-1),htf=higherTrend(frames),vol=volumeContext(c1h.length?c1h:base,timing),risk=bookManual?.riskPlan||strategy.bookManual?.riskPlan||null;
  const invalidation=n(risk?.invalidation)??(timing?.level&&av?Number(timing.level)-av*.35:null);
  const structuralRisk=invalidation!=null&&entry>invalidation?entry-invalidation:null;
  const resCandidates=[nearestResistance(c4h,entry),nearestResistance(c1d,entry)].filter(Boolean).sort((a,b)=>a.price-b.price),nextResistance=resCandidates[0]?.price??null;
  let target=n(risk?.targets?.[0]);if(nextResistance!=null&&(target==null||nextResistance<target))target=nextResistance;
  const spaceR=structuralRisk>0&&target!=null&&target>entry?(target-entry)/structuralRisk:null;
  const positionGood=Boolean(timing?.stage==='RETEST_SUPPORT_HOLD'||strategy.activeTracks?.some(x=>['MA_RETEST','LIQUIDITY_RECLAIM'].includes(x.key)&&x.active)||strategy.bookManual?.rankable?.some(x=>x.active));
  const triggerConfirmed=Boolean(timing?.stage==='RETEST_SUPPORT_HOLD'||timing?.stage==='BREAKOUT_HOLD'||strategy.reentryEligible||strategy.patternEligible);
  const fakeoutBlocked=Boolean(strategy.fakeout?.longBlocked),fakeoutRecovered=Boolean(strategy.fakeout?.recovered),late=timing?.stage==='LATE_ENTRY_WARNING',failed=timing?.stage==='FAILED_RETEST_RESISTANCE'||timing?.stage==='RETEST_RESISTANCE_CHECK'||fakeoutBlocked;
  const middleRisk=!positionGood&&!triggerConfirmed;
  let score=0;const reasons=[],warnings=[];
  if(htf.bias==='bullish'){score+=20;reasons.push('상위 추세 상승')}else if(htf.bias==='bearish'){score-=25;warnings.push('상위 추세와 롱 방향 불일치')}else score+=6;
  if(positionGood){score+=20;reasons.push('핵심 위치/역할전환 구간 반응')}else warnings.push('핵심 위치 확인 부족');
  if(triggerConfirmed){score+=20;reasons.push('진입 트리거 또는 구조 확인')}else warnings.push('후속 트리거 확인 대기');
  if(invalidation!=null&&invalidation<entry){score+=15;reasons.push('무효화 가격 명확')}else warnings.push('무효화 가격 불명확');
  if(spaceR!=null&&spaceR>=1.5){score+=20;reasons.push('다음 현실 저항까지 '+spaceR.toFixed(2)+'R 공간')}else if(spaceR!=null&&spaceR>=1){score+=10;warnings.push('목표 공간 '+spaceR.toFixed(2)+'R · A급 기준 미달')}else if(spaceR!=null){score-=18;warnings.push('바로 위 저항까지 '+spaceR.toFixed(2)+'R · 손익비 불량')}else warnings.push('다음 저항/목표 공간 계산 부족');
  if(vol.confirmed){score+=5;reasons.push('상대 거래량 확인')}else if(vol.pullbackVolumeContracted){score+=4;reasons.push('되돌림 거래량 감소')};
  if(late){score-=22;warnings.push('돌파 후 과이격 · 늦은 추격')}if(fakeoutBlocked){score-=35;warnings.push('가짜 돌파 확정 · 돌파선 재회복 전 신규 롱 회피')}else if(failed){score-=30;warnings.push('돌파선 지지 실패/저항 전환 위험')}if(fakeoutRecovered){score+=5;reasons.push('가짜 돌파 후 돌파선 재회복')}if(middleRisk)score-=6;
  score=Math.round(clamp(score));
  let grade=score>=80?'A':score>=65?'B':score>=45?'C':'D';
  if(late&&grade==='A')grade='B';if(failed||fakeoutBlocked)grade='D';if(htf.bias==='bearish'&&grade==='A')grade='B';
  const action=fakeoutBlocked?'신규 롱 회피 · 돌파선 재회복 대기':grade==='A'?'확인 진입 후보':grade==='B'?'소액/추가 확인':grade==='C'?'관찰 우선 · 신규 진입 보류':'진입 회피';
  const setup=fakeoutBlocked?'가짜 돌파 롱 회피':setupType(strategy),trigger=fakeoutBlocked?'돌파선 위 종가 재회복 + 후속 지지 확인 전까지 신규 롱 없음':triggerText(strategy,vol);
  let cancel=fakeoutBlocked?'돌파선 재회복 실패가 지속되면 롱 시나리오 취소 유지':'핵심 구조 또는 무효화 가격 이탈 시 취소';
  if(timing?.stage==='RETEST_SUPPORT_HOLD')cancel='리테스트 저점 이탈 또는 돌파선 아래 종가 안착 시 취소';
  else if(timing?.stage==='BREAKOUT_HOLD'||timing?.stage==='WAIT_PULLBACK_RETEST')cancel='후속 봉이 돌파선 아래로 깊게 재진입하면 취소';
  else if(setup==='유동성 스윕 반전')cancel='스윕 극단값 아래 종가 유지 또는 후속 구조전환 실패 시 취소';
  else if(setup==='이평선 눌림')cancel='스윙 저점과 중기 이평이 함께 이탈하면 취소';
  return{version:VERSION,available:true,grade,score,action,setup,higherTimeframe:htf,entry,trigger,invalidation,target,nextResistance,spaceR,volume:vol,lateEntry:late,failedRetest:failed,fakeoutBlocked,fakeoutRecovered,positionGood,triggerConfirmed,reasons:reasons.slice(0,6),warnings:warnings.slice(0,6),cancelCondition:cancel};
}
module.exports={VERSION,rows,sma,atr,pivots,higherTrend,nearestResistance,volumeContext,setupType,triggerText,analyze};

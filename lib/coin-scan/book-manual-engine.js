'use strict';

const Registry=require('./book-strategy-registry.js');
const RiskCalc=require('../signal-quality/risk-calculator.js');

const VERSION='BOOK_MANUAL_ENGINE_v1';
const TF_ORDER=['1d','4h','1h'];

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
function avg(a=[]){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function rows(raw=[]){
  const now=Date.now();
  return (Array.isArray(raw)?raw:[]).filter(Array.isArray).filter(r=>n(r[2])!=null&&n(r[3])!=null&&n(r[4])!=null&&(n(r[6])==null||n(r[6])<now)).map((r,i)=>({
    index:i,time:n(r[0])??i,open:n(r[1])??n(r[4]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5])??0,closeTime:n(r[6])??n(r[0])??i
  }));
}
function sma(v,p){const out=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=p)s-=v[i-p];if(i>=p-1)out[i]=s/p}return out}
function ema(v,p){const out=Array(v.length).fill(null),k=2/(p+1);let e=null;for(let i=0;i<v.length;i++){e=e==null?v[i]:v[i]*k+e*(1-k);out[i]=e}return out}
function stdev(v,p){const o=Array(v.length).fill(null);for(let i=p-1;i<v.length;i++){const w=v.slice(i-p+1,i+1),m=avg(w);o[i]=Math.sqrt(avg(w.map(x=>(x-m)*(x-m))))}return o}
function atr(c,p=14){const tr=c.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?c[i-1].close:x.close)),Math.abs(x.low-(i?c[i-1].close:x.close)))),o=Array(c.length).fill(null);let s=0;for(let i=0;i<tr.length;i++){s+=tr[i];if(i>=p)s-=tr[i-p];if(i>=p-1)o[i]=s/p}return o}
function rvol(c,p=20){if(c.length<p+1)return null;const base=avg(c.slice(-p-1,-1).map(x=>x.volume));return base>0?c.at(-1).volume/base:null}
function pivots(c,left=2,right=2){
  const out=[];for(let i=left;i<c.length-right;i++){const w=c.slice(i-left,i+right+1),x=c[i];if(w.every((z,j)=>j===left||x.high>=z.high))out.push({i,type:'H',price:x.high,time:x.time});if(w.every((z,j)=>j===left||x.low<=z.low))out.push({i,type:'L',price:x.low,time:x.time})}
  out.sort((a,b)=>a.i-b.i);const clean=[];for(const p of out){const q=clean.at(-1);if(q&&q.type===p.type){if((p.type==='H'&&p.price>=q.price)||(p.type==='L'&&p.price<=q.price))clean[clean.length-1]=p}else clean.push(p)}return clean
}
function tech(id,active=false,score=0,tf='',stage='NONE',reasons=[],meta={},dataStatus='ok'){
  const def=Registry.get(id)||{id,label:id,mode:'evidence',category:'기타',sources:[]};
  return{id,label:def.label,category:def.category,mode:def.mode,active:Boolean(active),score:Math.round(clamp(score)),tf,stage,reasons:reasons.filter(Boolean).slice(0,6),meta,dataStatus,sources:def.sources||[]}
}
function obvAdVwap(c,tf){
  if(c.length<20)return[
    tech('OBV',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient'),
    tech('AD_LINE',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient'),
    tech('VWAP',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient')
  ];
  let obv=0,ad=0,pv=0,vol=0;const obvSeries=[],adSeries=[],vwapSeries=[];
  for(let i=0;i<c.length;i++){const x=c[i];if(i)obv+=x.close>c[i-1].close?x.volume:x.close<c[i-1].close?-x.volume:0;const den=x.high-x.low,clv=den?((x.close-x.low)-(x.high-x.close))/den:0;ad+=clv*x.volume;const tp=(x.high+x.low+x.close)/3;pv+=tp*x.volume;vol+=x.volume;obvSeries.push(obv);adSeries.push(ad);vwapSeries.push(vol?pv/vol:null)}
  const i=c.length-1,look=Math.max(1,i-10),priceUp=c[i].close>c[look].close,obvUp=obvSeries[i]>obvSeries[look],adUp=adSeries[i]>adSeries[look],vw=vwapSeries[i],vwPrev=vwapSeries[Math.max(0,i-3)],vwapRising=vw!=null&&vwPrev!=null&&vw>vwPrev,above=vw!=null&&c[i].close>vw;
  const obvDiv=priceUp&&!obvUp?'BEARISH_DIVERGENCE':!priceUp&&obvUp?'BULLISH_DIVERGENCE':'CONFIRM';
  return[
    tech('OBV',obvUp,obvDiv==='BULLISH_DIVERGENCE'?78:obvUp?62:35,tf,obvDiv,[obvDiv==='BULLISH_DIVERGENCE'?'가격 약세 대비 OBV 개선':obvUp?'OBV 10봉 방향 상승':'OBV 확인 부족'],{value:obv,delta10:obv-obvSeries[look]}),
    tech('AD_LINE',adUp,adUp?60:32,tf,adUp?'ACCUMULATION_BIAS':'NEUTRAL',[adUp?'A/D 10봉 방향 상승':'A/D 상승 확인 부족'],{value:ad,delta10:ad-adSeries[look]}),
    tech('VWAP',above&&vwapRising,above&&vwapRising?70:above?58:34,tf,above&&vwapRising?'ABOVE_RISING_VWAP':above?'ABOVE_VWAP':'BELOW_VWAP',[above?'가격이 VWAP 위':'가격이 VWAP 아래',vwapRising?'VWAP 상승':'VWAP 상승 확인 부족'],{vwap:vw,proxy:'누적 OHLCV VWAP · 24/7 crypto에서는 세션 경계 없는 근사'})
  ];
}
function volatility(c,tf){
  if(c.length<30)return[tech('BOLLINGER',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient'),tech('KELTNER',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient')];
  const close=c.map(x=>x.close),m20=sma(close,20),sd=stdev(close,20),A=atr(c),i=c.length-1;const upper=m20[i]+2*sd[i],lower=m20[i]-2*sd[i],kcU=m20[i]+1.5*A[i],kcL=m20[i]-1.5*A[i],squeeze=upper<kcU&&lower>kcL;const bandWidth=m20[i]?((upper-lower)/m20[i])*100:null;
  return[
    tech('BOLLINGER',squeeze,squeeze?64:35,tf,squeeze?'SQUEEZE':'NORMAL',[squeeze?'볼린저 수축 · 방향은 구조 확인 필요':'볼린저 수축 없음'],{upper,lower,mid:m20[i],bandWidth,rankingWeight:0}),
    tech('KELTNER',squeeze,squeeze?62:35,tf,squeeze?'BB_INSIDE_KC':'NORMAL',[squeeze?'볼린저가 켈트너 내부 · 변동성 확장 대기':'켈트너 압축 확인 없음'],{upper:kcU,lower:kcL,mid:m20[i],rankingWeight:0})
  ];
}
function cciAdx(c,tf){
  if(c.length<30)return[tech('CCI',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient'),tech('ADX',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient')];
  const tp=c.map(x=>(x.high+x.low+x.close)/3),ma=sma(tp,20),i=c.length-1,w=tp.slice(-20),mean=ma[i],dev=avg(w.map(x=>Math.abs(x-mean)))||1e-9,cci=(tp[i]-mean)/(.015*dev);
  const tr=[],plus=[],minus=[];for(let j=0;j<c.length;j++){if(!j){tr.push(c[j].high-c[j].low);plus.push(0);minus.push(0);continue}const up=c[j].high-c[j-1].high,dn=c[j-1].low-c[j].low;plus.push(up>dn&&up>0?up:0);minus.push(dn>up&&dn>0?dn:0);tr.push(Math.max(c[j].high-c[j].low,Math.abs(c[j].high-c[j-1].close),Math.abs(c[j].low-c[j-1].close)))}
  const sumLast=(a,p)=>a.slice(-p).reduce((s,v)=>s+v,0),trs=sumLast(tr,14)||1,pdi=sumLast(plus,14)/trs*100,mdi=sumLast(minus,14)/trs*100,dx=Math.abs(pdi-mdi)/Math.max(pdi+mdi,1e-9)*100,trend=pdi>mdi?'BULL':'BEAR';
  return[
    tech('CCI',cci>0,Math.min(72,45+Math.abs(cci)/8),tf,cci>100?'POSITIVE_MOMENTUM':cci<-100?'NEGATIVE_EXTREME':'NEUTRAL',['CCI '+cci.toFixed(1)],{cci}),
    tech('ADX',dx>=20&&trend==='BULL',dx>=25&&trend==='BULL'?72:dx>=20?58:35,tf,dx>=25?'TRENDING':dx>=20?'BUILDING':'WEAK',['ADX proxy '+dx.toFixed(1),trend==='BULL'?'상승 방향 우세':'하락 방향 우세'],{adxProxy:dx,pdi,mdi,note:'단순 14봉 합계 기반 자동화 근사'})
  ];
}
function fibonacci(c,tf){
  const ps=pivots(c).slice(-8);if(ps.length<3)return tech('FIBONACCI',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient');
  let low=null,high=null;
  for(let i=ps.length-2;i>=0;i--){if(ps[i].type==='L'){const h=ps.slice(i+1).find(x=>x.type==='H'&&x.price>ps[i].price);if(h){low=ps[i];high=h;break}}}
  if(!low||!high)return tech('FIBONACCI',false,0,tf,'NO_UP_SWING');
  const move=high.price-low.price,last=c.at(-1).close,levels={r382:high.price-move*.382,r50:high.price-move*.5,r618:high.price-move*.618,e1618:high.price+move*.618,e200:high.price+move,e2618:high.price+move*1.618};const zoneLow=Math.min(levels.r382,levels.r618),zoneHigh=Math.max(levels.r382,levels.r618),inZone=last>=zoneLow&&last<=zoneHigh,aboveSwing=last>high.price;
  return tech('FIBONACCI',inZone||aboveSwing,inZone?72:aboveSwing?62:42,tf,inZone?'RETRACEMENT_CONFLUENCE':aboveSwing?'EXTENSION_PHASE':'OUTSIDE_ZONE',[inZone?'38.2~61.8 되돌림 구간':'되돌림 구간 밖',aboveSwing?'이전 고점 상단 · 확장 목표 참고':null],{A:low,B:high,levels,last,note:'Fib는 단독 신호가 아니라 다른 구조와의 합류 근거'})
}
function elliott(c,tf){
  const ps=pivots(c).slice(-10);if(ps.length<6)return tech('ELLIOTT',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient');
  let best=null;
  for(let s=Math.max(0,ps.length-8);s<=ps.length-6;s++){const q=ps.slice(s,s+6);if(q.map(x=>x.type).join('')!=='LHLHLH')continue;const bull=q[2].price>q[0].price&&q[3].price>q[1].price&&q[4].price>q[2].price&&q[5].price>q[3].price;if(bull)best=q}
  if(!best)return tech('ELLIOTT',false,36,tf,'AMBIGUOUS',['명확한 상승 5파 근사 구조 없음'],{note:'파동 라벨 불확실 시 진입 신호로 사용하지 않음'});
  const invalidation=best[4].price,last=c.at(-1).close,valid=last>invalidation;
  return tech('ELLIOTT',valid,valid?60:20,tf,valid?'IMPULSE_5_CANDIDATE':'INVALIDATED',['상승 5파형 스윙 배열 근사',valid?'최근 핵심 저점 위 유지':'핵심 저점 이탈 · 시나리오 폐기'],{pivots:best,invalidation,note:'책 원칙에 따라 무효화 우선 · 파동 라벨은 근사 evidence-only'})
}
function volumeProfile(c,tf,bins=24){
  if(c.length<40)return tech('VOLUME_PROFILE',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient');
  const w=c.slice(-120),lo=Math.min(...w.map(x=>x.low)),hi=Math.max(...w.map(x=>x.high));if(!(hi>lo))return tech('VOLUME_PROFILE',false,0,tf,'FLAT');
  const step=(hi-lo)/bins,arr=Array.from({length:bins},(_,i)=>({from:lo+i*step,to:lo+(i+1)*step,mid:lo+(i+.5)*step,volume:0}));
  for(const x of w){const tp=(x.high+x.low+x.close)/3,idx=Math.max(0,Math.min(bins-1,Math.floor((tp-lo)/step)));arr[idx].volume+=x.volume}
  const total=arr.reduce((s,b)=>s+b.volume,0),poc=arr.reduce((a,b)=>b.volume>a.volume?b:a,arr[0]);let chosen=[poc],sum=poc.volume,left=arr.indexOf(poc)-1,right=arr.indexOf(poc)+1;
  while(sum<total*.70&&(left>=0||right<arr.length)){const lv=left>=0?arr[left].volume:-1,rv=right<arr.length?arr[right].volume:-1;if(rv>lv){chosen.push(arr[right]);sum+=arr[right].volume;right++}else{chosen.push(arr[left]);sum+=arr[left].volume;left--}}
  const vah=Math.max(...chosen.map(x=>x.to)),val=Math.min(...chosen.map(x=>x.from)),last=c.at(-1).close;let stage='INSIDE_VALUE',score=48;if(last>vah){stage='ACCEPT_ABOVE_VALUE';score=66}else if(last<val){stage='BELOW_VALUE';score=35}else if(Math.abs(last-poc.mid)<=step){stage='AT_POC';score=52}
  return tech('VOLUME_PROFILE',stage==='ACCEPT_ABOVE_VALUE',score,tf,stage,[stage==='ACCEPT_ABOVE_VALUE'?'가치영역 상단 위 수용 후보':stage==='AT_POC'?'POC 부근 평균회귀 위치':'가치영역 내부/하단'],{poc:poc.mid,vah,val,bins:arr,last,note:'OHLCV typical-price 버킷 근사 · 체결별 Volume Profile이 아님'})
}
function wyckoff(c,tf){
  if(c.length<70)return[tech('WYCKOFF_ACCUMULATION',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient'),tech('WYCKOFF_DISTRIBUTION',false,0,tf,'DATA_INSUFFICIENT',[],{},'insufficient')];
  const w=c.slice(-70),base=w.slice(0,45),recent=w.slice(45),rangeLow=Math.min(...base.map(x=>x.low)),rangeHigh=Math.max(...base.map(x=>x.high)),A=atr(w),av=A.at(-1)||w.at(-1).close*.01,volBase=avg(base.map(x=>x.volume))||1;
  let spring=null,upthrust=null,sos=null,sow=null;
  for(let i=0;i<recent.length;i++){const x=recent[i],global=45+i;if(x.low<rangeLow-av*.15&&x.close>rangeLow)spring={i:global,x};if(x.high>rangeHigh+av*.15&&x.close<rangeHigh)upthrust={i:global,x};if(x.close>rangeHigh+av*.2&&x.volume>=volBase*1.15)sos={i:global,x};if(x.close<rangeLow-av*.2&&x.volume>=volBase*1.15)sow={i:global,x}}
  let test=null,lps=null;if(spring){for(let i=spring.i+1;i<w.length;i++){const x=w[i];if(x.low>spring.x.low&&x.low<=rangeLow+av*.45&&x.volume<spring.x.volume){test={i,x};break}}}
  if(sos){for(let i=sos.i+1;i<w.length;i++){const x=w[i];if(x.low>=rangeHigh-av*.55&&x.close>=rangeHigh-av*.2&&x.volume<sos.x.volume){lps={i,x};break}}}
  let accStage='RANGE',accScore=36,accReasons=[];if(spring){accStage='SPRING';accScore=68;accReasons.push('범위 하단 이탈 후 회복')}if(test){accStage='SPRING_TEST';accScore=76;accReasons.push('Spring 후 더 높은 저점/거래량 감소 테스트')}if(sos){accStage='SOS';accScore=82;accReasons.push('범위 상단 SOS 돌파')}if(sos&&lps){accStage='LPS_BU';accScore=90;accReasons.push('SOS 후 LPS/BU 지지 확인')}
  let distStage='RANGE',distScore=25,distReasons=[];if(upthrust){distStage='UT_UTAD';distScore=66;distReasons.push('범위 상단 돌파 후 재진입')}if(sow){distStage='SOW';distScore=80;distReasons.push('범위 하단 약세 이탈 + 거래량')}
  return[
    tech('WYCKOFF_ACCUMULATION',accScore>=68,accScore,tf,accStage,accReasons,{rangeLow,rangeHigh,spring,test,sos,lps,note:'사후 라벨 확정이 아니라 관찰 가능한 이벤트 기반 근사'}),
    tech('WYCKOFF_DISTRIBUTION',distScore>=66,distScore,tf,distStage,distReasons,{rangeLow,rangeHigh,upthrust,sow,note:'롱 회피/축소 컨텍스트'})
  ];
}
function gapAndCvd(){
  return[
    tech('CVD',false,0,'','N/A',['실제 매수·매도 주도 체결 데이터 없으면 추정하지 않음'],{},'requires-data'),
    tech('GAP',false,0,'','NOT_APPLICABLE_24X7',['24/7 crypto 연속시장 기본 스캔에서는 주식형 갭 전략 비활성'],{},'not-applicable'),
    tech('OPENING_RANGE',false,0,'','NOT_APPLICABLE_24X7',['세션 정의가 별도로 있을 때만 활성'],{},'not-applicable')
  ];
}
function riskPlan(c,techniques=[]){
  if(c.length<20)return null;const entry=c.at(-1).close,A=atr(c),av=A.at(-1);if(!(entry>0&&av>0))return null;const recentLow=Math.min(...c.slice(-12).map(x=>x.low)),recentHigh=Math.max(...c.slice(-30).map(x=>x.high));let invalidation=Math.min(recentLow,entry-av*1.15);if(!(invalidation<entry))invalidation=entry-av*1.5;const risk=entry-invalidation;let target1=recentHigh>entry?recentHigh:entry+risk*1.5,target2=entry+risk*2.5;
  const fib=techniques.find(x=>x.id==='FIBONACCI'&&x.meta?.levels);if(fib){const e=n(fib.meta.levels.e1618);if(e&&e>target1)target2=e}
  const rr1=(target1-entry)/risk,rr2=(target2-entry)/risk;return{entry,invalidation,targets:[target1,target2],rewardRisk:[rr1,rr2],minimumPreferredR:1.5,valid:rr1>=1.0,note:'교육용 구조 기반 계획값 · 계좌 크기 입력 전 수량 산정 안 함'}
}
function analyzeTf(c,tf){
  const out=[];out.push(...obvAdVwap(c,tf),...volatility(c,tf),...cciAdx(c,tf),fibonacci(c,tf),elliott(c,tf),volumeProfile(c,tf),...wyckoff(c,tf));return out
}
function analyze({frames={},trueCvd=null}={}){
  const candles={},all=[];for(const tf of TF_ORDER){candles[tf]=rows(frames[tf]);if(candles[tf].length)all.push(...analyzeTf(candles[tf],tf))}
  all.push(...gapAndCvd());if(trueCvd&&Number.isFinite(Number(trueCvd.value))){const t=all.find(x=>x.id==='CVD');if(t){t.dataStatus='ok';t.stage=Number(trueCvd.value)>=0?'BUYER_DOMINANT':'SELLER_DOMINANT';t.active=Number(trueCvd.value)>=0;t.score=t.active?65:30;t.meta={...trueCvd};t.reasons=[t.active?'실제 체결 기반 CVD 양수':'실제 체결 기반 CVD 음수']}}
  const rankable=all.filter(x=>x.mode==='rank'&&x.active).sort((a,b)=>b.score-a.score),evidence=all.filter(x=>x.mode==='evidence'&&x.active).sort((a,b)=>b.score-a.score),warnings=all.filter(x=>x.id==='WYCKOFF_DISTRIBUTION'&&x.active);
  const base=candles['4h'].length?candles['4h']:candles['1h'].length?candles['1h']:candles['1d'],plan=base?.length?riskPlan(base,all):null;const score=Math.round(clamp((rankable[0]?.score||0)+(rankable.length>=2?6:0)+(evidence.length>=2?4:0)-(warnings.length?10:0)));
  const dataGaps=all.filter(x=>x.dataStatus!=='ok').map(x=>({id:x.id,status:x.dataStatus,stage:x.stage}));
  return{version:VERSION,registryVersion:Registry.VERSION,registrySummary:Registry.summary(),score,rankable:rankable.slice(0,8),evidence:evidence.slice(0,10),warnings:warnings.slice(0,4),all:all.slice(0,40),riskPlan:plan,dataGaps};
}
module.exports={VERSION,rows,sma,ema,atr,pivots,obvAdVwap,volatility,cciAdx,fibonacci,elliott,volumeProfile,wyckoff,riskPlan,analyze};

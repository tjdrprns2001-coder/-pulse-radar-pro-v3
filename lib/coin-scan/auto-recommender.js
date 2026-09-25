'use strict';
const Promotion=require('../../ui/book-ai/promotion-engine.js');

const BLOCKED_CLASSES=new Set(['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE']);
const CLASS_POINTS={'PRE-SURGE':26,'RE-ENTRY':25,'PATTERN-SETUP':20,'ACCUMULATION-PRE':22,'META-PRE':16,'SECTOR-ROTATION':10,'ANOMALY':5};
const V2_POINTS={'A-pre':18,'A':14,'A→A+B':11,'NFB-SQ':6,'NFB':3,'C':3,'B':0,'A+B':-7,'PROGRESSED':-15,'NFB-SC':-8,'미완성':0};
const V3_POINTS={PASS:18,SOFT_FAIL:8,MIXED:-6,'N/A':0};

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function scanKey(x){return String(x?.scanClass?.key||'STALE')}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function push(arr,text){if(text&&!arr.includes(text))arr.push(text)}
function marketPriority(item={}){if(item.spotListed&&item.futuresListed)return 3;if(item.futuresListed)return 2;if(item.marketScope==='futures')return 2;if(item.marketScope==='spot+futures')return 3;return 0}

function hardBlock(item){
  const reasons=[];
  if(!item||item.dataState==='failed'||item.dataState==='stale')push(reasons,'실시간 데이터 불안정');
  if(item?.v3Invalidation)push(reasons,'v3 장기 구조 무효화');
  const reentry=Boolean(item?.strategyCycle?.reentryEligible);const k=scanKey(item);if(BLOCKED_CLASSES.has(k)&&!(k==='POST-SURGE'&&reentry))push(reasons,k);
  if(item?.tradeSignal?.level==='제외')for(const x of item.tradeSignal.invalidations||[])push(reasons,x);
  const ch=n(item?.priceChange24h);if(ch!=null&&ch>=12&&!reentry)push(reasons,'24H 가격이 이미 많이 진행됨');
  return reasons;
}

function evaluate(item={}){
  const blocked=hardBlock(item);
  if(blocked.length)return{symbol:item.symbol||'',score:0,state:'EXCLUDE',label:'제외',reasons:[],missing:[],invalidations:blocked.slice(0,5),item};

  let score=0;const reasons=[],missing=[],invalidations=[];
  const cls=scanKey(item),v2=String(item.v2Type||'미완성'),v3=String(item.v3LongTier||'N/A');
  score+=CLASS_POINTS[cls]||0;score+=V2_POINTS[v2]||0;score+=V3_POINTS[v3]||0;
  if((CLASS_POINTS[cls]||0)>=16)push(reasons,cls==='PRE-SURGE'?'PRE-SURGE 구조':cls==='RE-ENTRY'?'재상승 구조':cls==='PATTERN-SETUP'?'다중 패턴 셋업':'축적/선행 구조');
  if(['A-pre','A','A→A+B'].includes(v2))push(reasons,'v2 '+v2);
  if(v3==='PASS')push(reasons,'장기 필터 PASS');else if(v3==='SOFT_FAIL')push(reasons,'장기 필터 SOFT');else if(v3==='MIXED')push(invalidations,'장기 프레임 혼조');

  const candidate=n(item.candidateScore);if(candidate!=null){score+=Math.min(12,Math.max(0,candidate*.12));if(candidate>=65)push(reasons,'Scanner 후보점수 '+Math.round(candidate))}
  const align=n(item.v3AlignmentPct);if(align!=null){if(align>=70){score+=12;push(reasons,'HTF 정렬 '+align.toFixed(0)+'%')}else if(align>=60){score+=8;push(reasons,'HTF 정렬 '+align.toFixed(0)+'%')}else if(align<45){score-=8;push(invalidations,'HTF 정렬 약함 '+align.toFixed(0)+'%')}}else push(missing,'HTF 정렬');

  const reentry=Boolean(item.strategyCycle?.reentryEligible),patternSetup=Boolean(item.strategyCycle?.patternEligible);const ch=n(item.priceChange24h);if(ch!=null){if(Math.abs(ch)<=3){score+=10;push(reasons,'24H 덜 진행 '+(ch>=0?'+':'')+ch.toFixed(1)+'%')}else if(Math.abs(ch)<=6){score+=6;push(reasons,'24H 아직 과진행 아님')}else if(ch>8&&!reentry){score-=8;push(invalidations,'24H 추격 위험 '+ch.toFixed(1)+'%')}else if(ch>8&&reentry){score+=4;push(reasons,'급등 후 재진입 사이클 확인')}}else push(missing,'24H 변동');if(reentry||patternSetup){const ss=n(item.strategyCycle?.reentryScore);if(ss!=null){score+=Math.min(14,ss*.14);push(reasons,(reentry?'재상승':'패턴')+' 점수 '+ss.toFixed(0))}}

  const oi=n(item.oi4hChangePct);if(oi!=null){if(oi>=3){score+=12;push(reasons,'OI 4H +'+oi.toFixed(1)+'%')}else if(oi>=1){score+=7;push(reasons,'OI 4H +'+oi.toFixed(1)+'%')}else if(oi<=-3){score-=8;push(invalidations,'OI 4H 감소 '+oi.toFixed(1)+'%')}}else push(missing,'Binance OI');

  const xoi=item.xoiProfile||item.samplePattern?.xoiProfile||{};const xb=n(xoi.positiveBreadth),xl=n(xoi.leaderChangePct);
  if(xoi.available){if((xb||0)>=2){score+=9;push(reasons,'교차 OI '+xb+'개 거래소 확산')}else{score+=5;push(reasons,'교차 OI 선행')};if(xl!=null&&xl>=2.5)score+=3}else push(missing,'교차 OI');

  const tk=n(item.trueTakerRatio??item.takerRatio);if(tk!=null){if(tk>=1.5){score+=9;push(reasons,'taker '+tk.toFixed(2))}else if(tk>=1.2){score+=6;push(reasons,'taker '+tk.toFixed(2))}else if(tk<.8){score-=8;push(invalidations,'taker 매도 우위 '+tk.toFixed(2))}}else push(missing,'taker');

  const rv=n(item.v3Rvol?.ignition15m?.value??item.volumeAcceleration15m??item.volumeAcceleration);
  if(rv!=null){if(rv>=1.5&&rv<6){score+=7;push(reasons,'15m RVOL '+rv.toFixed(2)+'x')}else if(rv>=6){score+=2;push(invalidations,'거래량 과열 가능 '+rv.toFixed(1)+'x')}}else push(missing,'15m RVOL');

  if(item.structure==='bullish'){score+=7;push(reasons,'상승 구조')}else if(item.structure==='bearish'){score-=10;push(invalidations,'상위 구조 약세')}

  const ts=String(item.tradeSignal?.level||'');
  if(ts==='매수 후보'){score+=14;push(reasons,'기존 tradeSignal 매수 후보')}else if(ts==='관찰'){score+=5}
  if(item.preSurge?.label==='가능성 높음'){score+=10;push(reasons,'PRE-SURGE 다중 확인')}else if(item.preSurge?.label==='관찰'){score+=4}

  if(item.futuresListed){score+=6;push(reasons,item.spotListed?'Binance 현물+선물 상장':'Binance 선물 상장')}else if(item.marketScope==='spot'){score-=6;push(missing,'Binance 선물 미상장')}
  score=Math.round(clamp(score)*10)/10;
  const promotion=Promotion.evaluate({item});
  const state=promotion.state,label=promotion.label;
  for(const x of promotion.reasons||[])push(reasons,x);
  for(const x of promotion.missing||[])push(missing,x);
  for(const x of promotion.invalidations||[])push(invalidations,x);
  return{symbol:item.symbol||'',score,state,label,promotion,reasons:reasons.slice(0,8),missing:[...new Set(missing)].slice(0,8),invalidations:[...new Set(invalidations)].slice(0,8),item};
}

function recommend(items=[],limit=5){
  const evaluated=(Array.isArray(items)?items:[]).map(evaluate);
  const order={RECOMMEND:0,CONFIRMED:1,READY:2,WATCH:3,WAIT:4,EXCLUDE:5};
  return evaluated.sort((a,b)=>(order[a.state]-order[b.state])||(marketPriority(b.item)-marketPriority(a.item))||b.score-a.score||String(a.symbol).localeCompare(String(b.symbol))).slice(0,Math.max(1,limit));
}

function summary(items=[],limit=5){
  const rows=recommend(items,Math.max(limit,items.length||0));
  return{
    recommended:rows.filter(x=>x.state==='RECOMMEND').slice(0,limit),
    confirmed:rows.filter(x=>x.state==='CONFIRMED').slice(0,limit),
    ready:rows.filter(x=>x.state==='READY').slice(0,limit),
    watch:rows.filter(x=>x.state==='WATCH').slice(0,limit),
    wait:rows.filter(x=>x.state==='WAIT').slice(0,limit),
    excluded:rows.filter(x=>x.state==='EXCLUDE').slice(0,limit)
  };
}

module.exports={BLOCKED_CLASSES,CLASS_POINTS,V2_POINTS,V3_POINTS,marketPriority,evaluate,recommend,summary};

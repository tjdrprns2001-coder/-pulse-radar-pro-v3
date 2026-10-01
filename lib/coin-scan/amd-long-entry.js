'use strict';

const KST_TZ='Asia/Seoul';
const NY_TZ='America/New_York';

const kstFmt=new Intl.DateTimeFormat('en-CA',{
  timeZone:KST_TZ,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
const nyOffsetFmt=new Intl.DateTimeFormat('en-US',{
  timeZone:NY_TZ,timeZoneName:'shortOffset',hour:'2-digit'
});

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function avg(xs){const a=xs.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function bar(x){
  if(!Array.isArray(x)||x.length<7)return null;
  const out={openTime:finite(x[0]),open:finite(x[1]),high:finite(x[2]),low:finite(x[3]),close:finite(x[4]),volume:finite(x[5]),closeTime:finite(x[6])};
  return Object.values(out).every(v=>v!=null)?out:null;
}
function closedBars(rows,asOf){
  return (Array.isArray(rows)?rows:[]).map(bar).filter(Boolean).filter(x=>x.closeTime<asOf).sort((a,b)=>a.openTime-b.openTime);
}
function parts(fmt,ts){
  const p=Object.fromEntries(fmt.formatToParts(new Date(ts)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {y:+p.year,m:+p.month,d:+p.day,h:+p.hour,min:+p.minute};
}
function kstParts(ts){return parts(kstFmt,ts)}
function dateKey(y,m,d){return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function tradeDate(ts){const p=kstParts(ts);return dateKey(p.y,p.m,p.d)}
function isUsDst(ts){
  const name=nyOffsetFmt.formatToParts(new Date(ts)).find(x=>x.type==='timeZoneName')?.value||'';
  return /-4(?:$|\b)/.test(name)||/GMT-4/.test(name);
}
function sessionWindows(ts){
  const dst=isUsDst(ts);
  return{
    kst:true,dst,
    asia:[8*60,13*60],
    london:dst?[15*60,18*60]:[16*60,19*60],
    newYork:dst?[20*60,23*60]:[21*60,24*60],
    usOpen:dst?[21*60+30,21*60+45]:[22*60+30,22*60+45]
  };
}
function sessionOf(ts){
  const p=kstParts(ts),mins=p.h*60+p.min,w=sessionWindows(ts);
  if(mins>=w.asia[0]&&mins<w.asia[1])return'ASIA';
  if(mins>=w.london[0]&&mins<w.london[1])return'LONDON';
  if(mins>=w.newYork[0]&&mins<w.newYork[1])return'NEW_YORK';
  return'OTHER';
}
function sameTradeDate(rows,key){return rows.filter(x=>tradeDate(x.openTime)===key)}
function range(rows){
  if(!rows.length)return null;
  return{high:Math.max(...rows.map(x=>x.high)),low:Math.min(...rows.map(x=>x.low)),open:rows[0].open,close:rows[rows.length-1].close,firstAt:rows[0].openTime,lastAt:rows[rows.length-1].closeTime,count:rows.length,mid:(Math.max(...rows.map(x=>x.high))+Math.min(...rows.map(x=>x.low)))/2};
}
function atr(rows,period=14,endIndex=rows.length-1){
  const start=Math.max(1,endIndex-period+1),trs=[];
  for(let i=start;i<=endIndex;i++){
    const p=rows[i-1],x=rows[i];if(!p||!x)continue;
    trs.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)));
  }
  return trs.length?avg(trs):null;
}
function ema(rows,period=20){
  if(!rows.length)return null;
  const k=2/(period+1);let v=rows[0].close;
  for(let i=1;i<rows.length;i++)v=rows[i].close*k+v*(1-k);
  return v;
}
function pivots(rows){
  const highs=[],lows=[];
  for(let i=2;i<rows.length-2;i++){
    const x=rows[i];
    if(x.high>rows[i-1].high&&x.high>=rows[i-2].high&&x.high>rows[i+1].high&&x.high>=rows[i+2].high)highs.push({price:x.high,at:x.openTime,index:i});
    if(x.low<rows[i-1].low&&x.low<=rows[i-2].low&&x.low<rows[i+1].low&&x.low<=rows[i+2].low)lows.push({price:x.low,at:x.openTime,index:i});
  }
  return{highs,lows};
}
function structureState(rows,emaPeriod=20){
  if(rows.length<8)return{state:'UNKNOWN',ema20:null,lastClose:rows.at(-1)?.close??null,lastSwingHigh:null,lastSwingLow:null};
  const p=pivots(rows),hs=p.highs.slice(-2),ls=p.lows.slice(-2),last=rows.at(-1),e=ema(rows,emaPeriod);
  const hh=hs.length===2&&hs[1].price>hs[0].price,lh=hs.length===2&&hs[1].price<hs[0].price;
  const hl=ls.length===2&&ls[1].price>ls[0].price,ll=ls.length===2&&ls[1].price<ls[0].price;
  const brokeHigh=p.highs.length?last.close>p.highs.at(-1).price:false;
  let state='NEUTRAL';
  if((hh&&hl)||brokeHigh||(hl&&e!=null&&last.close>=e))state='BULLISH';
  else if(lh&&ll&&e!=null&&last.close<e)state='BEARISH';
  return{state,ema20:e,lastClose:last.close,lastSwingHigh:p.highs.at(-1)?.price??null,lastSwingLow:p.lows.at(-1)?.price??null,hh,hl,lh,ll,brokeHigh,aboveEma20:e!=null?last.close>=e:null};
}
function recentHigh(rows,beforeTs,count){
  const xs=rows.filter(x=>x.openTime<beforeTs).slice(-count);
  return xs.length?Math.max(...xs.map(x=>x.high)):null;
}
function firstAfter(rows,ts,pred){return rows.find(x=>x.openTime>ts&&pred(x))||null}
function indexByOpen(rows,ts){return rows.findIndex(x=>x.openTime===ts)}
function prevVolumeAverage(rows,index,count=20){
  const xs=rows.slice(Math.max(0,index-count),index).map(x=>x.volume);
  return avg(xs);
}
function findDisplacement(rows,startIdx,maxAhead=4){
  if(startIdx<0)return null;
  for(let i=startIdx;i<Math.min(rows.length,startIdx+maxAhead);i++){
    const x=rows[i],a=atr(rows,14,i),body=x.close-x.open,r=x.high-x.low,pos=r>0?(x.close-x.low)/r:0;
    const prev=rows.slice(Math.max(0,i-5),i),down=prev.filter(z=>z.close<z.open).map(z=>z.volume),base=avg(prev.map(z=>z.volume)),downAvg=avg(down);
    const volumeImproved=x.volume>(downAvg??0)&&x.volume>(base??0);
    if(body>0&&a!=null&&(body>=a*.55||(r>=a*1.1&&pos>=.7))&&volumeImproved)return{bar:x,index:i,atr:a,volumeImproved,volumeRatio:base?x.volume/base:null};
  }
  return null;
}
function findBullishFvg(rows,fromIdx,toIdx){
  const a=Math.max(2,fromIdx),b=Math.min(rows.length-1,toIdx);
  for(let i=a;i<=b;i++){
    const older=rows[i-2],cur=rows[i];
    if(cur.low>older.high)return{kind:'BULLISH_FVG',low:older.high,high:cur.low,mid:(older.high+cur.low)/2,createdAt:cur.openTime,index:i};
  }
  return null;
}
function findBullishObProxy(rows,displacementIdx){
  for(let i=displacementIdx-1;i>=Math.max(0,displacementIdx-6);i--){
    const x=rows[i];
    if(x.close<x.open)return{kind:'BULLISH_OB_PROXY',low:x.low,high:x.high,mid:(x.low+x.high)/2,createdAt:rows[displacementIdx].openTime,index:i};
  }
  return null;
}
function findRetest(rows,zone,afterTs){
  return rows.find(x=>x.openTime>afterTs&&x.low<=zone.high&&x.high>=zone.low&&x.close>=zone.low)||null;
}
function findZoneBreak(rows,zone,afterTs){
  return rows.find(x=>x.openTime>afterTs&&x.close<zone.low)||null;
}
function nearestBearishFvgAbove(rows,price){
  const zones=[];
  for(let i=2;i<rows.length;i++){
    if(rows[i].high<rows[i-2].low){
      const low=rows[i].high,high=rows[i-2].low;
      if(low>price)zones.push({label:'4H_BEARISH_FVG',low,high,price:low,createdAt:rows[i].openTime});
    }
  }
  return zones.sort((a,b)=>a.price-b.price)[0]||null;
}
function kstDailyLevels(m15,asOf){
  const currentKey=tradeDate(asOf),groups=new Map();
  for(const x of m15){const k=tradeDate(x.openTime);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
  const keys=[...groups.keys()].sort(),prior=keys.filter(k=>k<currentKey).at(-1),cur=groups.get(currentKey)||[];
  const prev=prior?range(groups.get(prior)||[]):null;
  return{currentDate:currentKey,dailyOpen:cur[0]?.open??null,previousDate:prior||null,pdh:prev?.high??null,pdl:prev?.low??null};
}
function weekKeyFromTs(ts){
  const p=kstParts(ts),d=new Date(Date.UTC(p.y,p.m-1,p.d)),dow=(d.getUTCDay()+6)%7;
  d.setUTCDate(d.getUTCDate()-dow);
  return dateKey(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
}
function kstWeeklyLevels(h4,asOf){
  const current=weekKeyFromTs(asOf),groups=new Map();
  for(const x of h4){const k=weekKeyFromTs(x.openTime);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
  const keys=[...groups.keys()].sort(),prior=keys.filter(k=>k<current).at(-1),cur=groups.get(current)||[];
  const prev=prior?range(groups.get(prior)||[]):null;
  return{currentWeek:current,weeklyOpen:cur[0]?.open??null,previousWeek:prior||null,pwh:prev?.high??null,pwl:prev?.low??null};
}
function equalLiquidity(rows,type='low'){
  const p=pivots(rows),xs=(type==='high'?p.highs:p.lows).slice(-8),a=atr(rows,14,rows.length-1);
  if(xs.length<2||!a)return null;
  let best=null;
  for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++){
    const gap=Math.abs(xs[i].price-xs[j].price);
    if(gap<=a*.2&&(!best||gap<best.gap))best={price:(xs[i].price+xs[j].price)/2,at:[xs[i].at,xs[j].at],gap,kind:type==='high'?'EQUAL_HIGH':'EQUAL_LOW',proxy:true};
  }
  return best;
}
function phasePlan(asOf){
  const p=kstParts(asOf),mins=p.h*60+p.min,w=sessionWindows(asOf);
  if(mins>=8*60&&mins<13*60)return{phase:'ASIA_BOX',action:'진입보다 아시아 고점·저점과 HTF 유동성 표시'};
  if(mins>=13*60&&mins<w.london[0])return{phase:'PRE_LONDON',action:'신규 롱 축소 · 어느 쪽 유동성을 먼저 회수하는지 대기'};
  if(mins>=w.london[0]&&mins<w.london[1])return{phase:'LONDON_KILLZONE',action:'sell-side sweep → reclaim → MSS 확인'};
  if(mins>=w.london[1]&&mins<w.newYork[0])return{phase:'LONDON_LUNCH',action:'뉴욕 전환 대기 · 관통된 FVG 재사용 금지'};
  if(mins>=w.newYork[0]&&mins<w.newYork[1])return{phase:'NEW_YORK_KILLZONE',action:'뉴스 첫 방향 추격 금지 · 5m/15m 구조 확정 후 진입'};
  if(mins>=23*60||mins<60)return{phase:'NY_AM_LATE',action:'추격 금지 · 새 HL/FVG와 충분한 목표 공간 있을 때만 continuation'};
  if(mins>=2*60+30&&mins<5*60)return{phase:'NY_PM',action:'신규 롱보다 기존 수익 포지션 관리 우선'};
  if(mins>=5*60&&mins<8*60)return{phase:'LOW_LIQUIDITY',action:'명확한 4H 지지·구조 전환 없으면 신규 롱 회피'};
  return{phase:'OTHER',action:'유동성 외곽 접근과 다음 세션 구조 대기'};
}
function findHigherLowConfirmation(m15,afterTs,sweepLow){
  const xs=m15.filter(x=>x.openTime>afterTs);
  for(let i=1;i<xs.length;i++){
    const prev=xs[i-1],cur=xs[i];
    if(prev.low>sweepLow&&cur.low>prev.low&&cur.close>prev.high)return{at:cur.openTime,price:cur.close,low:cur.low};
  }
  return null;
}
function targetPack({entry,asia,london,levels,h1,h4}){
  const list=[];
  const push=(label,price)=>{if(Number.isFinite(price)&&price>entry)list.push({label,price})};
  push('ASIA_MID',asia?.mid);
  push('ASIA_HIGH',asia?.high);
  push('LONDON_HIGH',london?.high);
  push('PREV_DAY_HIGH',levels.daily?.pdh);
  push('PREV_WEEK_HIGH',levels.weekly?.pwh);
  const p1=pivots(h1).highs.filter(x=>x.price>entry).sort((a,b)=>a.price-b.price)[0];if(p1)push('1H_SWING_HIGH',p1.price);
  const p4=pivots(h4).highs.filter(x=>x.price>entry).sort((a,b)=>a.price-b.price)[0];if(p4)push('4H_UPPER_LIQUIDITY',p4.price);
  const bearish=nearestBearishFvgAbove(h4,entry);if(bearish)push('4H_BEARISH_FVG',bearish.price);
  const seen=new Set();
  return list.filter(x=>{const k=x.price.toPrecision(12);if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.price-b.price);
}
function statusLabel(s){
  return({
    NO_ASIA_RANGE:'아시아 박스 형성 대기',
    WAIT_HTF_SHIFT:'4H·1H 구조 전환 대기',
    WAIT_SWEEP:'sell-side 스윕 또는 돌파-리테스트 대기',
    WAIT_RECLAIM:'5m·15m 유동성 회복 대기',
    WAIT_MSS:'5m·15m 상승 MSS 대기',
    WAIT_DISPLACEMENT:'상승 displacement·거래량 확인 대기',
    WAIT_ZONE:'bullish FVG/OB 생성 대기',
    WAIT_RETRACE:'FVG/OB 되돌림 대기',
    WAIT_REBREAK:'되돌림 유지 후 단기 고점 재돌파 대기',
    WAIT_BREAKOUT_RETEST:'돌파선 지지 전환 대기',
    LONG_READY:'롱 트리거 충족',
    NO_LONG_TARGET_CONSUMED:'상단 목표 유동성 이미 소진',
    NO_LONG_RR:'남은 목표 대비 R:R 부족',
    NO_CHASE:'재돌파 이후 과이격 · 추격 금지',
    INVALID:'구조 무효 · 롱 금지',
    EVENT_BLOCKED:'중요 이벤트 직전 · 롱 보류'
  })[s]||s;
}
function checklist(items){
  const rows=items.map((x,i)=>({id:i+1,...x}));
  return{required:8,passed:rows.filter(x=>x.status==='PASS').length,failed:rows.filter(x=>x.status==='FAIL').length,unknown:rows.filter(x=>x.status==='UNKNOWN').length,items:rows};
}
function riskSizing(entry,stop,{accountEquity=null,riskPercent=null}={}){
  const e=finite(entry),s=finite(stop),eq=finite(accountEquity),rp=finite(riskPercent),riskPerUnit=e!=null&&s!=null?Math.abs(e-s):null;
  const validRisk=rp!=null&&rp>0?rp:null,maxLoss=eq!=null&&validRisk!=null?eq*(validRisk/100):null;
  return{
    suggestedRiskPercentRange:[0.25,0.5],
    accountEquity:eq,
    riskPercent:validRisk,
    maxLoss,
    riskPerUnit,
    quantity:maxLoss!=null&&riskPerUnit>0?maxLoss/riskPerUnit:null,
    complete:maxLoss!=null&&riskPerUnit>0
  };
}
function commonContext({frames,asOf,lastPrice,symbol,eventRisk,accountEquity,riskPercent,fundingRatePct,oi1hPct,oi4hPct}){
  const m15=closedBars(frames['15m'],asOf),m5=closedBars(frames['5m'],asOf),h1=closedBars(frames['1h'],asOf),h4=closedBars(frames['4h'],asOf),d1=closedBars(frames['1d'],asOf);
  const daily=kstDailyLevels(m15,asOf),weekly=kstWeeklyLevels(h4,asOf),h4s=structureState(h4),h1s=structureState(h1);
  const htfBlocked=h4s.state==='BEARISH'&&h1s.state!=='BULLISH';
  const current=finite(lastPrice)??m5.at(-1)?.close??m15.at(-1)?.close??null;
  return{
    version:'ICT_CHARTBRO_LONG_v2_KST',
    policy:{
      timeBasis:'KST',
      asia:'08:00-13:00',
      london:isUsDst(asOf)?'15:00-18:00':'16:00-19:00',
      newYork:isUsDst(asOf)?'20:00-23:00':'21:00-24:00',
      timeframeFlow:['4h','1h','15m','5m'],
      minRr:1.5,
      minFirstTargetR:1.0,
      checklistRequired:8
    },
    symbol:symbol||null,
    primaryAsset:['BTCUSDT','ETHUSDT'].includes(String(symbol||'').toUpperCase()),
    available:m15.length>=24&&m5.length>=36&&h1.length>=20&&h4.length>=20,
    currentPrice:current,
    frames:{m15,m5,h1,h4,d1},
    levels:{
      daily,weekly,
      equalHigh:equalLiquidity(m15,'high'),
      equalLow:equalLiquidity(m15,'low'),
      h1SwingHigh:pivots(h1).highs.at(-1)?.price??null,
      h1SwingLow:pivots(h1).lows.at(-1)?.price??null,
      h4SwingHigh:pivots(h4).highs.at(-1)?.price??null,
      h4SwingLow:pivots(h4).lows.at(-1)?.price??null
    },
    htf:{h4:h4s,h1:h1s,blocked:htfBlocked,overheadBearishFvg:current!=null?nearestBearishFvgAbove(h4,current):null},
    phase:phasePlan(asOf),
    eventRisk:['CLEAR','BLOCK'].includes(String(eventRisk||'').toUpperCase())?String(eventRisk).toUpperCase():'UNKNOWN',
    sizingInput:{accountEquity:finite(accountEquity),riskPercent:finite(riskPercent)},
    derivatives:{fundingRatePct:finite(fundingRatePct),oi1hPct:finite(oi1hPct),oi4hPct:finite(oi4hPct),riskStatus:'UNRATED',note:'가이드에 급증 임계값이 정의되지 않아 자동 차단하지 않고 원시값만 표시'}
  };
}
function buildChecklist(ctx,{scenario,sweep=null,reclaim=null,mss=null,disp=null,zone=null,retest=null,entry=null,stop=null,firstTarget=null,chosen=null,riskPlan=null,breakout=null}={}){
  const liqMapped=Boolean(ctx.levels.daily.pdh||ctx.levels.daily.pdl||ctx.levels.equalLow||ctx.levels.h4SwingLow);
  const structurePass=!ctx.htf.blocked&&(ctx.htf.h4.state!=='BEARISH'||ctx.htf.h1.state==='BULLISH');
  const sweepOrBreak=scenario==='C'?Boolean(breakout?.confirmed&&retest):Boolean(sweep&&reclaim);
  const rrPass=Boolean(firstTarget?.rr>=1&&chosen?.rr>=1.5);
  const eventStatus=ctx.eventRisk==='CLEAR'?'PASS':ctx.eventRisk==='BLOCK'?'FAIL':'UNKNOWN';
  return checklist([
    {key:'HTF_DIRECTION',label:'4H 방향과 1H 구조가 롱을 완전히 거스르지 않음',status:structurePass?'PASS':'FAIL'},
    {key:'SELL_SIDE_LIQUIDITY',label:'아시아·전일·동일저점 등 sell-side liquidity 표시',status:liqMapped?'PASS':'FAIL'},
    {key:scenario==='C'?'BREAKOUT_RETEST':'SWEEP_RECLAIM',label:scenario==='C'?'4H/1H 돌파 후 지지 전환 확인':'실제 저점 스윕 후 저점 위 복귀',status:sweepOrBreak?'PASS':'FAIL'},
    {key:'DISPLACEMENT',label:'5m/15m 상승 displacement와 거래량 증가',status:disp?.volumeImproved?'PASS':'FAIL'},
    {key:'MSS',label:'직전 lower high 종가 돌파',status:mss?.confirmed?'PASS':'FAIL'},
    {key:'FVG_OB',label:'bullish FVG 또는 OB 형성',status:zone?'PASS':'FAIL'},
    {key:'RETEST_HOLD',label:'FVG/OB 재테스트가 무효선 위에서 유지',status:retest?'PASS':'FAIL'},
    {key:'RR',label:'첫 목표 ≥1R, 상단 목표 ≥1.5R',status:rrPass?'PASS':'FAIL'},
    {key:'EVENT_CLEAR',label:'주요 경제 이벤트 직전이 아님',status:eventStatus},
    {key:'RISK_PLAN',label:'진입·손절·익절·최대손실금액 사전 정의',status:entry!=null&&stop!=null&&chosen&&riskPlan?.complete?'PASS':entry!=null&&stop!=null&&chosen?'UNKNOWN':'FAIL'}
  ]);
}
function finalizePlan(ctx,base,{scenario,asia,london,sweep,reclaim,mss,disp,zone,retest,rebreak,entry,stop,invalidation,targets,chosen,firstTarget,hl15,breakout}){
  const riskPlan=riskSizing(entry,stop,ctx.sizingInput);
  const checks=buildChecklist(ctx,{scenario,sweep,reclaim,mss,disp,zone,retest,entry,stop,firstTarget,chosen,riskPlan,breakout});
  const secondTarget=(targets||[]).find(x=>x.rr>=2)||chosen||null;
  const entries=[
    {leg:1,weightPct:40,price:retest?zone.high:null,label:'FVG 상단 반응 확인',ready:Boolean(retest)},
    {leg:2,weightPct:40,price:rebreak?.close??null,label:'5m 단기 고점 재돌파',ready:Boolean(rebreak)},
    {leg:3,weightPct:20,price:hl15?.price??null,label:'15m higher low 확정',ready:Boolean(hl15)}
  ];
  return{
    ...base,
    scenario,
    entry,
    stop,
    invalidation,
    entryZone:zone?{low:zone.low,high:zone.high,mid:zone.mid,kind:zone.kind}:null,
    entries,
    targets,
    selectedTarget:chosen,
    firstTarget,
    riskReward:chosen?.rr??null,
    checklist:checks,
    riskPlan,
    exitPlan:{
      tp1:firstTarget?{...firstTarget,reducePctRange:[25,50]}:null,
      tp2:secondTarget,
      runner:'15m 직전 higher low 종가 이탈'
    },
    runnerExit:'15m 직전 higher low 종가 이탈',
    manualChecks:[
      ...(ctx.eventRisk==='UNKNOWN'?['중요 경제 이벤트 일정 수동 확인 필요']:[]),
      ...(!riskPlan.complete?['계좌 평가액·거래당 위험비율 입력 후 수량 확정 필요']:[]),
      ...(!ctx.primaryAsset?['알트코인은 BTC 4H 강한 하락 여부 별도 확인 필요']:[])
    ]
  };
}
function findBreakoutCandidate(rows){
  for(let i=Math.max(20,rows.length-8);i<rows.length;i++){
    const prev=rows.slice(i-20,i),level=prev.length?Math.max(...prev.map(x=>x.high)):null,vol=avg(prev.map(x=>x.volume)),x=rows[i];
    if(level!=null&&vol!=null&&x.close>level&&x.volume>vol)return{confirmed:true,bar:x,index:i,level,volumeRatio:x.volume/vol,tf:null};
  }
  return null;
}
function evaluateBreakoutScenario(ctx,{asia,london,minRr}){
  const {m15,m5,h1,h4}=ctx.frames;
  const b1=findBreakoutCandidate(h1),b4=findBreakoutCandidate(h4),raw=b1||b4;
  if(!raw)return null;
  const breakout={...raw,tf:b1?'1h':'4h'};
  const retest=m15.find(x=>x.openTime>breakout.bar.openTime&&x.low<=breakout.level&&x.close>=breakout.level)||null;
  const failed=m15.find(x=>x.openTime>breakout.bar.openTime&&x.close<breakout.level)||null;
  if(failed&&!retest)return{status:'INVALID',label:statusLabel('INVALID'),scenario:'C',breakout,reasons:['돌파선 아래 15m 종가 재진입 · 실패한 돌파']};
  if(!retest)return{status:'WAIT_BREAKOUT_RETEST',label:statusLabel('WAIT_BREAKOUT_RETEST'),scenario:'C',breakout,reasons:['4H/1H 거래량 동반 돌파 확인 · 15m 지지 전환 대기']};

  const start=m15.findIndex(x=>x.openTime>=breakout.bar.openTime),disp=findDisplacement(m15,Math.max(0,start),5);
  const zone=disp?(findBullishFvg(m15,Math.max(2,disp.index-1),disp.index+3)||findBullishObProxy(m15,disp.index)):null;
  if(!disp)return{status:'WAIT_DISPLACEMENT',label:statusLabel('WAIT_DISPLACEMENT'),scenario:'C',breakout,retestAt:retest.openTime,reasons:['돌파 후 상승 displacement 부족']};
  if(!zone)return{status:'WAIT_ZONE',label:statusLabel('WAIT_ZONE'),scenario:'C',breakout,retestAt:retest.openTime,reasons:['돌파 후 bullish FVG/OB 미확인']};
  const zoneBreak=findZoneBreak(m15,zone,zone.createdAt);
  if(zoneBreak)return{status:'INVALID',label:statusLabel('INVALID'),scenario:'C',breakout,zone,retestAt:retest.openTime,reasons:['FVG/OB 완전 관통']};

  const triggerLevel=recentHigh(m5,retest.openTime,6),rebreak=triggerLevel!=null?firstAfter(m5,retest.openTime,x=>x.close>triggerLevel):null;
  const entry=rebreak?.close??triggerLevel??zone.mid;
  const a15=atr(m15,14,m15.length-1),stop=Math.min(retest.low,zone.low)-Math.max(entry*.0005,(a15||0)*.1);
  const londonBeforeBreakout=range(m15.filter(x=>
    tradeDate(x.openTime)===tradeDate(breakout.bar.openTime)
    &&sessionOf(x.openTime)==='LONDON'
    &&x.openTime<breakout.bar.openTime
  ));
  const targets=targetPack({entry,asia,london:londonBeforeBreakout,levels:ctx.levels,h1,h4});
  const risk=entry-stop,rrTargets=risk>0?targets.map(x=>({...x,rr:(x.price-entry)/risk})):targets.map(x=>({...x,rr:null}));
  const first=rrTargets[0]||null,chosen=rrTargets.find(x=>x.rr>=minRr)||null;
  const mss={confirmed:Boolean(rebreak),tf:'5m',at:rebreak?.openTime??null,level:triggerLevel};
  const hl15=rebreak?findHigherLowConfirmation(m15,retest.openTime,stop):null;
  const publicCtx={...ctx};delete publicCtx.frames;
  const base={
    ...publicCtx,status:!rebreak?'WAIT_REBREAK':'LONG_READY',label:statusLabel(!rebreak?'WAIT_REBREAK':'LONG_READY'),
    breakout,retestAt:retest.openTime,rebreakAt:rebreak?.openTime??null,mss,displacement:{at:disp.bar.openTime,tf:'15m',volumeImproved:disp.volumeImproved,volumeRatio:disp.volumeRatio},zone,
    reasons:!rebreak?['돌파선 지지 확인 · 단기 고점 재돌파 대기']:['돌파 거래량 > 20봉 평균','15m 지지 전환','bullish FVG/OB 유지','5m 재돌파']
  };
  const plan=finalizePlan(ctx,base,{scenario:'C',asia,london,sweep:null,reclaim:null,mss,disp,zone,retest,rebreak,entry,stop,invalidation:breakout.level,targets:rrTargets,chosen,firstTarget:first,hl15,breakout});
  if(ctx.eventRisk==='BLOCK')return{...plan,status:'EVENT_BLOCKED',label:statusLabel('EVENT_BLOCKED'),reasons:['중요 이벤트 직전/직후 신규 롱 보류']};
  if(first&&first.rr<1)return{...plan,status:'NO_LONG_RR',label:statusLabel('NO_LONG_RR'),required1RPrice:entry+risk,required1_5RPrice:entry+risk*1.5,reasons:['첫 번째 목표가 +1R 미만']};
  if(!chosen)return{...plan,status:'NO_LONG_RR',label:statusLabel('NO_LONG_RR'),required1RPrice:entry+risk,required1_5RPrice:entry+risk*1.5,reasons:['가용 상단 유동성까지 R:R 1:1.5 미만']};
  if(!rebreak)return plan;
  const a5=atr(m5,14,m5.length-1),chase=ctx.currentPrice-rebreak.close;
  if(a5!=null&&chase>a5*.75)return{...plan,status:'NO_CHASE',label:statusLabel('NO_CHASE'),reasons:['재돌파 이후 5m ATR 0.75 이상 이격']};
  if(plan.checklist.passed<8)return{...plan,status:'WAIT_REBREAK',label:'체크리스트 8/10 미충족',reasons:[`체크리스트 ${plan.checklist.passed}/10`]};
  return plan;
}
function evaluate({frames={},asOf=Date.now(),lastPrice=null,minRr=1.5,symbol=null,eventRisk='UNKNOWN',accountEquity=null,riskPercent=null,fundingRatePct=null,oi1hPct=null,oi4hPct=null}={}){
  const ctx=commonContext({frames,asOf,lastPrice,symbol,eventRisk,accountEquity,riskPercent,fundingRatePct,oi1hPct,oi4hPct});
  const {m15,m5,h1,h4}=ctx.frames;
  const base={...ctx,frames:undefined};
  if(!ctx.available)return{...base,status:'NO_ASIA_RANGE',label:statusLabel('NO_ASIA_RANGE'),reasons:['4H·1H·15m·5m 확정봉 이력 부족']};

  const groups=new Map();
  for(const x of m15){
    const key=tradeDate(x.openTime),sess=sessionOf(x.openTime);
    if(!groups.has(key))groups.set(key,{asia:[],london:[],newYork:[],all:[]});
    const g=groups.get(key);g.all.push(x);if(sess==='ASIA')g.asia.push(x);if(sess==='LONDON')g.london.push(x);if(sess==='NEW_YORK')g.newYork.push(x);
  }
  const keys=[...groups.keys()].sort().reverse();
  const key=keys.find(k=>groups.get(k).asia.length>=12&&(groups.get(k).london.length||groups.get(k).newYork.length));
  if(!key)return{...base,status:'NO_ASIA_RANGE',label:statusLabel('NO_ASIA_RANGE'),reasons:['KST 08:00~13:00 아시아 박스 확정 대기']};
  const g=groups.get(key),asia=range(g.asia),london=range(g.london),ny=range(g.newYork),cycle=sameTradeDate(m15,key);
  const levels={...ctx.levels,asia,london,ny};
  const enriched={...ctx,levels};

  const sellLevels=[
    {label:'ASIA_LOW',price:asia.low},
    {label:'PREV_DAY_LOW',price:ctx.levels.daily.pdl},
    {label:'EQUAL_LOW',price:ctx.levels.equalLow?.price},
    {label:'1H_SWING_LOW',price:ctx.levels.h1SwingLow}
  ].filter(x=>Number.isFinite(x.price));

  const candidateBars=[...g.london,...g.newYork].sort((a,b)=>a.openTime-b.openTime);
  let sweepHit=null;
  for(const x of candidateBars){
    const swept=sellLevels.filter(l=>x.low<l.price).sort((a,b)=>b.price-a.price);
    if(swept.length){sweepHit={bar:x,reference:swept[0],all:swept};break}
  }

  if(!sweepHit){
    const c=evaluateBreakoutScenario(enriched,{asia,london,minRr});
    if(c)return{...c,tradeDate:key,asia,london,ny,levels};
    return{...base,tradeDate:key,asia,london,ny,levels,status:ctx.htf.blocked?'WAIT_HTF_SHIFT':'WAIT_SWEEP',label:statusLabel(ctx.htf.blocked?'WAIT_HTF_SHIFT':'WAIT_SWEEP'),reasons:ctx.htf.blocked?['4H lower-high/lower-low + 1H 구조 전환 미확인']:['런던/뉴욕 sell-side sweep 미확인 · 돌파-리테스트 시나리오도 미확인']};
  }

  const firstSweep=sweepHit.bar,reference=sweepHit.reference,preliminaryReclaim=cycle.find(x=>x.openTime>firstSweep.openTime&&x.close>reference.price)||null;
  if(!preliminaryReclaim){
    const deepest=candidateBars.filter(x=>x.openTime>=firstSweep.openTime&&x.openTime<=cycle.at(-1).openTime).reduce((a,b)=>b.low<a.low?b:a,firstSweep);
    return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:deepest.openTime,low:deepest.low,session:sessionOf(deepest.openTime),reference},status:'WAIT_RECLAIM',label:statusLabel('WAIT_RECLAIM'),reasons:[`${reference.label} 아래 유동성 회수 후 5m/15m 종가 회복 대기`]};
  }
  const sweepBars=candidateBars.filter(x=>x.openTime>=firstSweep.openTime&&x.openTime<=preliminaryReclaim.openTime),sweep=sweepBars.reduce((a,b)=>b.low<a.low?b:a,firstSweep);
  const sweepSession=sessionOf(sweep.openTime),afterSweep=cycle.filter(x=>x.openTime>sweep.openTime),reclaim=afterSweep.find(x=>x.close>reference.price)||preliminaryReclaim;
  const invalidClose=afterSweep.find(x=>x.openTime>reclaim.openTime&&x.close<sweep.low)||null;
  if(invalidClose)return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},reclaimAt:reclaim.openTime,invalidAt:invalidClose.openTime,invalidClose:invalidClose.close,status:'INVALID',label:statusLabel('INVALID'),reasons:['스윕 저점 아래 15m 종가 재이탈']};

  const level15=recentHigh(m15,sweep.openTime,4),level5=recentHigh(m5,sweep.openTime,6);
  const mss15=level15!=null?firstAfter(m15,reclaim.openTime,x=>x.close>level15):null,mss5=level5!=null?firstAfter(m5,reclaim.openTime,x=>x.close>level5):null;
  let mssTf=null,mssBar=null,mssLevel=null,mssRows=null;
  if(mss15&&(!mss5||mss15.openTime<=mss5.openTime)){mssTf='15m';mssBar=mss15;mssLevel=level15;mssRows=m15}
  else if(mss5){mssTf='5m';mssBar=mss5;mssLevel=level5;mssRows=m5}
  if(!mssBar)return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},reclaimAt:reclaim.openTime,mss:{confirmed:false,level15,level5},status:'WAIT_MSS',label:statusLabel('WAIT_MSS'),reasons:['스윕 꼬리만으로 진입 금지 · 5m/15m lower high 종가 돌파 대기']};

  if(ctx.htf.blocked)return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},status:'WAIT_HTF_SHIFT',label:statusLabel('WAIT_HTF_SHIFT'),reasons:['하위 MSS는 확인됐지만 4H 하락 구조를 1H이 아직 뒤집지 못함']};

  const mssIdx=indexByOpen(mssRows,mssBar.openTime),disp=findDisplacement(mssRows,mssIdx,4);
  if(!disp)return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},status:'WAIT_DISPLACEMENT',label:statusLabel('WAIT_DISPLACEMENT'),reasons:['MSS 이후 몸통·거래량이 동반된 상승 displacement 부족']};

  const zone=findBullishFvg(mssRows,Math.max(2,disp.index-1),disp.index+3)||findBullishObProxy(mssRows,disp.index);
  if(!zone)return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},displacement:{at:disp.bar.openTime,tf:mssTf,volumeImproved:disp.volumeImproved,volumeRatio:disp.volumeRatio},status:'WAIT_ZONE',label:statusLabel('WAIT_ZONE'),reasons:['displacement 뒤 bullish FVG/OB 미확인']};

  const zoneBreak=findZoneBreak(m15,zone,zone.createdAt);
  if(zoneBreak)return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},zone,invalidAt:zoneBreak.openTime,status:'INVALID',label:statusLabel('INVALID'),reasons:['bullish FVG/OB 완전 관통']};

  const postSweep=cycle.filter(x=>x.openTime>=sweep.openTime),asiaHighConsumed=postSweep.some(x=>x.high>=asia.high);
  if(asiaHighConsumed&&sweepSession==='NEW_YORK')return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},zone,status:'NO_LONG_TARGET_CONSUMED',label:statusLabel('NO_LONG_TARGET_CONSUMED'),reasons:['뉴욕 분출이 이미 아시아 고점 유동성을 소진 · 새 롱 금지']};

  const retest=findRetest(m5,zone,zone.createdAt),a15=atr(m15,14,m15.length-1),stopBuffer=Math.max(sweep.low*.0005,(a15||0)*.1),stop=sweep.low-stopBuffer;
  let triggerLevel=null,rebreak=null;
  if(retest){triggerLevel=recentHigh(m5,retest.openTime,6);if(triggerLevel!=null)rebreak=firstAfter(m5,retest.openTime,x=>x.close>triggerLevel)}
  const entry=rebreak?.close??triggerLevel??zone.mid;
  const scenario=sweepSession==='LONDON'?'A':'B';
  const londonTargetRange=scenario==='A'
    ? range(g.london.filter(x=>x.openTime<sweep.openTime))
    : london;
  const targets=targetPack({entry,asia,london:londonTargetRange,levels:ctx.levels,h1,h4}),risk=entry-stop,rrTargets=risk>0?targets.map(x=>({...x,rr:(x.price-entry)/risk})):targets.map(x=>({...x,rr:null}));
  const first=rrTargets[0]||null,chosen=rrTargets.find(x=>x.rr>=minRr)||null,hl15=rebreak?findHigherLowConfirmation(m15,retest?.openTime??rebreak.openTime,sweep.low):null;
  const mss={confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel};
  const plan=finalizePlan(enriched,{
    ...base,tradeDate:key,asia,london,ny,levels,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference,depthPct:(reference.price-sweep.low)/reference.price*100},reclaimAt:reclaim.openTime,mss,
    displacement:{at:disp.bar.openTime,tf:mssTf,volumeImproved:disp.volumeImproved,volumeRatio:disp.volumeRatio},zone,retestAt:retest?.openTime??null,triggerLevel,rebreakAt:rebreak?.openTime??null,
    status:!retest?'WAIT_RETRACE':!rebreak?'WAIT_REBREAK':'LONG_READY',label:statusLabel(!retest?'WAIT_RETRACE':!rebreak?'WAIT_REBREAK':'LONG_READY'),
    reasons:!retest?['분출 양봉 추격 금지 · FVG/OB 되돌림 대기']:!rebreak?['FVG/OB 방어 확인 · 5m 단기 고점 재돌파 대기']:['sell-side sweep','저점 위 reclaim','상승 MSS','거래량 동반 displacement','FVG/OB retest','5m 재돌파']
  },{scenario,asia,london,sweep,reclaim,mss,disp,zone,retest,rebreak,entry,stop,invalidation:sweep.low,targets:rrTargets,chosen,firstTarget:first,hl15,breakout:null});

  if(ctx.eventRisk==='BLOCK')return{...plan,status:'EVENT_BLOCKED',label:statusLabel('EVENT_BLOCKED'),reasons:['CPI/PCE/FOMC/고용/연준 발언 등 중요 이벤트 직전/직후']};
  if(!retest||!rebreak)return plan;
  if(first&&first.rr<1)return{...plan,status:'NO_LONG_RR',label:statusLabel('NO_LONG_RR'),required1RPrice:entry+risk,required1_5RPrice:entry+risk*1.5,reasons:['첫 번째 반대편 유동성 목표가 +1R 미만']};
  if(!chosen)return{...plan,status:'NO_LONG_RR',label:statusLabel('NO_LONG_RR'),required1RPrice:entry+risk,required1_5RPrice:entry+risk*1.5,reasons:['가용 상단 유동성까지 R:R 1:1.5 미만']};
  const a5=atr(m5,14,m5.length-1),chase=ctx.currentPrice-rebreak.close;
  if(a5!=null&&chase>a5*.75)return{...plan,status:'NO_CHASE',label:statusLabel('NO_CHASE'),reasons:['재돌파 트리거 이후 5m ATR 0.75 이상 이격']};
  if(plan.checklist.passed<8)return{...plan,status:'WAIT_REBREAK',label:'체크리스트 8/10 미충족',reasons:[`체크리스트 ${plan.checklist.passed}/10`]};
  return plan;
}

module.exports={evaluate,tradeDate,sessionOf,sessionWindows,closedBars,statusLabel,structureState,kstDailyLevels,kstWeeklyLevels};

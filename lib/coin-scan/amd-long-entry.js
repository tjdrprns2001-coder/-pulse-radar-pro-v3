'use strict';

const NY_TZ='America/New_York';
const nyFmt=new Intl.DateTimeFormat('en-CA',{
  timeZone:NY_TZ,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function bar(x){
  if(!Array.isArray(x)||x.length<7)return null;
  const out={openTime:finite(x[0]),open:finite(x[1]),high:finite(x[2]),low:finite(x[3]),close:finite(x[4]),volume:finite(x[5]),closeTime:finite(x[6])};
  return Object.values(out).every(v=>v!=null)?out:null;
}
function closedBars(rows,asOf){
  return (Array.isArray(rows)?rows:[]).map(bar).filter(Boolean).filter(x=>x.closeTime<asOf).sort((a,b)=>a.openTime-b.openTime);
}
function nyParts(ts){
  const p=Object.fromEntries(nyFmt.formatToParts(new Date(ts)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {y:+p.year,m:+p.month,d:+p.day,h:+p.hour,min:+p.minute};
}
function dateKey(y,m,d){return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function addDateKey(key,days){
  const [y,m,d]=key.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d+days));
  return dateKey(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());
}
// Session day starts at 08:00 KST so the NY window can cross KST midnight.
function tradeDate(ts){return new Date(ts+3600000).toISOString().slice(0,10)}
function sessionOf(ts){
  const p=nyParts(ts);
  const kh=(new Date(ts+9*3600000)).getUTCHours();
  if(kh>=8&&kh<13)return'ASIA';
  if(p.h>=2&&p.h<5)return'LONDON';
  if(p.h>=8&&p.h<11)return'NEW_YORK';
  return'OTHER';
}
function sameTradeDate(rows,key){return rows.filter(x=>tradeDate(x.openTime)===key)}
function range(rows){
  if(!rows.length)return null;
  const high=Math.max(...rows.map(x=>x.high)),low=Math.min(...rows.map(x=>x.low));
  return{high,low,mid:(high+low)/2,open:rows[0].open,close:rows.at(-1).close,firstAt:rows[0].openTime,lastAt:rows[rows.length-1].closeTime,count:rows.length};
}
function avg(values){const xs=(values||[]).filter(Number.isFinite);return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}
function kstCalendarDate(ts){return new Date(ts+9*3600000).toISOString().slice(0,10)}
function weekKey(ts){
  const d=new Date(ts+9*3600000),y=d.getUTCFullYear(),m=d.getUTCMonth(),day=d.getUTCDate(),dow=(d.getUTCDay()+6)%7;
  const monday=new Date(Date.UTC(y,m,day-dow));
  return monday.toISOString().slice(0,10);
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
function groupedLevels(rows,asOf,keyFn){
  const current=keyFn(asOf),groups=new Map();
  for(const x of rows){const key=keyFn(x.openTime);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)}
  const keys=[...groups.keys()].sort(),prior=keys.filter(k=>k<current).at(-1),cur=groups.get(current)||[],prev=prior?(groups.get(prior)||[]):[];
  const curRange=range(cur),prevRange=range(prev);
  return{current,previous:prior||null,open:curRange?.open??null,high:prevRange?.high??null,low:prevRange?.low??null};
}
function equalLiquidity(rows,type='low'){
  const ps=pivots(rows),xs=(type==='high'?ps.highs:ps.lows).slice(-10),a=atr(rows,14,rows.length-1);
  if(xs.length<2||!a)return null;
  let best=null;
  for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++){
    const gap=Math.abs(xs[i].price-xs[j].price);
    if(gap<=a*.2&&(!best||gap<best.gap))best={kind:type==='high'?'EQUAL_HIGH':'EQUAL_LOW',price:(xs[i].price+xs[j].price)/2,at:[xs[i].at,xs[j].at],gap,proxy:true};
  }
  return best;
}
function buildLevels({m15,h1,h4,asOf}){
  const daily=groupedLevels(m15,asOf,kstCalendarDate),weekly=groupedLevels(h4,asOf,weekKey),p1=pivots(h1),p4=pivots(h4);
  return{
    daily:{date:daily.current,previousDate:daily.previous,open:daily.open,pdh:daily.high,pdl:daily.low},
    weekly:{week:weekly.current,previousWeek:weekly.previous,open:weekly.open,pwh:weekly.high,pwl:weekly.low},
    equalHigh:equalLiquidity(m15,'high'),
    equalLow:equalLiquidity(m15,'low'),
    h1SwingHigh:p1.highs.at(-1)?.price??null,
    h1SwingLow:p1.lows.at(-1)?.price??null,
    h4SwingHigh:p4.highs.at(-1)?.price??null,
    h4SwingLow:p4.lows.at(-1)?.price??null
  };
}
function atr(rows,period=14,endIndex=rows.length-1){
  const start=Math.max(1,endIndex-period+1),trs=[];
  for(let i=start;i<=endIndex;i++){
    const p=rows[i-1],x=rows[i];if(!p||!x)continue;
    trs.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)));
  }
  return trs.length?trs.reduce((a,b)=>a+b,0)/trs.length:null;
}
function recentHigh(rows,beforeTs,count){
  const xs=rows.filter(x=>x.openTime<beforeTs).slice(-count);
  return xs.length?Math.max(...xs.map(x=>x.high)):null;
}
function firstAfter(rows,ts,pred){return rows.find(x=>x.openTime>ts&&pred(x))||null}
function indexByOpen(rows,ts){return rows.findIndex(x=>x.openTime===ts)}
function findDisplacement(rows,startIdx,maxAhead=3){
  if(startIdx<0)return null;
  for(let i=startIdx;i<Math.min(rows.length,startIdx+maxAhead);i++){
    const x=rows[i],a=atr(rows,14,i),body=x.close-x.open,r=x.high-x.low,pos=r>0?(x.close-x.low)/r:0;
    if(body>0&&a!=null&&(body>=a*.55||(r>=a*1.1&&pos>=.7)))return{bar:x,index:i,atr:a};
  }
  return null;
}
function findBullishFvg(rows,fromIdx,toIdx){
  const a=Math.max(2,fromIdx),b=Math.min(rows.length-1,toIdx);
  for(let i=a;i<=b;i++){
    const older=rows[i-2],cur=rows[i];
    if(cur.low>older.high){
      return{kind:'BULLISH_FVG',low:older.high,high:cur.low,mid:(older.high+cur.low)/2,createdAt:cur.openTime,index:i};
    }
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
function pivotHighs(rows){
  const out=[];
  for(let i=2;i<rows.length-2;i++){
    const h=rows[i].high;
    if(h>rows[i-1].high&&h>=rows[i-2].high&&h>rows[i+1].high&&h>=rows[i+2].high)out.push({price:h,at:rows[i].openTime});
  }
  return out;
}
function nearest4hFvgAbove(rows,entry){
  const zones=[];
  for(let i=2;i<rows.length;i++){
    const low=rows[i].high,high=rows[i-2].low;
    if(low<high&&low>entry&&!rows.slice(i+1).some(x=>x.high>=low))zones.push({price:low,label:'4H_BEARISH_FVG',zone:[low,high]});
  }
  return zones.sort((a,b)=>a.price-b.price)[0]||null;
}
function targetPack({entry,asiaHigh,londonHigh,prevDayHigh,h4Rows}){
  const list=[];
  const push=(label,price)=>{if(Number.isFinite(price)&&price>entry)list.push({label,price})};
  push('ASIA_HIGH',asiaHigh);push('LONDON_HIGH',londonHigh);push('PREV_DAY_HIGH',prevDayHigh);
  const piv=pivotHighs(h4Rows).filter(x=>x.price>entry).sort((a,b)=>a.price-b.price);
  if(piv[0])push('4H_UPPER_LIQUIDITY',piv[0].price);
  
  const fvg=nearest4hFvgAbove(h4Rows,entry);if(fvg)push(fvg.label,fvg.price);
  const seen=new Set();
  return list.filter(x=>{const k=x.price.toPrecision(12);if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.price-b.price);
}
function statusLabel(s){
  return({
    NO_ASIA_RANGE:'아시아 박스 형성 대기',
    WAIT_SWEEP:'아시아 저점 스윕 대기',
    WAIT_RECLAIM:'15m 아시아 저점 회복 대기',
    WAIT_MSS:'15m/5m 상승 MSS 대기',
    WAIT_DISPLACEMENT:'상승 displacement 대기',
    WAIT_ZONE:'FVG/OB 생성 대기',
    WAIT_RETRACE:'FVG/OB 되돌림 대기',
    WAIT_REBREAK:'되돌림 유지 후 단기 고점 재돌파 대기',
    LONG_READY:'롱 트리거 충족',
    NO_LONG_TARGET_CONSUMED:'세션에서 아시아 고점 소진',
    NO_LONG_RR:'남은 목표 대비 R:R 부족',
    NO_CHASE:'재돌파 이후 과이격 · 추격 금지',
    INVALID:'스윕 저점 재이탈 · 롱 무효'
  })[s]||s;
}

function evaluateAmd({frames={},asOf=Date.now(),lastPrice=null,minRr=1.5}={}){
  const m15=closedBars(frames['15m'],asOf),m5=closedBars(frames['5m'],asOf),h1=closedBars(frames['1h'],asOf),h4=closedBars(frames['4h'],asOf),d1=closedBars(frames['1d'],asOf);
  const base={version:'ICT_CHARTBRO_LONG_v2_KST',policy:{timeBasis:'KST',displayClock:'Asia/Seoul',sessionClock:'America/New_York',asia:'08:00-13:00 KST',london:'NY 02:00-05:00',newYork:'NY 08:00-11:00',minRr,firstTargetMinR:1},available:m15.length>=24&&m5.length>=36&&h1.length>=20&&h4.length>=20};
  if(!base.available)return{...base,status:'NO_ASIA_RANGE',label:statusLabel('NO_ASIA_RANGE'),reasons:['15m/5m 이력 부족']};

  const groups=new Map();
  for(const x of m15){
    const key=tradeDate(x.openTime),sess=sessionOf(x.openTime);
    if(!groups.has(key))groups.set(key,{asia:[],london:[],newYork:[],all:[]});
    const g=groups.get(key);g.all.push(x);if(sess==='ASIA')g.asia.push(x);if(sess==='LONDON')g.london.push(x);if(sess==='NEW_YORK')g.newYork.push(x);
  }
  const keys=[tradeDate(asOf)].filter(k=>groups.has(k));
  const key=keys.find(k=>groups.get(k).asia.length>=20&&(groups.get(k).london.length||groups.get(k).newYork.length));
  if(!key)return{...base,status:'NO_ASIA_RANGE',label:statusLabel('NO_ASIA_RANGE'),reasons:['완성된 아시아 박스 부족']};
  const g=groups.get(key),asia=range(g.asia),london=range(g.london),ny=range(g.newYork),cycle=sameTradeDate(m15,key),levels=buildLevels({m15,h1,h4,asOf});
  const sellLevels=[
    {label:'ASIA_LOW',price:asia.low},
    {label:'PREV_DAY_LOW',price:levels.daily.pdl},
    {label:'EQUAL_LOW',price:levels.equalLow?.price},
    {label:'1H_SWING_LOW',price:levels.h1SwingLow}
  ].filter(x=>Number.isFinite(x.price));
  const sessionBars=[...g.london,...g.newYork].sort((a,b)=>a.openTime-b.openTime);
  let sweepHit=null;
  for(const x of sessionBars){
    const swept=sellLevels.filter(level=>x.low<level.price).sort((a,b)=>b.price-a.price);
    if(swept.length){sweepHit={bar:x,reference:swept[0],all:swept};break}
  }
  if(!sweepHit)return{...base,tradeDate:key,asia,london,ny,levels,status:'WAIT_SWEEP',label:statusLabel('WAIT_SWEEP'),reasons:['아시아·전일·동일·1H 저점 sell-side sweep 미확인']};

  const firstSweep=sweepHit.bar,reference=sweepHit.reference;
  const preliminaryReclaim=cycle.find(x=>x.openTime>=firstSweep.openTime&&x.close>reference.price)||null;
  if(!preliminaryReclaim){
    const openSweep=sweepPool.reduce((a,b)=>b.low<a.low?b:a),openSession=sessionOf(openSweep.openTime);
    return{...base,tradeDate:key,asia,london,ny,levels,sweep:{at:openSweep.openTime,low:openSweep.low,session:openSession,reference,depthPct:(reference.price-openSweep.low)/reference.price*100},status:'WAIT_RECLAIM',label:statusLabel('WAIT_RECLAIM'),reasons:['스윕 후 15m 종가가 아시아 저점 위로 회복하지 못함']};
  }
  const sweep=sweepPool.filter(x=>x.openTime<=preliminaryReclaim.openTime).reduce((a,b)=>b.low<a.low?b:a);
  const sweepSession=sessionOf(sweep.openTime);
  const afterSweep=cycle.filter(x=>x.openTime>=sweep.openTime);
  const reclaim=afterSweep.find(x=>x.close>reference.price)||preliminaryReclaim;

  const invalidClose=afterSweep.find(x=>x.openTime>reclaim.openTime&&x.close<sweep.low)||null;
  if(invalidClose)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},levels,reclaimAt:reclaim.openTime,invalidation:sweep.low,invalidationClose:invalidClose.close,invalidatedAt:invalidClose.closeTime,invalidatedBarAt:invalidClose.openTime,status:'INVALID',label:statusLabel('INVALID'),reasons:['스윕 저점 아래 15m 종가 재이탈']};

  const level15=recentHigh(m15,sweep.openTime,4),level5=recentHigh(m5,sweep.openTime,6);
  const mss15=level15!=null?firstAfter(m15,reclaim.openTime,x=>x.close>level15):null;
  const mss5=level5!=null?firstAfter(m5,reclaim.closeTime,x=>x.close>level5):null;
  let mssTf=null,mssBar=null,mssLevel=null,mssRows=null;
  if(mss15&&(!mss5||mss15.openTime<=mss5.openTime)){mssTf='15m';mssBar=mss15;mssLevel=level15;mssRows=m15}
  else if(mss5){mssTf='5m';mssBar=mss5;mssLevel=level5;mssRows=m5}
  if(!mssBar)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:false,level15,level5},status:'WAIT_MSS',label:statusLabel('WAIT_MSS'),reasons:['15m/5m 단기 고점 종가 돌파 미확인']};

  const mssIdx=indexByOpen(mssRows,mssBar.openTime),disp=findDisplacement(mssRows,mssIdx,3);
  if(!disp)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},status:'WAIT_DISPLACEMENT',label:statusLabel('WAIT_DISPLACEMENT'),reasons:['MSS 이후 방향성 있는 상승 displacement 부족']};

  const zone=findBullishFvg(mssRows,Math.max(2,disp.index),disp.index+3)||findBullishObProxy(mssRows,disp.index);
  if(!zone)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},displacement:{at:disp.bar.openTime,tf:mssTf},status:'WAIT_ZONE',label:statusLabel('WAIT_ZONE'),reasons:['displacement 뒤 FVG/OB 구간 미확인']};

  const afterSessionSweep=[...g.london,...g.newYork].filter(x=>x.openTime>=sweep.openTime),asiaHighConsumed=afterSessionSweep.some(x=>x.high>=asia.high);
  if(asiaHighConsumed)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},displacement:{at:disp.bar.openTime,tf:mssTf},zone,status:'NO_LONG_TARGET_CONSUMED',label:statusLabel('NO_LONG_TARGET_CONSUMED'),reasons:['런던/뉴욕 세션에서 이미 아시아 고점 유동성 소진']};

  const zoneBar=mssRows[zone.index];
  const zoneConfirmedAt=zoneBar?.closeTime??zone.createdAt;
  const broken=m5.find(x=>x.openTime>zoneConfirmedAt&&x.low<zone.low);
  if(broken)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference},levels,zone,invalidation:zone.low,invalidationClose:broken.close,invalidatedAt:broken.closeTime,invalidationKind:'ZONE_LOW_WICK',status:'INVALID',label:'FVG/OB 완전 관통 · 롱 무효',reasons:['확정 5m 저가가 FVG/OB 하단 관통']};
  const retest=findRetest(m5,zone,zoneConfirmedAt);
  const current=finite(lastPrice)??(m5[m5.length-1]?.close??null);
  const atr15=atr(m15,14,m15.length-1),stopBuffer=Math.max((sweep.low||0)*.0005,(atr15||0)*.1),stop=sweep.low-stopBuffer;
  const prevDayHigh=d1.length?d1[d1.length-1].high:null;

  let triggerLevel=null,rebreak=null;
  if(retest){
    triggerLevel=recentHigh(m5,retest.openTime,6);
    if(triggerLevel!=null)rebreak=firstAfter(m5,retest.openTime,x=>x.close>triggerLevel);
  }
  const plannedEntry=rebreak?.close??triggerLevel??zone.mid;
  const londonBeforeEntry=range(g.london.filter(x=>x.closeTime<(rebreak?.closeTime??asOf)));
  const londonHigh=londonBeforeEntry?.high??null,targets=plannedEntry!=null?targetPack({entry:plannedEntry,asiaHigh:asia.high,londonHigh,prevDayHigh,h4Rows:h4}):[];
  const risk=plannedEntry!=null?plannedEntry-stop:null;
  const rrTargets=risk>0?targets.map(x=>({...x,rr:(x.price-plannedEntry)/risk})):targets.map(x=>({...x,rr:null}));
  const chosen=rrTargets[0]?.rr>=minRr?rrTargets[0]:null;
  const requiredTarget=risk>0?plannedEntry+minRr*risk:null;
  const nearestTarget=rrTargets[0]||null;

  const common={...base,tradeDate:key,asia,london,ny,levels,currentPrice:current,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,reference,depthPct:(reference.price-sweep.low)/reference.price*100},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},displacement:{at:disp.bar.openTime,tf:mssTf,atr:disp.atr},zone,entryZone:{low:zone.low,high:zone.high,mid:zone.mid},stop,invalidation:sweep.low,plannedEntry,risk,requiredTarget,nearestTarget,targets:rrTargets,selectedTarget:chosen,minRr,retestAt:retest?.openTime??null,triggerLevel,rebreakAt:rebreak?.openTime??null};

  if(!retest)return{...common,status:'WAIT_RETRACE',label:statusLabel('WAIT_RETRACE'),reasons:['분출 추격 금지 · FVG/OB 되돌림 대기']};
  if(!rebreak)return{...common,status:'WAIT_REBREAK',label:statusLabel('WAIT_REBREAK'),reasons:['되돌림 유지 확인 · 직전 단기 고점 재돌파 대기']};
  if(!chosen)return{...common,status:'NO_LONG_RR',label:statusLabel('NO_LONG_RR'),reasons:['가용 상단 유동성까지 R:R 1:1.5 미만']};

  if(current!=null&&current<stop)return{...common,status:'BLOCKED_PRICE',label:'현재가 손절 기준 하회 · 진입 금지',reasons:['실시간 가격이 구조 손절 아래']};
  const a5=atr(m5,14,m5.length-1),chase=current!=null&&rebreak?current-rebreak.close:0;
  if(a5!=null&&chase>a5*.75)return{...common,status:'NO_CHASE',label:statusLabel('NO_CHASE'),entry:rebreak.close,riskReward:chosen.rr,reasons:['재돌파 트리거 이후 5m ATR 0.75 이상 이격']};

  return{...common,status:'LONG_READY',label:statusLabel('LONG_READY'),entry:rebreak.close,riskReward:chosen.rr,reasons:['아시아 저점 sweep','15m 회복','상승 MSS','displacement','FVG/OB retest 유지','단기 고점 재돌파',`R:R ${chosen.rr.toFixed(2)}`]};
}



function trendFilter(rows){
  if(rows.length<20)return{known:false,passed:false,reason:'확정봉 20개 미만'};
  let ema=rows[0].close;for(const x of rows.slice(1))ema+=2/21*(x.close-ema);
  const a=rows.slice(-6,-3),b=rows.slice(-3);
  const lowerHigh=Math.max(...b.map(x=>x.high))<Math.max(...a.map(x=>x.high));
  const lowerLow=Math.min(...b.map(x=>x.low))<Math.min(...a.map(x=>x.low));
  const last=rows.at(-1),priorHigh=Math.max(...rows.slice(-7,-1).map(x=>x.high));
  const recovery=last.close>priorHigh||(last.close>=ema&&!lowerLow);
  return{known:true,passed:!(lowerHigh&&lowerLow),recovery,ema20:ema,lowerHigh,lowerLow};
}
function evaluateBreakout({frames={},asOf=Date.now(),lastPrice=null,minRr=1.5}={}){
  const m15=closedBars(frames['15m'],asOf),m5=closedBars(frames['5m'],asOf),h4=closedBars(frames['4h'],asOf),h1=closedBars(frames['1h'],asOf);
  const key=tradeDate(asOf),asia=range(m15.filter(x=>tradeDate(x.openTime)===key&&sessionOf(x.openTime)==='ASIA'));
  const base={model:'BREAKOUT_RETEST',tradeDate:key,asia,minRr};
  if(!asia||asia.count<20)return{...base,status:'WAIT_BREAKOUT',label:'돌파 후 되돌림 · 아시아 박스 대기'};
  const breakout=m15.find((x,i)=>tradeDate(x.openTime)===key&&sessionOf(x.openTime)!=='ASIA'&&x.close>asia.high&&i>=20&&x.volume>m15.slice(i-20,i).reduce((a,b)=>a+b.volume,0)/20);
  if(!breakout)return{...base,status:'WAIT_BREAKOUT',label:'거래량 동반 박스 상단 종가 돌파 대기'};
  const invalid=m15.find(x=>x.openTime>breakout.openTime&&x.close<asia.high);
  if(invalid)return{...base,status:'INVALID',label:'돌파선 아래 15m 종가 · 돌파 실패',invalidation:asia.high,invalidationClose:invalid.close,invalidatedAt:invalid.closeTime};
  const i=indexByOpen(m15,breakout.openTime),disp=findDisplacement(m15,i,1);
  const zone=disp&&(findBullishFvg(m15,i,i+2)||findBullishObProxy(m15,i));
  if(!zone)return{...base,status:'WAIT_ZONE',label:'돌파 displacement · FVG/OB 대기'};
  const confirmed=m15[zone.index].closeTime;
  if(m5.some(x=>x.openTime>confirmed&&x.low<zone.low))return{...base,zone,status:'INVALID',label:'돌파 FVG/OB 하단 관통'};
  const retest=m5.find(x=>x.openTime>confirmed&&x.low<=zone.high&&x.high>=zone.low&&x.close>=Math.max(zone.low,asia.high));
  if(!retest)return{...base,zone,status:'WAIT_RETRACE',label:'돌파선 지지 전환 · 되돌림 대기'};
  const triggerLevel=recentHigh(m5,retest.openTime,6),rebreak=firstAfter(m5,retest.closeTime,x=>x.close>triggerLevel);
  const stop=Math.min(zone.low,retest.low)-Math.max(zone.low*.0005,(atr(m15)||0)*.1);
  const plannedEntry=rebreak?.close??triggerLevel,risk=plannedEntry-stop;
  const targets=targetPack({entry:plannedEntry,h4Rows:h4}).map(t=>({...t,rr:(t.price-plannedEntry)/risk}));
  const nearestTarget=targets[0]||null,selectedTarget=risk>0&&nearestTarget?.rr>=minRr?nearestTarget:null;
  const common={...base,zone,entryZone:zone,stop,invalidation:zone.low,plannedEntry,risk,requiredTarget:plannedEntry+minRr*risk,nearestTarget,selectedTarget,targets,triggerLevel,retestAt:retest.openTime,rebreakAt:rebreak?.openTime,displacement:{at:breakout.openTime,tf:'15m'},mss:{confirmed:true,tf:'15m',at:breakout.openTime,level:asia.high}};
  if(!rebreak)return{...common,status:'WAIT_REBREAK',label:'돌파 되돌림 후 재돌파 대기'};
  if(!selectedTarget)return{...common,status:'NO_LONG_RR',label:'돌파 모델 · 첫 목표 1.5R 미달'};
  const current=finite(lastPrice)??m5.at(-1)?.close;
  if(current!=null&&current<stop)return{...common,status:'BLOCKED_PRICE',label:'현재가 돌파 손절 기준 하회 · 진입 금지'};
  if(current-rebreak.close>(atr(m5)||0)*.75)return{...common,status:'NO_CHASE',label:'돌파 모델 · 추격 금지'};
  return{...common,status:'LONG_READY',label:'돌파 되돌림 구조 완성',entry:rebreak.close,riskReward:selectedTarget.rr};
}
function evaluate(options={}){
  const asOf=options.asOf??Date.now(),frames=options.frames||{};
  const minRr=Math.max(1.5,finite(options.minRr)??1.5);
  let result=evaluateAmd({...options,asOf,minRr});
  result.model='SWEEP_RECLAIM';
  result.breakout=evaluateBreakout({...options,asOf,minRr});
  const h4=trendFilter(closedBars(frames['4h'],asOf)),h1=trendFilter(closedBars(frames['1h'],asOf));
  const c=options.context||{};
  const reviews={economicEvent:c.economicEventClear===true?'CONFIRMED':c.economicEventClear===false?'BLOCKED':'UNKNOWN',orderRisk:c.orderRiskConfirmed===true?'CONFIRMED':'UNKNOWN',oiFunding:c.oiFundingClear===true?'CONFIRMED':c.oiFundingClear===false?'BLOCKED':'UNKNOWN'};
  const guard=r=>{
    r.htf={h4,h1};r.review=reviews;r.minRr=minRr;
    r.policy={...r.policy,displayClock:'Asia/Seoul',asia:'08:00-13:00 KST',minRr,nearestTargetRequired:true};
    if(r.status==='LONG_READY'){
      const rows=closedBars(frames[r.displacement?.tf||'15m'],asOf),idx=indexByOpen(rows,r.displacement?.at),bar=rows[idx];
      const prior=rows.slice(Math.max(0,idx-20),idx),avg=prior.length?prior.reduce((a,b)=>a+b.volume,0)/prior.length:null;
      const volumeConfirmed=bar&&prior.length>=20&&avg>0&&bar.volume>avg;
      const hl=r.model==='BREAKOUT_RETEST'||(r.zone?.low>r.sweep?.low);
      r.confirmations={volume:!!volumeConfirmed,higherLow:!!hl};
      if(!volumeConfirmed||!hl)r={...r,status:'BLOCKED_CONFIRMATION',label:'분출 거래량·저점 유지 미확인 · 진입 금지'};
      else if(!h4.known||!h1.known)r={...r,status:'BLOCKED_HTF',label:'4H/1H 이력 미확인 · 진입 금지'};
      else if(!h4.passed||!h1.recovery)r={...r,status:'BLOCKED_HTF',label:'4H 하락 또는 1H 회복 미확인 · 진입 금지'};
      else if(Object.values(reviews).some(v=>v!=='CONFIRMED'))r={...r,status:'BLOCKED_REVIEW',label:'구조 완성 · 경제 일정·수급·주문 위험 확인 필요'};
      if(r.status!=='LONG_READY'){delete r.entry;r.reasons=[r.label];}
    }
    return r;
  };
  result=guard(result);result.breakout=guard(result.breakout);
  return result;
}
module.exports={evaluate,tradeDate,sessionOf,closedBars,statusLabel,trendFilter};

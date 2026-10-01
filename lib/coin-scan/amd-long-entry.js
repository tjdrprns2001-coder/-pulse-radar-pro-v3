'use strict';

const NY_TZ='America/New_York';
const nyFmt=new Intl.DateTimeFormat('en-CA',{
  timeZone:NY_TZ,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
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
function tradeDate(ts){
  const p=nyParts(ts),key=dateKey(p.y,p.m,p.d);
  return p.h>=19?addDateKey(key,1):key;
}
function sessionOf(ts){
  const p=nyParts(ts);
  if(p.h>=19)return'ASIA';
  if(p.h>=2&&p.h<5)return'LONDON';
  if(p.h>=8&&p.h<11)return'NEW_YORK';
  return'OTHER';
}
function sameTradeDate(rows,key){return rows.filter(x=>tradeDate(x.openTime)===key)}
function range(rows){
  if(!rows.length)return null;
  return{high:Math.max(...rows.map(x=>x.high)),low:Math.min(...rows.map(x=>x.low)),firstAt:rows[0].openTime,lastAt:rows[rows.length-1].closeTime,count:rows.length};
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
    if(rows[i].low>rows[i-2].high){
      const low=rows[i-2].high,high=rows[i].low;
      if(low>entry)zones.push({price:low,label:'4H_BULLISH_FVG',zone:[low,high]});
    }
  }
  zones.sort((a,b)=>a.price-b.price);return zones[0]||null;
}
function targetPack({entry,asiaHigh,londonHigh,prevDayHigh,h4Rows}){
  const list=[];
  const push=(label,price)=>{if(Number.isFinite(price)&&price>entry)list.push({label,price})};
  push('ASIA_HIGH',asiaHigh);push('LONDON_HIGH',londonHigh);push('PREV_DAY_HIGH',prevDayHigh);
  const piv=pivotHighs(h4Rows).filter(x=>x.price>entry).sort((a,b)=>a.price-b.price);
  if(piv[0])push('4H_UPPER_LIQUIDITY',piv[0].price);
  else{const highs=h4Rows.map(x=>x.high).filter(x=>x>entry).sort((a,b)=>a-b);if(highs[0])push('4H_UPPER_LIQUIDITY',highs[0])}
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
    NO_LONG_TARGET_CONSUMED:'런던에서 아시아 고점 소진',
    NO_LONG_RR:'남은 목표 대비 R:R 부족',
    NO_CHASE:'재돌파 이후 과이격 · 추격 금지',
    INVALID:'스윕 저점 재이탈 · 롱 무효'
  })[s]||s;
}

function evaluate({frames={},asOf=Date.now(),lastPrice=null,minRr=1.5}={}){
  const m15=closedBars(frames['15m'],asOf),m5=closedBars(frames['5m'],asOf),h4=closedBars(frames['4h'],asOf),d1=closedBars(frames['1d'],asOf);
  const base={version:'AMD_LONG_ENTRY_v1',policy:{sessionClock:'America/New_York',asia:'19:00-00:00',london:'02:00-05:00',newYork:'08:00-11:00',minRr},available:m15.length>=24&&m5.length>=36};
  if(!base.available)return{...base,status:'NO_ASIA_RANGE',label:statusLabel('NO_ASIA_RANGE'),reasons:['15m/5m 이력 부족']};

  const groups=new Map();
  for(const x of m15){
    const key=tradeDate(x.openTime),sess=sessionOf(x.openTime);
    if(!groups.has(key))groups.set(key,{asia:[],london:[],newYork:[],all:[]});
    const g=groups.get(key);g.all.push(x);if(sess==='ASIA')g.asia.push(x);if(sess==='LONDON')g.london.push(x);if(sess==='NEW_YORK')g.newYork.push(x);
  }
  const keys=[...groups.keys()].sort().reverse();
  const key=keys.find(k=>groups.get(k).asia.length>=8&&(groups.get(k).london.length||groups.get(k).newYork.length));
  if(!key)return{...base,status:'NO_ASIA_RANGE',label:statusLabel('NO_ASIA_RANGE'),reasons:['완성된 아시아 박스 부족']};
  const g=groups.get(key),asia=range(g.asia),london=range(g.london),ny=range(g.newYork),cycle=sameTradeDate(m15,key);
  const sweepPool=[...g.london,...g.newYork].filter(x=>x.low<asia.low).sort((a,b)=>a.openTime-b.openTime);
  if(!sweepPool.length)return{...base,tradeDate:key,asia,london,ny,status:'WAIT_SWEEP',label:statusLabel('WAIT_SWEEP'),reasons:['아시아 저점 아래 sell-side sweep 미확인']};

  const firstSweep=sweepPool[0];
  const preliminaryReclaim=cycle.find(x=>x.openTime>firstSweep.openTime&&x.close>asia.low)||null;
  if(!preliminaryReclaim){
    const openSweep=sweepPool.reduce((a,b)=>b.low<a.low?b:a),openSession=sessionOf(openSweep.openTime);
    return{...base,tradeDate:key,asia,london,ny,sweep:{at:openSweep.openTime,low:openSweep.low,session:openSession,depthPct:(asia.low-openSweep.low)/asia.low*100},status:'WAIT_RECLAIM',label:statusLabel('WAIT_RECLAIM'),reasons:['스윕 후 15m 종가가 아시아 저점 위로 회복하지 못함']};
  }
  const sweep=sweepPool.filter(x=>x.openTime<=preliminaryReclaim.openTime).reduce((a,b)=>b.low<a.low?b:a);
  const sweepSession=sessionOf(sweep.openTime);
  const afterSweep=cycle.filter(x=>x.openTime>sweep.openTime);
  const reclaim=afterSweep.find(x=>x.close>asia.low)||preliminaryReclaim;

  const invalidClose=afterSweep.find(x=>x.openTime>reclaim.openTime&&x.close<sweep.low)||null;
  if(invalidClose)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,invalidation:sweep.low,invalidationClose:invalidClose.close,invalidatedAt:invalidClose.closeTime,invalidatedBarAt:invalidClose.openTime,status:'INVALID',label:statusLabel('INVALID'),reasons:['스윕 저점 아래 15m 종가 재이탈']};

  const level15=recentHigh(m15,sweep.openTime,4),level5=recentHigh(m5,sweep.openTime,6);
  const mss15=level15!=null?firstAfter(m15,reclaim.openTime,x=>x.close>level15):null;
  const mss5=level5!=null?firstAfter(m5,reclaim.openTime,x=>x.close>level5):null;
  let mssTf=null,mssBar=null,mssLevel=null,mssRows=null;
  if(mss15&&(!mss5||mss15.openTime<=mss5.openTime)){mssTf='15m';mssBar=mss15;mssLevel=level15;mssRows=m15}
  else if(mss5){mssTf='5m';mssBar=mss5;mssLevel=level5;mssRows=m5}
  if(!mssBar)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:false,level15,level5},status:'WAIT_MSS',label:statusLabel('WAIT_MSS'),reasons:['15m/5m 단기 고점 종가 돌파 미확인']};

  const mssIdx=indexByOpen(mssRows,mssBar.openTime),disp=findDisplacement(mssRows,mssIdx,3);
  if(!disp)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},status:'WAIT_DISPLACEMENT',label:statusLabel('WAIT_DISPLACEMENT'),reasons:['MSS 이후 방향성 있는 상승 displacement 부족']};

  const zone=findBullishFvg(mssRows,Math.max(2,disp.index-1),disp.index+3)||findBullishObProxy(mssRows,disp.index);
  if(!zone)return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},displacement:{at:disp.bar.openTime,tf:mssTf},status:'WAIT_ZONE',label:statusLabel('WAIT_ZONE'),reasons:['displacement 뒤 FVG/OB 구간 미확인']};

  const londonAfterSweep=g.london.filter(x=>x.openTime>=sweep.openTime),asiaHighConsumed=londonAfterSweep.some(x=>x.high>=asia.high);
  if(asiaHighConsumed&&sweepSession==='LONDON')return{...base,tradeDate:key,asia,london,ny,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},displacement:{at:disp.bar.openTime,tf:mssTf},zone,status:'NO_LONG_TARGET_CONSUMED',label:statusLabel('NO_LONG_TARGET_CONSUMED'),reasons:['런던 세션에서 이미 아시아 고점 유동성 소진']};

  const retest=findRetest(m5,zone,zone.createdAt);
  const current=finite(lastPrice)??(m5[m5.length-1]?.close??null);
  const atr15=atr(m15,14,m15.length-1),stopBuffer=Math.max((sweep.low||0)*.0005,(atr15||0)*.1),stop=sweep.low-stopBuffer;
  const prevDayHigh=d1.length?d1[d1.length-1].high:null;

  let triggerLevel=null,rebreak=null;
  if(retest){
    triggerLevel=recentHigh(m5,retest.openTime,6);
    if(triggerLevel!=null)rebreak=firstAfter(m5,retest.openTime,x=>x.close>triggerLevel);
  }
  const plannedEntry=rebreak?.close??triggerLevel??zone.mid;
  const londonHigh=london?.high??null,targets=plannedEntry!=null?targetPack({entry:plannedEntry,asiaHigh:asia.high,londonHigh,prevDayHigh,h4Rows:h4}):[];
  const risk=plannedEntry!=null?plannedEntry-stop:null;
  const rrTargets=risk>0?targets.map(x=>({...x,rr:(x.price-plannedEntry)/risk})):targets.map(x=>({...x,rr:null}));
  const chosen=rrTargets.find(x=>x.rr>=minRr)||null;
  const requiredTarget=risk>0?plannedEntry+minRr*risk:null;
  const nearestTarget=rrTargets[0]||null;

  const common={...base,tradeDate:key,asia,london,ny,currentPrice:current,sweep:{at:sweep.openTime,low:sweep.low,session:sweepSession,depthPct:(asia.low-sweep.low)/asia.low*100},reclaimAt:reclaim.openTime,mss:{confirmed:true,tf:mssTf,at:mssBar.openTime,level:mssLevel},displacement:{at:disp.bar.openTime,tf:mssTf,atr:disp.atr},zone,entryZone:{low:zone.low,high:zone.high,mid:zone.mid},stop,invalidation:sweep.low,plannedEntry,risk,requiredTarget,nearestTarget,targets:rrTargets,selectedTarget:chosen,minRr,retestAt:retest?.openTime??null,triggerLevel,rebreakAt:rebreak?.openTime??null};

  if(!retest)return{...common,status:'WAIT_RETRACE',label:statusLabel('WAIT_RETRACE'),reasons:['분출 추격 금지 · FVG/OB 되돌림 대기']};
  if(!rebreak)return{...common,status:'WAIT_REBREAK',label:statusLabel('WAIT_REBREAK'),reasons:['되돌림 유지 확인 · 직전 단기 고점 재돌파 대기']};
  if(!chosen)return{...common,status:'NO_LONG_RR',label:statusLabel('NO_LONG_RR'),reasons:['가용 상단 유동성까지 R:R 1:1.5 미만']};

  const a5=atr(m5,14,m5.length-1),chase=current!=null&&rebreak?current-rebreak.close:0;
  if(a5!=null&&chase>a5*.75)return{...common,status:'NO_CHASE',label:statusLabel('NO_CHASE'),entry:rebreak.close,riskReward:chosen.rr,reasons:['재돌파 트리거 이후 5m ATR 0.75 이상 이격']};

  return{...common,status:'LONG_READY',label:statusLabel('LONG_READY'),entry:rebreak.close,riskReward:chosen.rr,reasons:['아시아 저점 sweep','15m 회복','상승 MSS','displacement','FVG/OB retest 유지','단기 고점 재돌파',`R:R ${chosen.rr.toFixed(2)}`]};
}

module.exports={evaluate,tradeDate,sessionOf,closedBars,statusLabel};

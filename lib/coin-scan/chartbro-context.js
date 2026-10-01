'use strict';

const SetupExecution=require('./setup-execution-gate.js');

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
function rowsOf(rows=[]){return(Array.isArray(rows)?rows:[]).map(bar).filter(Boolean).sort((a,b)=>a.openTime-b.openTime)}
function closedBars(rows=[],asOf=Date.now()){return rowsOf(rows).filter(x=>x.closeTime<asOf)}
function currentBar(rows=[],asOf=Date.now()){return rowsOf(rows).filter(x=>x.openTime<=asOf&&x.closeTime>=asOf).at(-1)||null}
function nyParts(ts){
  const p=Object.fromEntries(nyFmt.formatToParts(new Date(ts)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return{y:+p.year,m:+p.month,d:+p.day,h:+p.hour,min:+p.minute};
}
function tradeDate(ts){return new Date(ts+3600000).toISOString().slice(0,10)}
function sessionOf(ts){
  const p=nyParts(ts),kh=(new Date(ts+9*3600000)).getUTCHours();
  if(kh>=8&&kh<13)return'ASIA';
  if(p.h>=2&&p.h<5)return'LONDON';
  if(p.h>=7&&p.h<10)return'NEW_YORK';
  return'OTHER';
}
function range(rows=[]){
  if(!rows.length)return null;
  return{high:Math.max(...rows.map(x=>x.high)),low:Math.min(...rows.map(x=>x.low)),firstAt:rows[0].openTime,lastAt:rows.at(-1).closeTime,count:rows.length};
}
function atr(rows=[],period=14){
  const xs=rows.slice(-Math.max(2,period+1)),trs=[];
  for(let i=1;i<xs.length;i++){
    const p=xs[i-1],x=xs[i];
    trs.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)));
  }
  return trs.length?trs.reduce((a,b)=>a+b,0)/trs.length:null;
}
function pivots(rows=[],side='high'){
  const out=[];
  for(let i=2;i<rows.length-2;i++){
    if(side==='high'){
      const p=rows[i].high;
      if(p>rows[i-1].high&&p>=rows[i-2].high&&p>rows[i+1].high&&p>=rows[i+2].high)out.push({price:p,at:rows[i].openTime});
    }else{
      const p=rows[i].low;
      if(p<rows[i-1].low&&p<=rows[i-2].low&&p<rows[i+1].low&&p<=rows[i+2].low)out.push({price:p,at:rows[i].openTime});
    }
  }
  return out;
}
function equalCluster(rows=[],side='high'){
  const ps=pivots(rows,side).slice(-12);
  if(ps.length<2)return null;
  const a=atr(rows,14),last=rows.at(-1)?.close??null,tol=Math.max((a||0)*.10,(last||0)*.0005);
  let best=null;
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const d=Math.abs(ps[i].price-ps[j].price);
    if(d<=tol){
      const x={price:(ps[i].price+ps[j].price)/2,tolerance:tol,touches:2,firstAt:ps[i].at,lastAt:ps[j].at};
      if(!best||x.lastAt>best.lastAt)best=x;
    }
  }
  return best;
}
function activeFvgs(rows=[]){
  const bullish=[],bearish=[];
  for(let i=2;i<rows.length;i++){
    const old=rows[i-2],cur=rows[i];
    if(cur.low>old.high){
      const z={kind:'BULLISH_FVG',low:old.high,high:cur.low,createdAt:cur.openTime};
      const later=rows.slice(i+1);
      if(!later.some(x=>x.low<=z.low))bullish.push(z);
    }
    if(cur.high<old.low){
      const z={kind:'BEARISH_FVG',low:cur.high,high:old.low,createdAt:cur.openTime};
      const later=rows.slice(i+1);
      if(!later.some(x=>x.high>=z.high))bearish.push(z);
    }
  }
  return{bullish:bullish.slice(-4),bearish:bearish.slice(-4)};
}
function buildLevels({frames={},asOf=Date.now()}={}){
  const m15=closedBars(frames['15m'],asOf),h1=closedBars(frames['1h'],asOf),h4=closedBars(frames['4h'],asOf),d1=closedBars(frames['1d'],asOf),w1=closedBars(frames['1w'],asOf);
  const key=tradeDate(asOf),sessionRows=m15.filter(x=>tradeDate(x.openTime)===key),asia=range(sessionRows.filter(x=>sessionOf(x.openTime)==='ASIA')),london=range(sessionRows.filter(x=>sessionOf(x.openTime)==='LONDON')),ny=range(sessionRows.filter(x=>sessionOf(x.openTime)==='NEW_YORK'));
  const dCur=currentBar(frames['1d'],asOf),wCur=currentBar(frames['1w'],asOf),h1Highs=pivots(h1,'high'),h1Lows=pivots(h1,'low'),h4Highs=pivots(h4,'high'),h4Lows=pivots(h4,'low'),fvg1h=activeFvgs(h1),fvg4h=activeFvgs(h4);
  const prevDay=d1.at(-1)||null,prevWeek=w1.at(-1)||null,eqh=equalCluster(h1,'high'),eql=equalCluster(h1,'low');
  const h4High=h4Highs.at(-1)||null,h4Low=h4Lows.at(-1)||null,lastPrice=m15.at(-1)?.close??h1.at(-1)?.close??null;
  const dr=h4High&&h4Low&&h4High.price>h4Low.price?{high:h4High.price,low:h4Low.price,equilibrium:(h4High.price+h4Low.price)/2,position:lastPrice==null?'UNKNOWN':lastPrice>(h4High.price+h4Low.price)/2?'PREMIUM':lastPrice<(h4High.price+h4Low.price)/2?'DISCOUNT':'EQUILIBRIUM',positionPct:lastPrice==null?null:(lastPrice-h4Low.price)/(h4High.price-h4Low.price)*100,method:'latest confirmed 4H swing high/low proxy'}:null;
  return{
    tradeDate:key,currentSession:sessionOf(asOf),
    previousDay:{high:prevDay?.high??null,low:prevDay?.low??null,open:prevDay?.open??null,close:prevDay?.close??null,at:prevDay?.openTime??null},
    previousWeek:{high:prevWeek?.high??null,low:prevWeek?.low??null,open:prevWeek?.open??null,close:prevWeek?.close??null,at:prevWeek?.openTime??null},
    opens:{day:dCur?.open??null,week:wCur?.open??null,dayAt:dCur?.openTime??null,weekAt:wCur?.openTime??null},
    sessions:{asia,london,newYork:ny},
    swings:{
      h1High:h1Highs.at(-1)||null,h1Low:h1Lows.at(-1)||null,
      h4High,h4Low
    },
    equalLiquidity:{high:eqh,low:eql,method:'1H confirmed pivot cluster · tolerance max(0.1 ATR14, 0.05% price)'},
    dealingRange:dr,
    fvg:{h1:fvg1h,h4:fvg4h}
  };
}
function macroReview(calendar={},asOf=Date.now(),policy={}){
  const hardBeforeMs=(finite(policy.hardBeforeMin)??30)*60000,hardAfterMs=(finite(policy.hardAfterMin)??30)*60000,watchMs=(finite(policy.watchHours)??4)*3600000;
  if(!calendar?.available||!Array.isArray(calendar.items))return{status:'UNKNOWN',clear:null,reason:'macro_calendar_unavailable',nearest:null,policy:{hardBeforeMin:hardBeforeMs/60000,hardAfterMin:hardAfterMs/60000,watchHours:watchMs/3600000}};
  const rows=calendar.items.map(x=>({...x,scheduled_at:finite(x?.scheduled_at)})).filter(x=>x.scheduled_at!=null&&String(x.importance||'high').toLowerCase()==='high').sort((a,b)=>Math.abs(a.scheduled_at-asOf)-Math.abs(b.scheduled_at-asOf));
  const nearest=rows[0]||null;
  if(!nearest)return{status:'CLEAR',clear:true,reason:'no_high_impact_events',nearest:null,policy:{hardBeforeMin:hardBeforeMs/60000,hardAfterMin:hardAfterMs/60000,watchHours:watchMs/3600000}};
  const dt=nearest.scheduled_at-asOf,blocked=dt>=-hardAfterMs&&dt<=hardBeforeMs,watch=Math.abs(dt)<=watchMs,partial=Array.isArray(calendar.errors)&&calendar.errors.length>0;
  return{
    status:blocked?'BLOCKED':partial?'UNKNOWN':watch?'WATCH':'CLEAR',
    clear:blocked?false:partial||watch?null:true,
    reason:blocked?'high_impact_event_window':partial?'macro_calendar_partial':watch?'high_impact_event_nearby':'outside_event_window',
    nearest:{type:nearest.event_type||nearest.title||'EVENT',scheduledAt:nearest.scheduled_at,source:nearest.source_name||nearest.provider||null,minutesAway:dt/60000},
    policy:{hardBeforeMin:hardBeforeMs/60000,hardAfterMin:hardAfterMs/60000,watchHours:watchMs/3600000}
  };
}
function derivativesReview({side='long',fundingRatePct=null,oi4hPct=null,oiObservationTime=null,asOf=Date.now()}={}){
  const funding=finite(fundingRatePct),oi4=finite(oi4hPct),obs=finite(oiObservationTime),ageMin=obs==null?null:Math.max(0,(asOf-obs)/60000);
  if(funding==null||oi4==null||obs==null)return{status:'UNKNOWN',clear:null,reason:'missing_oi_or_funding',fundingRatePct:funding,oi4hPct:oi4,oiAgeMin:ageMin};
  if(ageMin>90)return{status:'UNKNOWN',clear:null,reason:'oi_stale',fundingRatePct:funding,oi4hPct:oi4,oiAgeMin:ageMin};
  const fundingCrowded=side==='short'?funding<-.08:funding>.08,oiCrowded=oi4>8;
  return{
    status:(fundingCrowded||oiCrowded)?'BLOCKED':'CLEAR',
    clear:!(fundingCrowded||oiCrowded),
    reason:fundingCrowded?'funding_crowded':oiCrowded?'oi_acceleration_crowded':'normal_derivatives_band',
    fundingRatePct:funding,oi4hPct:oi4,oiAgeMin:ageMin,
    policy:{fundingCrowdedLongPct:.08,fundingCrowdedShortPct:-.08,oiAccelerationCrowdedPct:8,maxOiAgeMin:90}
  };
}
function executionReview(execution={}){
  const normalized=(execution?.spot||execution?.futures)?execution:execution?.marketType?{[execution.marketType]:execution}:execution;
  const m=SetupExecution.executionMetrics(normalized);
  if(!m.available)return{status:'UNKNOWN',clear:null,reason:'execution_unavailable',...m};
  return{status:m.hardReject?'BLOCKED':'CLEAR',clear:!m.hardReject,reason:m.hardReject?(m.reasons||[]).join(',')||'execution_hard_reject':'execution_within_repository_limits',...m,policy:{spreadHardBps:25,slippageHardBps:50,depth10UsdMin:10000}};
}
function amdStage(plan={},side='long'){
  const s=String(plan?.status||'');
  if(!s||s==='NO_ASIA_RANGE'||s==='WAIT_SWEEP')return'ACCUMULATION';
  if(s==='WAIT_RECLAIM')return side==='long'?'MANIPULATION_SELL_SIDE':'MANIPULATION_BUY_SIDE';
  if(s==='INVALID')return'INVALID';
  if(s.startsWith('NO_'))return'DISTRIBUTION_EXHAUSTED';
  if(/WAIT_MSS|WAIT_DISPLACEMENT|WAIT_ZONE|WAIT_RETRACE|WAIT_REBREAK|READY|BLOCKED/.test(s))return side==='long'?'DISTRIBUTION_UP':'DISTRIBUTION_DOWN';
  return'OBSERVE';
}
function buildContext({frames={},asOf=Date.now(),macroCalendar=null,row={},execution=null,longEntry=null,shortEntry=null}={}){
  const levels=buildLevels({frames,asOf}),macro=macroReview(macroCalendar||{},asOf),longDerivatives=derivativesReview({side:'long',fundingRatePct:row.fundingRatePct,oi4hPct:row.oi4hPct,oiObservationTime:row.oiObservationTime,asOf}),shortDerivatives=derivativesReview({side:'short',fundingRatePct:row.fundingRatePct,oi4hPct:row.oi4hPct,oiObservationTime:row.oiObservationTime,asOf}),orders=executionReview(execution||{});
  return{
    version:'CHARTBRO_CONTEXT_v1',asOf,levels,
    reviews:{macro,longDerivatives,shortDerivatives,execution:orders},
    amd:{long:amdStage(longEntry,'long'),short:amdStage(shortEntry,'short')},
    conflict:Boolean(longEntry?.sweep&&shortEntry?.sweep&&amdStage(longEntry,'long').startsWith('DISTRIBUTION')&&amdStage(shortEntry,'short').startsWith('DISTRIBUTION'))
  };
}
module.exports={finite,closedBars,currentBar,tradeDate,sessionOf,range,pivots,equalCluster,activeFvgs,buildLevels,macroReview,derivativesReview,executionReview,amdStage,buildContext};

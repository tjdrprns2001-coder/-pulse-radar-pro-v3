'use strict';

const TIMEFRAMES=Object.freeze(['1w','1d','4h','1h','15m','5m']);
const CONFIG=Object.freeze({
  oiPeriodMs:3600000,
  oiLookbackHours:4,
  minOi4hPct:1,
  minOiSuccessRate:0.95,
  takerWeak:0.80,
  takerImprove:1.20,
  takerStrong:1.50,
  takerCrossMaxDiff:0.20,
  transitionRvol15m:1.0,
  ignitionRvol15m:3.0,
  fundingCrowdedLongPct:0.08,
  resistanceAtrRisk:0.50,
  pivotBars:2,
  htfDiscountPct:35,
  midTermPremiumPct:80,
  nfbFundingPct:-1.0,
  provisionalParams:['htfDiscountPct','midTermPremiumPct','nfbFundingPct']
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function confirmed(rows=[],asOf=Date.now()){return(Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&finite(x[4])!=null&&(finite(x[6])==null||finite(x[6])<asOf))}
function deriveClosedOi(profile={},asOf=Date.now(),config=CONFIG){
  const rows=(Array.isArray(profile?.rows)?profile.rows:[]).map(x=>({...x,timestamp:finite(x?.timestamp),sumOpenInterest:finite(x?.sumOpenInterest),sumOpenInterestValue:finite(x?.sumOpenInterestValue)})).filter(x=>x.timestamp!=null&&x.sumOpenInterest>0).sort((a,b)=>a.timestamp-b.timestamp);
  const closed=rows.filter(x=>x.timestamp+config.oiPeriodMs<=asOf),last=closed.at(-1)||null;
  if(!last)return{status:'MISSING',pass:false,oi4hPct:null,oi8hPct:null,observationTime:null,referenceTime:null,rows:closed};
  const ref4ts=last.timestamp-config.oiLookbackHours*3600000,ref8ts=last.timestamp-8*3600000,ref4=closed.find(x=>x.timestamp===ref4ts)||null,ref8=closed.find(x=>x.timestamp===ref8ts)||null;
  if(!ref4)return{status:'MISMATCHED_WINDOW',pass:false,oi4hPct:null,oi8hPct:null,observationTime:last.timestamp,referenceTime:ref4ts,oiRawContracts:last.sumOpenInterest,oiValueUsdt:last.sumOpenInterestValue,rows:closed};
  const oi4=((last.sumOpenInterest/ref4.sumOpenInterest)-1)*100,oi8=ref8?((last.sumOpenInterest/ref8.sumOpenInterest)-1)*100:null;
  return{status:'SUCCESS',pass:oi4>config.minOi4hPct,oi4hPct:oi4,oi8hPct:oi8,observationTime:last.timestamp,referenceTime:ref4.timestamp,oiRawContracts:last.sumOpenInterest,oiValueUsdt:last.sumOpenInterestValue,oiSource:'Binance futures/data/openInterestHist 1h exact-window',rows:closed};
}
function takerZone(v,config=CONFIG){const x=finite(v);if(x==null)return'MISSING';if(x<config.takerWeak)return'TAKER_WEAK';if(x<config.takerImprove)return'TAKER_NEUTRAL';if(x<config.takerStrong)return'TAKER_IMPROVE';return'TAKER_STRONG'}
function atr14(rows=[],asOf=Date.now()){
  const a=confirmed(rows,asOf);if(a.length<15)return null;const tr=[];for(let i=1;i<a.length;i++){const h=finite(a[i][2]),l=finite(a[i][3]),pc=finite(a[i-1][4]);if(h==null||l==null||pc==null)continue;tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return tr.length>=14?tr.slice(-14).reduce((s,x)=>s+x,0)/14:null;
}
function pivotLevels(rows=[],asOf=Date.now(),n=CONFIG.pivotBars){
  const a=confirmed(rows,asOf);let lastHigh=null,lastLow=null;
  for(let i=n;i<a.length-n;i++){
    const h=finite(a[i][2]),l=finite(a[i][3]);if(h==null||l==null)continue;
    const left=a.slice(i-n,i),right=a.slice(i+1,i+n+1);
    if(left.every(x=>h>finite(x[2]))&&right.every(x=>h>finite(x[2])))lastHigh={price:h,time:finite(a[i][6])};
    if(left.every(x=>l<finite(x[3]))&&right.every(x=>l<finite(x[3])))lastLow={price:l,time:finite(a[i][6])};
  }
  const last=a.at(-1)||null,close=finite(last?.[4]),high=finite(last?.[2]),low=finite(last?.[3]),sellSide=lastLow&&low<lastLow.price&&close>lastLow.price,buySide=lastHigh&&high>lastHigh.price&&close<lastHigh.price;
  return{support:lastLow?.price??null,resistance:lastHigh?.price??null,supportTime:lastLow?.time??null,resistanceTime:lastHigh?.time??null,sweepCandidate:{sellSide:Boolean(sellSide),buySide:Boolean(buySide)},atr14:atr14(rows,asOf)};
}
function rangePosition(rows=[],asOf=Date.now(),lookback=52){
  const a=confirmed(rows,asOf).slice(-lookback);if(a.length<5)return null;const lows=a.map(x=>finite(x[3])).filter(Number.isFinite),highs=a.map(x=>finite(x[2])).filter(Number.isFinite),close=finite(a.at(-1)?.[4]);if(!lows.length||!highs.length||close==null)return null;const lo=Math.min(...lows),hi=Math.max(...highs);return hi>lo?((close-lo)/(hi-lo))*100:null;
}
function marketFlags(market={}){return{regime:String(market?.regime||'NEUTRAL').toUpperCase(),breadthRatio:finite(market?.breadthRatio),volumeWeightedBreadth:finite(market?.volumeWeightedBreadth??market?.positiveVolumeRatio),btc24hChange:finite(market?.btc24hChange),eth24hChange:finite(market?.eth24hChange)}}
function crossStatus(c){return String(c?.status||'MISSING').toUpperCase()}
function direction(row={}){
  const h1=row.tf?.['1h']||{},m15=row.tf?.['15m']||{},tz=takerZone(row.takerCross?.['15m']?.endpointRatio);
  if(h1.available&&m15.available&&h1.above20&&m15.above20&&(h1.macdUp||m15.macdUp)&&tz!=='TAKER_WEAK')return'LONG_BIAS';
  if((h1.available&&h1.above20===false&&!h1.macdUp)||(m15.available&&m15.above20===false&&!m15.macdUp)||tz==='TAKER_WEAK')return'LONG_RISK';
  return'NEUTRAL';
}
function spotStatus(row={}){if(row.spotMapping?.confidence!=='HIGH'||finite(row.spotPriceChange24h)==null)return'NOT_AVAILABLE';return'VERIFIED'}
function quality(row={},okxStatus='NOT_AVAILABLE'){
  const missing=[],warmup=[],core=['1w','1d','4h','1h','15m','5m'];for(const tf of core){const m=row.tf?.[tf];if(!m?.available)missing.push(`tf:${tf}`);else if((finite(m.bars)||0)<120)warmup.push(`tf:${tf}:WARMUP_SHORT`)}
  if(finite(row.oi4hPct)==null)missing.push('oi4h');
  const t15=crossStatus(row.takerCross?.['15m']);if(['MISSING','TIME_MISMATCH','CONFLICT'].includes(t15))missing.push(`taker15m:${t15}`);
  const t1=crossStatus(row.takerCross?.['1h']);if(['MISSING','TIME_MISMATCH','CONFLICT'].includes(t1))missing.push(`taker1h:${t1}`);
  const spot=spotStatus(row),status=missing.length?'FAILED':warmup.length||spot!=='VERIFIED'||okxStatus!=='VERIFIED'?'PARTIAL':'VERIFIED';
  return{status,missingFields:missing,warmup,spotStatus:spot,okxStatus,crossValidationQuality:okxStatus==='VERIFIED'?'VERIFIED':okxStatus==='FAILED'?'PARTIAL':'PARTIAL'};
}
function evidence(row={},extras={},config=CONFIG){
  const positive=[],counter=[],h1=row.tf?.['1h']||{},m15=row.tf?.['15m']||{},r15=finite(m15.rvol),t15=finite(row.takerCross?.['15m']?.endpointRatio),fund=finite(row.fundingRatePct),spot=finite(row.spotPriceChange24h),fut=finite(row.priceChange24h),res=finite(extras.pivot15m?.resistance),atr=finite(extras.pivot15m?.atr14),px=finite(row.lastPrice);
  if(finite(row.oi4hPct)>config.minOi4hPct)positive.push('OI_4H_BUILD');
  if(h1.above20&&h1.macdUp)positive.push('1H_STRUCTURE_IMPROVING');
  if(m15.above20&&m15.macdUp)positive.push('15M_TRANSITION_IMPROVING');
  if(t15>=config.takerStrong)positive.push('TAKER_STRONG');else if(t15>=config.takerImprove)positive.push('TAKER_IMPROVE');
  if(r15>=config.ignitionRvol15m)positive.push('15M_RVOL_IGNITION');else if(r15>=config.transitionRvol15m)positive.push('15M_RVOL_RECOVERY');
  if(spot!=null&&fut!=null&&spot>=0&&fut>=0)positive.push('SPOT_FUTURES_ALIGNED');
  if(t15!=null&&t15<config.takerWeak)counter.push(`TAKER_WEAK_${t15.toFixed(2)}`);
  if(finite(h1.rsi14)>=70)counter.push(`1H_RSI_OVERHEATED_${finite(h1.rsi14).toFixed(1)}`);
  if(spot!=null&&fut!=null&&fut-spot>3)counter.push(`DERIVATIVE_LED_GAP_${(fut-spot).toFixed(2)}P`);
  if(fund!=null&&fund>config.fundingCrowdedLongPct)counter.push(`FUNDING_CROWDED_${fund.toFixed(3)}P`);
  if(res!=null&&atr>0&&px!=null&&res>px&&((res-px)/atr)<config.resistanceAtrRisk)counter.push(`RESISTANCE_WITHIN_${((res-px)/atr).toFixed(2)}ATR`);
  if(extras.pivot15m?.sweepCandidate?.sellSide&&!m15.macdUp)counter.push('15M_RECLAIM_NOT_CONFIRMED');
  if(r15!=null&&r15<config.ignitionRvol15m)counter.push(`IGNITION_RVOL_NOT_CONFIRMED_${r15.toFixed(2)}X`);
  if(!counter.length)counter.push('NO_MAJOR_COUNTEREVIDENCE_BUT_NEXT_CONFIRMATION_REQUIRED');
  return{positive,counter};
}
function classify(row={},context={},config=CONFIG){
  const market=marketFlags(context.market),frames=context.frames||{},okxStatus=context.okxStatus||'NOT_AVAILABLE',q=quality(row,okxStatus),dir=direction(row),h1=row.tf?.['1h']||{},m15=row.tf?.['15m']||{},r15=finite(m15.rvol),t15=finite(row.takerCross?.['15m']?.endpointRatio),t1=finite(row.takerCross?.['1h']?.endpointRatio),oi4=finite(row.oi4hPct),fund=finite(row.fundingRatePct),spot=finite(row.spotPriceChange24h),fut=finite(row.priceChange24h);
  const pivot15m=pivotLevels(frames['15m']||[],row.asOf,config.pivotBars),weeklyPos=rangePosition(frames['1w']||[],row.asOf,52),dailyPos=rangePosition(frames['1d']||[],row.asOf,120),flags={htfDiscount:weeklyPos!=null&&weeklyPos<=config.htfDiscountPct,midTermPremium:dailyPos!=null&&dailyPos>=config.midTermPremiumPct,nfbHint:fund!=null&&fund<=config.nfbFundingPct&&oi4>config.minOi4hPct,weeklyRangePositionPct:weeklyPos,dailyRangePositionPct:dailyPos,provisionalThresholds:{htfDiscountPct:config.htfDiscountPct,midTermPremiumPct:config.midTermPremiumPct,nfbFundingPct:config.nfbFundingPct}};
  const ev=evidence(row,{pivot15m},config),spotAligned=spot!=null&&fut!=null&&((spot>=0&&fut>=0)||(spot<0&&fut<0)),takerOk=crossStatus(row.takerCross?.['15m'])==='PASS',oneHourTakerOk=crossStatus(row.takerCross?.['1h'])==='PASS',overheated=finite(h1.rsi14)>=70||(Math.abs(fut||0)>=9&&r15>=3),shortBuild=oi4>config.minOi4hPct&&(t15!=null&&t15<config.takerWeak||dir==='LONG_RISK'),ignition=oi4>config.minOi4hPct&&dir==='LONG_BIAS'&&r15>=config.ignitionRvol15m&&takerOk&&t15>=config.takerImprove&&oneHourTakerOk&&t1>=config.takerWeak&&spotAligned&&!(fund>config.fundingCrowdedLongPct),transition=oi4>config.minOi4hPct&&dir!=='LONG_RISK'&&(h1.macdUp||m15.macdUp)&&r15>=config.transitionRvol15m&&takerOk&&t15>=config.takerImprove,accumulation=oi4>config.minOi4hPct&&Math.abs(fut||0)<=5&&h1.above20!==false&&t15>=config.takerWeak&&(spotAligned||spot==null);
  let key='INCOMPLETE',stage='INCOMPLETE',label='⚪ INCOMPLETE';
  if(q.status==='FAILED'){key='DATA_DEGRADED';stage='DATA_DEGRADED';label='⚠️ DATA_DEGRADED'}
  else if(overheated){key='OVERHEATED';stage='OVERHEATED';label='🔵 OVERHEATED'}
  else if(shortBuild){key='SHORT_BUILD_RISK';stage='BUILD_RISK';label='🟠 SHORT_BUILD_RISK'}
  else if(ignition){key='IGNITION_CONFIRMED';stage='IGNITION';label='🔥 IGNITION_CONFIRMED'}
  else if(transition){key='TRANSITION_WATCH';stage='TRANSITION';label='🟡 TRANSITION_WATCH'}
  else if(accumulation){key='ACCUMULATION_CANDIDATE';stage='PREP';label='🟢 ACCUMULATION_CANDIDATE'}
  else if(oi4>config.minOi4hPct){key='OI_BUILD';stage='BUILD';label='⚪ OI_BUILD'}
  const priority=(key==='IGNITION_CONFIRMED'?90:key==='TRANSITION_WATCH'?75:key==='ACCUMULATION_CANDIDATE'?65:key==='OI_BUILD'?50:key==='SHORT_BUILD_RISK'?35:key==='OVERHEATED'?25:10)+(flags.htfDiscount?5:0)-(flags.midTermPremium?5:0);
  const signalConfidence=key==='IGNITION_CONFIRMED'?'HIGH':['TRANSITION_WATCH','ACCUMULATION_CANDIDATE'].includes(key)?'MEDIUM':'LOW',crossValidationQuality=q.crossValidationQuality;
  const nextConfirmation=key==='IGNITION_CONFIRMED'?'15m 구조 유지와 다음 확정봉 추적':key==='TRANSITION_WATCH'?'15m RVOL 3x + 구조 돌파 + true taker 유지':key==='ACCUMULATION_CANDIDATE'?'1H/15m 전환 + taker >1.20':key==='OI_BUILD'?'1H 구조와 15m true taker 개선':'데이터/반증 해소';
  return{key,stage,label,direction:dir,priority:Math.max(0,Math.min(100,priority)),signalConfidence,crossValidationQuality,dataQuality:q,positiveEvidence:ev.positive,counterEvidence:ev.counter,nextConfirmation,invalidationLevel:pivot15m.support,pivot15m,flags,takerZones:{'1h':takerZone(t1,config),'15m':takerZone(t15,config),'5m':takerZone(row.takerCross?.['5m']?.endpointRatio,config)},market};
}

module.exports={TIMEFRAMES,CONFIG,deriveClosedOi,takerZone,pivotLevels,rangePosition,marketFlags,quality,direction,evidence,classify};

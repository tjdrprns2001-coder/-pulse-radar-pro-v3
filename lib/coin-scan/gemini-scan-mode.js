'use strict';

const TIMEFRAMES=Object.freeze(['1w','1d','4h','1h','15m','5m']);
const CONFIG=Object.freeze({
  strongBreadth:0.60,
  weakBreadth:0.30,
  oiGateStrongPct:1.0,
  oiGateNeutralPct:1.5,
  oiGateWeakPct:2.5,
  ignitionRvol:3.0,
  sessionRvolWatch:1.6,
  takerStrong:1.5,
  takerImprove:1.2,
  fundingCrowdedLongPct:0.08,
  sweepTakerStrong:1.5,
  sameSlotDays:5,
  scoreA:80,
  scoreB:65,
  scoreC:50,
  provisionalParams:['oiGateStrongPct','oiGateNeutralPct','oiGateWeakPct','sessionRvolWatch']
});
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(a=[]){const x=a.map(finite).filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function dynamicOiThreshold(market={},config=CONFIG){const b=finite(market.breadthRatio);return b!=null&&b>=config.strongBreadth?config.oiGateStrongPct:b!=null&&b<config.weakBreadth?config.oiGateWeakPct:config.oiGateNeutralPct}
function oiPass(item={},market={},config=CONFIG){const t=dynamicOiThreshold(market,config),oi=finite(item.oi4hPct);return{...item,geminiOiThresholdPct:t,pass:item.status==='SUCCESS'&&oi!=null&&oi>t}}
function confirmed(rows=[],asOf=Date.now()){return(Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&finite(x[4])!=null&&(finite(x[6])==null||finite(x[6])<asOf))}
function sameSlotRvol(rows=[],asOf=Date.now(),days=CONFIG.sameSlotDays){const a=confirmed(rows,asOf);if(a.length<3)return null;const last=a.at(-1),open=finite(last[0]),vol=finite(last[5]),day=86400000;if(open==null||vol==null)return null;const slot=((open%day)+day)%day,vs=a.slice(0,-1).filter(x=>{const t=finite(x[0]);return t!=null&&((t%day)+day)%day===slot&&open-t<=day*(days+1)}).map(x=>finite(x[5])).filter(Number.isFinite).slice(-days),base=avg(vs);return base>0?vol/base:null}
function takerTrend(series=[],periodMs=900000,asOf=Date.now()){const x=(Array.isArray(series)?series:[]).filter(r=>finite(r?.timestamp)!=null&&finite(r.timestamp)+periodMs<=asOf).slice(-5).map(r=>finite(r.ratio??r.buySellRatio)).filter(Number.isFinite);if(!x.length)return{count:0,last:null,avg:null,trend:'MISSING',strongCount:0};return{count:x.length,last:x.at(-1),avg:avg(x),trend:x.at(-1)>x[0]?'IMPROVING':x.at(-1)<x[0]?'WEAKENING':'FLAT',strongCount:x.filter(v=>v>=1.2).length}}
function pivotSweep(rows=[],asOf=Date.now(),n=2){const a=confirmed(rows,asOf);if(a.length<2*n+3)return{support:null,resistance:null,sellSide:false,buySide:false};let low=null,high=null;for(let i=n;i<a.length-n;i++){const l=finite(a[i][3]),h=finite(a[i][2]),left=a.slice(i-n,i),right=a.slice(i+1,i+n+1);if(left.every(x=>l<finite(x[3]))&&right.every(x=>l<finite(x[3])))low=l;if(left.every(x=>h>finite(x[2]))&&right.every(x=>h<finite(x[2])))high=h}const last=a.at(-1),lo=finite(last?.[3]),hi=finite(last?.[2]),c=finite(last?.[4]);return{support:low,resistance:high,sellSide:low!=null&&lo<low&&c>low,buySide:high!=null&&hi>high&&c<high}}
function priceOiDelta(row={}){const oi=finite(row.oi4hPct),p=finite(row.priceChange24h);if(oi==null||p==null)return{ratio:null,label:'MISSING'};const ratio=oi/Math.max(.5,Math.abs(p));let label='BALANCED';if(Math.abs(p)<=3&&oi>=2)label='POSITION_BUILD';else if(p>3&&oi<0)label='SHORT_COVER_RISK';else if(p<0&&oi>1)label='SHORT_BUILD_RISK';return{ratio,label}}
function classify(row={},context={},config=CONFIG){
  const h4=row.tf?.['4h']||{},h1=row.tf?.['1h']||{},m15=row.tf?.['15m']||{},m5=row.tf?.['5m']||{},market=context.market||{},threshold=dynamicOiThreshold(market,config),r15=sameSlotRvol(context.frames?.['15m']||[],row.asOf,config.sameSlotDays),r5=sameSlotRvol(context.frames?.['5m']||[],row.asOf,config.sameSlotDays),tt=takerTrend(context.taker15mSeries||[],900000,row.asOf),delta=priceOiDelta(row),sweep=pivotSweep(context.frames?.['15m']||[],row.asOf,2),t15=finite(row.takerCross?.['15m']?.endpointRatio),spot=finite(row.spotPriceChange24h),fut=finite(row.priceChange24h),fund=finite(row.fundingRatePct),spotAligned=spot!=null&&fut!=null&&((spot>=0&&fut>=0)||(spot<0&&fut<0)),htf=h4.above20!==false&&h1.above20!==false,oiOk=finite(row.oi4hPct)>threshold,sweepTaker=Boolean(sweep.sellSide&&t15>=config.sweepTakerStrong);
  let score=0;score+=market.breadthRatio>=config.strongBreadth?10:market.breadthRatio<config.weakBreadth?2:6;if(oiOk)score+=15;if(delta.label==='POSITION_BUILD')score+=10;else if(delta.label==='SHORT_COVER_RISK')score-=8;if(h4.above20)score+=12;if(h4.macdUp)score+=6;if(h1.above20)score+=10;if(h1.macdUp)score+=6;if((r15??finite(m15.rvol))>=config.ignitionRvol)score+=12;else if((r15??finite(m15.rvol))>=config.sessionRvolWatch)score+=7;if((r5??finite(m5.rvol))>=config.sessionRvolWatch)score+=4;if(t15>=config.takerStrong)score+=10;else if(t15>=config.takerImprove)score+=6;if(tt.strongCount>=3)score+=5;if(spotAligned)score+=6;if(sweepTaker)score+=8;if(fund>config.fundingCrowdedLongPct)score-=8;score=Math.max(0,Math.min(100,Math.round(score)));
  const evidence=[],risks=[];if(delta.label==='POSITION_BUILD')evidence.push('OI_PRICE_POSITION_BUILD');if(tt.strongCount>=3)evidence.push(`TAKER_CONTINUITY_${tt.strongCount}/5`);if(sweepTaker)evidence.push('SSL_SWEEP_PLUS_STRONG_TAKER');if(spotAligned)evidence.push('SPOT_FUTURES_ALIGNED');if(r15!=null)evidence.push(`TIME_WEIGHTED_RVOL15_${r15.toFixed(2)}X`);
  if(delta.label==='SHORT_COVER_RISK')risks.push('PRICE_UP_OI_DOWN');if(delta.label==='SHORT_BUILD_RISK')risks.push('PRICE_DOWN_OI_UP');if(fund>config.fundingCrowdedLongPct)risks.push('FUNDING_CROWDED');if(!htf)risks.push('HTF_NOT_ALIGNED');if(t15!=null&&t15<1)risks.push('TAKER_NOT_BUY_DOMINANT');
  const ignite=oiOk&&htf&&(r15??finite(m15.rvol))>=config.ignitionRvol&&t15>=config.takerImprove&&spotAligned,ready=oiOk&&htf&&t15>=1&&((r15??finite(m15.rvol))>=config.sessionRvolWatch||delta.label==='POSITION_BUILD');
  let key='GEMINI_HOLD',label='⏸ GEMINI_HOLD';if(score>=config.scoreA&&ignite){key='GEMINI_ALPHA';label='🔥 GEMINI_ALPHA'}else if(score>=config.scoreB&&ready){key='GEMINI_READY';label='🟡 GEMINI_READY'}else if(score>=config.scoreC){key='GEMINI_WATCH';label='⚪ GEMINI_WATCH'}else if(risks.includes('PRICE_UP_OI_DOWN')||risks.includes('PRICE_DOWN_OI_UP')){key='GEMINI_RISK';label='🟠 GEMINI_RISK'}
  return{key,label,score,evidence,risks,marketOiThresholdPct:threshold,priceOiDelta:delta,timeWeightedRvol:{'15m':r15,'5m':r5},takerTrend:tt,sweep,sweepTakerConfirmed:sweepTaker,gate:{oi:oiOk,htf,ignitionRvol:(r15??finite(m15.rvol))>=config.ignitionRvol,taker:t15>=config.takerImprove,spot:spotAligned}};
}
module.exports={TIMEFRAMES,CONFIG,dynamicOiThreshold,oiPass,sameSlotRvol,takerTrend,pivotSweep,priceOiDelta,classify};

'use strict';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function close(r){return Array.isArray(r)?finite(r[4]):finite(r?.close)}
function open(r){return Array.isArray(r)?finite(r[1]):finite(r?.open)}
function high(r){return Array.isArray(r)?finite(r[2]):finite(r?.high)}
function low(r){return Array.isArray(r)?finite(r[3]):finite(r?.low)}
function volume(r){return Array.isArray(r)?finite(r[5]):finite(r?.volume)}
function closeTime(r){return Array.isArray(r)?finite(r[6]):finite(r?.closeTime)}
function completed(rows=[],now=Date.now()){
  return(Array.isArray(rows)?rows:[]).filter(r=>{
    const c=close(r),ct=closeTime(r);
    return c!=null&&(ct==null||ct<=now)&&r?.partial!==true;
  });
}
function avg(a=[]){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function stdev(a=[]){const x=a.filter(Number.isFinite);if(x.length<2)return null;const m=avg(x);return Math.sqrt(avg(x.map(v=>(v-m)**2)))}
function zscore(v,history=[]){const s=stdev(history),m=avg(history);return v!=null&&m!=null&&s>0?(v-m)/s:null}
function atrSeries(rows=[],period=14){
  const a=completed(rows),tr=[];
  for(let i=0;i<a.length;i++){const pc=i?close(a[i-1]):close(a[i]);const h=high(a[i]),l=low(a[i]);tr.push(h!=null&&l!=null&&pc!=null?Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)):null)}
  const out=[];for(let i=0;i<tr.length;i++)out.push(i>=period-1?avg(tr.slice(i-period+1,i+1)):null);return out;
}
function percentileRank(v,history=[]){const x=history.filter(Number.isFinite);if(v==null||!x.length)return null;return 100*x.filter(n=>n<=v).length/x.length}
function bodyRatio(r){const h=high(r),l=low(r),o=open(r),c=close(r);return h!=null&&l!=null&&h>l&&o!=null&&c!=null?Math.abs(c-o)/(h-l):null}
function closeLocation(r){const h=high(r),l=low(r),c=close(r);return h!=null&&l!=null&&h>l&&c!=null?(c-l)/(h-l):null}
function linSlope(a=[]){const x=a.filter(Number.isFinite);if(x.length<2)return null;const n=x.length,mx=(n-1)/2,my=avg(x);let num=0,den=0;for(let i=0;i<n;i++){num+=(i-mx)*(x[i]-my);den+=(i-mx)**2}return den?num/den:null}
function confirmedSwingLows(rows=[],left=2,right=2){
  const a=completed(rows),out=[];
  for(let i=left;i<a.length-right;i++){const v=low(a[i]);if(v==null)continue;let ok=true;for(let j=i-left;j<=i+right;j++){if(j===i)continue;if(low(a[j])==null||low(a[j])<=v){ok=false;break}}if(ok)out.push({index:i,price:v,confirmedIndex:i+right,confirmedAt:closeTime(a[i+right])})}
  return out;
}
function confirmedSwingHighs(rows=[],left=2,right=2){
  const a=completed(rows),out=[];
  for(let i=left;i<a.length-right;i++){const v=high(a[i]);if(v==null)continue;let ok=true;for(let j=i-left;j<=i+right;j++){if(j===i)continue;if(high(a[j])==null||high(a[j])>=v){ok=false;break}}if(ok)out.push({index:i,price:v,confirmedIndex:i+right,confirmedAt:closeTime(a[i+right])})}
  return out;
}
function shockFeatures(rows=[],profile={}){
  const a=completed(rows);if(a.length<40)return{score:0,available:false};
  const closes=a.map(close),rets12=[];
  for(let i=12;i<closes.length;i++)if(closes[i-12])rets12.push((closes[i]/closes[i-12]-1));
  const current12=rets12.at(-1),hist12=rets12.slice(-61,-1),rz=zscore(current12,hist12);
  const atr=atrSeries(a,14),atrNow=atr.at(-1),atrPct=percentileRank(atrNow,atr.slice(-91,-1));
  const redVol=a.map(r=>close(r)<open(r)?volume(r):0),rv=redVol.at(-1),rvz=zscore(rv,redVol.slice(-21,-1));
  const oi4=finite(profile.oi4hPct),priceDownOiUp=current12!=null&&current12<0&&oi4!=null&&oi4>0;
  let score=0;if(rz!=null&&rz<=-2)score+=25;if(atrPct!=null&&atrPct>=70)score+=20;if(rvz!=null&&rvz>=1.5)score+=20;if(priceDownOiUp)score+=20;
  const liquidationZ=finite(profile.sellLiquidationZ);if(liquidationZ!=null&&liquidationZ>=1.5)score+=15;
  return{available:true,score:Math.min(100,score),returns12Z:rz,atrPercentile:atrPct,sellVolumeZ:rvz,priceDownOiUp,sellLiquidationZ:liquidationZ};
}
function detectSweepMssZone(rows=[],opts={}){
  const a=completed(rows),atr=atrSeries(a,14);if(a.length<24)return{available:false};
  const swings=confirmedSwingLows(a,2,2).filter(x=>x.confirmedIndex<a.length-1);
  if(!swings.length)return{available:false};
  let sweep=null;
  for(let i=Math.max(5,a.length-8);i<a.length;i++){
    const prior=swings.filter(x=>x.confirmedIndex<i).at(-1);if(!prior)continue;
    const tol=Math.max((atr[i]||0)*0.05,0),r=a[i];
    if(low(r)<prior.price-tol&&close(r)>prior.price&&closeLocation(r)>=0.60){sweep={index:i,priorLow:prior.price,sweepLow:low(r),reclaimClose:close(r),closeLocation:closeLocation(r)};break}
  }
  if(!sweep)return{available:true,sweepReclaimed:false};
  const lowsAfter=a.slice(sweep.index+1).map(low).filter(Number.isFinite),noNewLow=!lowsAfter.length||Math.min(...lowsAfter)>=sweep.sweepLow;
  let mss=false,mssIndex=null,postSweepLowerHigh=null;
  for(let i=sweep.index+2;i<a.length;i++){
    const between=a.slice(sweep.index+1,i);if(!between.length)continue;
    const lh=Math.max(...between.map(high).filter(Number.isFinite));const r=a[i];
    if(close(r)>lh&&bodyRatio(r)>=0.55&&closeLocation(r)>=0.65){mss=true;mssIndex=i;postSweepLowerHigh=lh;break}
  }
  let zone=null;
  const start=mssIndex!=null?Math.max(sweep.index+1,mssIndex-1):sweep.index+1;
  for(let i=start;i<a.length;i++){
    if(i<2)continue;
    const priorHigh=high(a[i-2]),curLow=low(a[i]);
    if(priorHigh!=null&&curLow!=null&&curLow>priorHigh){zone={lower:priorHigh,upper:curLow,originIndex:i-2,knownIndex:i,createdAt:closeTime(a[i]),state:'ACTIVE'};break}
  }
  let retestValid=false,higherLowConfirmed=false,zoneCloseBreak=false;
  if(zone){
    for(let i=zone.knownIndex+1;i<a.length;i++){
      const r=a[i],touch=low(r)<=zone.upper&&high(r)>=zone.lower;
      if(close(r)<zone.lower){zoneCloseBreak=true;zone={...zone,state:'INVALIDATED',invalidatedIndex:i};break}
      if(touch){retestValid=close(r)>=zone.lower&&low(r)>=sweep.sweepLow;zone={...zone,state:'TOUCHED',touchedIndex:i};}
    }
    if(retestValid){const recent=a.slice(-4).map(low).filter(Number.isFinite);higherLowConfirmed=recent.length>=2&&Math.min(...recent)>sweep.sweepLow}
  }
  const last=a.at(-1),sweepLowCloseBreak=close(last)<sweep.sweepLow;
  return{available:true,sweepReclaimed:true,noNewLow,mssConfirmed:mss,mssIndex,postSweepLowerHigh,zoneCreated:Boolean(zone),zone,retestValid,higherLowConfirmed,sweepLow:sweep.sweepLow,sweepLowCloseBreak,zoneCloseBreak};
}
function resistanceAndCompression(rows=[]){
  const a=completed(rows),atr=atrSeries(a,14);if(a.length<40)return{available:false,compressionScore:0,resistanceDefined:false};
  const swings=confirmedSwingHighs(a,2,2).filter(x=>x.confirmedIndex<a.length-5);
  const resistance=swings.at(-1)?.price??Math.max(...a.slice(-30,-5).map(high).filter(Number.isFinite));
  const resistanceDefined=Number.isFinite(resistance),last=a.at(-1),atrNow=atr.at(-1);
  const atrPct=percentileRank(atrNow,atr.slice(-91,-1));
  const recent=a.slice(-5),ranges=recent.map(r=>high(r)-low(r));
  const downVolumes=recent.map(r=>close(r)<open(r)?volume(r):0);
  const lows=recent.map(low);
  const rangeSlope=linSlope(ranges),downVolumeSlope=linSlope(downVolumes),lowSlope=linSlope(lows);
  const band=atrNow!=null?Math.max(.15*atrNow,0):0;
  const p=close(last),near=resistanceDefined&&p!=null&&resistance>0?p>=(resistance-band*3):false;
  const closeLocationToResistance=resistanceDefined&&p!=null&&resistance>0?Math.max(0,Math.min(1,1-Math.abs(resistance-p)/Math.max(band*5,resistance*.02))):null;
  const checks=[
    atrPct!=null&&atrPct<=35,
    rangeSlope!=null&&rangeSlope<0,
    downVolumeSlope!=null&&downVolumeSlope<0,
    lowSlope!=null&&lowSlope>0,
    near&&closeLocationToResistance!=null&&closeLocationToResistance>=.60
  ];
  const compressionScore=100*checks.filter(Boolean).length/checks.length;
  return{available:true,resistanceDefined,resistance,atr:atrNow,atrPercentile:atrPct,rangeSlope,downVolumeSlope,lowsAreHigher:lowSlope!=null&&lowSlope>0,nearResistance:near,closeLocationToResistance,compressionScore};
}
function breakoutFeatures(rows=[],base={}){
  const a=completed(rows);if(!base?.resistanceDefined||a.length<25)return{...base,closeAboveResistance:false,volumeConfirmed:false,breakoutBodyConfirmed:false,retestHolds:false};
  const r=base.resistance,atr=base.atr||0,buffer=Math.max(.10*atr,0);
  const vols=a.map(volume).filter(Number.isFinite),volumeZ=zscore(vols.at(-1),vols.slice(-21,-1));
  const last=a.at(-1);
  const closeAboveResistance=close(last)>r+buffer;
  const breakoutBodyConfirmed=bodyRatio(last)>=.55&&closeLocation(last)>=.70;
  const volumeConfirmed=volumeZ!=null&&volumeZ>=1.0;
  let breakoutIndex=null;
  for(let i=Math.max(1,a.length-5);i<a.length;i++){
    const x=a[i],hist=a.slice(Math.max(0,i-20),i).map(volume).filter(Number.isFinite),vz=zscore(volume(x),hist);
    if(close(x)>r+buffer&&bodyRatio(x)>=.55&&closeLocation(x)>=.70&&vz!=null&&vz>=1){breakoutIndex=i;break}
  }
  let retestHolds=false,closeBackBelowResistance=false,retestLowBreak=false,retestLow=null;
  if(breakoutIndex!=null){
    const after=a.slice(breakoutIndex+1,breakoutIndex+5);
    for(const x of after){if(close(x)<r){closeBackBelowResistance=true;break}if(low(x)<=r+Math.max(.15*atr,0)){retestLow=retestLow==null?low(x):Math.min(retestLow,low(x));retestHolds=close(x)>=r}}
    if(retestLow!=null&&close(last)<retestLow)retestLowBreak=true;
  }
  return{...base,closeAboveResistance,volumeConfirmed,volumeZ,breakoutBodyConfirmed,breakoutIndex,retestHolds,closeBackBelowResistance,retestLowBreak,retestLow};
}
function build({frames={},derivativesProfile=null,v2Profile=null,execution=null,data=null,eventRisk=null,now=Date.now()}={}){
  const p=v2Profile||derivativesProfile?.v2Profile||derivativesProfile||{};
  const h1=frames['1h']||[],m15=frames['15m']||[],m5=frames['5m']||[];
  const shock=shockFeatures(h1,p),bottomStruct=detectSweepMssZone(m15);
  const compression=resistanceAndCompression(m15),breakout=breakoutFeatures(m15,compression);
  const oi4=finite(p.oi4hPct),funding=finite(p.fundingRate),spotVolumeConfirmed=execution?.spotVolumeConfirmed===true;
  const crowdingReject=oi4!=null&&oi4>2&&funding!=null&&funding>.03&&!spotVolumeConfirmed;
  const executionPass=execution?.executionPass===true;
  const netR=finite(execution?.netR),netRPass=netR!=null&&netR>=1.5;
  const dataStale=data?.stale===true,sequenceGap=data?.sequenceGap===true,hardReject=data?.hardReject===true,eventRiskHard=eventRisk?.hard===true;
  const lastCloseTime=Math.max(...[h1,m15,m5].flatMap(rows=>completed(rows,now).slice(-1).map(closeTime)).filter(Number.isFinite));
  return{
    specVersion:'setup-feature-r0.1',
    candleCloseTime:Number.isFinite(lastCloseTime)?lastCloseTime:null,
    observedAt:now,availableAt:now,decisionTime:now,
    bottom:{
      setupType:'BOTTOM_REVERSAL',shockScore:shock.score,htfDiscountLiquidationCluster:false,
      sweepReclaimed:Boolean(bottomStruct.sweepReclaimed),mssConfirmed:Boolean(bottomStruct.mssConfirmed),zoneCreated:Boolean(bottomStruct.zoneCreated),
      zoneRetestValid:Boolean(bottomStruct.retestValid),higherLowConfirmed:Boolean(bottomStruct.higherLowConfirmed),
      sweepLowCloseBreak:Boolean(bottomStruct.sweepLowCloseBreak),zoneCloseBreak:Boolean(bottomStruct.zoneCloseBreak),mssOriginFailure:false,
      executionPass,netRPass,dataStale,sequenceGap,hardReject,eventRiskHard,
      evidence:{shock,bottomStruct,netR,execution}
    },
    breakout:{
      setupType:'PREBREAKOUT',resistanceDefined:Boolean(compression.resistanceDefined),compressionScore:compression.compressionScore,
      closeAboveResistance:Boolean(breakout.closeAboveResistance),volumeConfirmed:Boolean(breakout.volumeConfirmed)&&spotVolumeConfirmed,
      futuresVolumeConfirmed:Boolean(breakout.volumeConfirmed),spotVolumeConfirmed,breakoutBodyConfirmed:Boolean(breakout.breakoutBodyConfirmed),
      retestHolds:Boolean(breakout.retestHolds),closeBackBelowResistance:Boolean(breakout.closeBackBelowResistance),retestLowBreak:Boolean(breakout.retestLowBreak),
      crowdingReject,executionPass,netRPass,dataStale,sequenceGap,hardReject,eventRiskHard,
      evidence:{compression,breakout,oi4hPct:oi4,fundingRate:funding,spotVolumeConfirmed,netR,execution}
    }
  };
}
module.exports={completed,confirmedSwingLows,confirmedSwingHighs,shockFeatures,detectSweepMssZone,resistanceAndCompression,breakoutFeatures,build};

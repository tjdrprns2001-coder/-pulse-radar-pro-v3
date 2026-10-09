(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseBowlSymmetry=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Independent research detector. Input: chronological CLOSED OHLCV candles.
// No external source code copied. Observational pattern, not trading advice.
function sma(values, period) {
  if (values.length < period) return null;
  let total=0;
  for(let i=values.length-period;i<values.length;i++)total+=values[i];
  return total/period;
}
function finitePositive(v){return typeof v==='number'&&Number.isFinite(v)&&v>0}
function smaSeries(values,period){
 const out=Array(values.length).fill(null);
 if(!Number.isInteger(period)||period<1)return out;
 let sum=0,invalid=0;
 for(let i=0;i<values.length;i++){
  const n=Number(values[i]);if(!Number.isFinite(n))invalid++;else sum+=n;
  if(i>=period){const old=Number(values[i-period]);if(!Number.isFinite(old))invalid--;else sum-=old}
  if(i>=period-1&&invalid===0)out[i]=sum/period;
 }
 return out;
}
function detectBowlSymmetry(candles, options={}) {
  const cfg={
    minDecline:options.minDecline??0.10,
    maxBaseWidth:options.maxBaseWidth??0.22,
    minSymmetry:options.minSymmetry??0.8,
    maxSymmetry:options.maxSymmetry??2.5,
    minDeclineBars:options.minDeclineBars??12,
    minBaseBars:options.minBaseBars??12,
    breakoutBuffer:options.breakoutBuffer??0.005,
    minVolumeRatio:options.minVolumeRatio??1.2,
    requireLongMa:options.requireLongMa??false,
    requireVolume:options.requireVolume??true
  };
  if(!Array.isArray(candles)||candles.length<Math.max(80,2*cfg.minBaseBars+cfg.minDeclineBars+1))
    return {status:'INSUFFICIENT_HISTORY',signal:false};
  if(candles.some(x=>!x||!finitePositive(Number(x.close))||!finitePositive(Number(x.high))||!finitePositive(Number(x.low))||Number(x.high)<Number(x.low)))
    return {status:'INVALID_CANDLES',signal:false};
  const c=candles.map(x=>Number(x.close));
  const n=c.length,latest=n-1;
  // Evaluate only last CLOSED candle as potential breakout; no lookahead.
  const lookback=Math.min(options.lookback??260,n-1);
  let best=null;
  const start=Math.max(0,latest-lookback);
  for(let trough=start+cfg.minDeclineBars;trough<=latest-cfg.minBaseBars-1;trough++){
    const baseStart=trough+1, baseEnd=latest-1, baseBars=baseEnd-baseStart+1;
    if(baseBars<cfg.minBaseBars)continue;
    let peak=trough-cfg.minDeclineBars;
    for(let i=Math.max(start,trough-Math.floor(cfg.maxSymmetry*baseBars));i<=trough-cfg.minDeclineBars;i++){
      if(c[i]>=c[peak])peak=i;
    }
    const declineBars=trough-peak, symmetry=baseBars/declineBars;
    if(symmetry<cfg.minSymmetry||symmetry>cfg.maxSymmetry)continue;
    const drop=(c[peak]-c[trough])/c[peak];
    if(drop<cfg.minDecline)continue;
    const base=candles.slice(baseStart,latest), lows=base.map(x=>Number(x.low)), highs=base.map(x=>Number(x.high));
    const baseLow=Math.min(...lows), baseHigh=Math.max(...highs), width=(baseHigh-baseLow)/baseLow;
    if(width>cfg.maxBaseWidth)continue;
    // The trough should remain near the base floor.
    if(c[trough]>baseLow*(1+cfg.maxBaseWidth/2))continue;
    const breakout=c[latest]>baseHigh*(1+cfg.breakoutBuffer);
    const vols=candles.map(x=>Number(x.volume)||0);
    const avgVol=sma(vols.slice(0,-1),20);
    const volumeRatio=avgVol>0?vols[latest]/avgVol:null;
    const volumePass=volumeRatio!==null&&volumeRatio>=cfg.minVolumeRatio;
    const ma={ma112:sma(c,112),ma224:sma(c,224),ma448:sma(c,448)};
    const maPass=ma.ma224!==null&&ma.ma448!==null&&c[latest]>ma.ma224&&c[latest]>ma.ma448;
    const signal=breakout&&(!cfg.requireVolume||volumePass)&&(!cfg.requireLongMa||maPass);
    const score=(breakout?40:0)+(drop>=.2?15:8)+(symmetry>=1?15:8)+(width<=.12?15:8)+(volumePass?10:0)+(maPass?5:0);
    const candidate={status:signal?'BREAKOUT_CONFIRMED':breakout?'BREAKOUT_UNCONFIRMED':'BASE_WATCH',
      signal,score,peakIndex:peak,troughIndex:trough,baseStartIndex:baseStart,baseEndIndex:baseEnd,
      declineBars,baseBars,symmetryRatio:symmetry,declinePct:drop*100,baseWidthPct:width*100,
      baseHigh,baseLow,breakout,volumeRatio,volumePass,longMaPass:maPass,movingAverages:ma,
      missingLongMa:ma.ma448===null};
    if(!best||candidate.score>best.score||(candidate.score===best.score&&candidate.troughIndex>best.troughIndex))best=candidate;
  }
  return best??{status:'NO_PATTERN',signal:false};
}
return{detectBowlSymmetry,sma,smaSeries};

});

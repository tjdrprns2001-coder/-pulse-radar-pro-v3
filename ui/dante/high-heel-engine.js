(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./dante-contract.js'):root?.PulseDanteContract;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDanteHighHeel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){'use strict';
if(!C)throw new Error('PulseDanteContract required');
const VERSION='DANTE_HIGH_HEEL_v1';
const SOURCE_CLASS='AUXILIARY_OUTSIDE_REPORT_CORE';
const DEFAULTS=Object.freeze({lookbackBars:30,minDropPct:12,reversalWindowBars:5,minRecoveryPctOfDrop:.45,minRvol:1.5,volumeLookback:20});
function median(a){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function analyze({candles=[],analysisAsOf,params={}}={}){
  C.assertClosedCandles(candles,analysisAsOf);const P={...DEFAULTS,...params},n=candles.length;
  if(n<Math.max(P.lookbackBars,P.volumeLookback)+2)return C.freeze({version:VERSION,sourceClass:SOURCE_CLASS,mode:'SHADOW_ONLY',status:'DATA_INSUFFICIENT',state:'NO_SETUP',rankingContribution:0});
  const start=n-P.lookbackBars,window=candles.slice(start),peak=Math.max(...window.map(x=>x.high)),low=Math.min(...window.map(x=>x.low)),lowLocal=window.findIndex(x=>x.low===low),lowIndex=start+lowLocal;
  const drop=peak>0?(1-low/peak)*100:0,latest=candles.at(-1),recovery=peak>low?(latest.close-low)/(peak-low):0;
  const barsSinceLow=n-1-lowIndex,baseVol=median(candles.slice(Math.max(0,n-1-P.volumeLookback),n-1).map(x=>Number(x.volume||0))),rv=baseVol>0?Number(latest.volume||0)/baseVol:null;
  const candidate=drop>=P.minDropPct&&barsSinceLow<=P.reversalWindowBars&&recovery>=P.minRecoveryPctOfDrop&&rv!=null&&rv>=P.minRvol;
  const facts=[];if(drop>=P.minDropPct)facts.push('SHARP_DROP');if(barsSinceLow<=P.reversalWindowBars)facts.push('FAST_REVERSAL_WINDOW');if(recovery>=P.minRecoveryPctOfDrop)facts.push('V_RECOVERY');if(rv!=null&&rv>=P.minRvol)facts.push('RVOL_CONFIRM');
  return C.freeze({version:VERSION,sourceClass:SOURCE_CLASS,mode:'SHADOW_ONLY',status:candidate?'CANDIDATE':'NOT_CONFIRMED',state:candidate?'V_REVERSAL_CANDIDATE':'NO_SETUP',dropPct:drop,recoveryFraction:recovery,barsSinceLow,rvol:rv,evidenceFactIds:facts,params:P,paramsHash:C.paramsHash(P),rankingContribution:0});
}
return{VERSION,SOURCE_CLASS,DEFAULTS,median,analyze};
});
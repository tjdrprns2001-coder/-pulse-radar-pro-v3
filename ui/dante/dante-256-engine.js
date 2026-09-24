(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./dante-contract.js'):root?.PulseDanteContract;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDante256=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){'use strict';
if(!C)throw new Error('PulseDanteContract required');
const VERSION='DANTE_256_v1';
const DEFAULTS=Object.freeze({emaFast:5,emaMid:20,emaSlow:60,holdBars:2,requireSlowAboveFast:true});
function ema(v,p){const o=[];if(!v.length)return o;const a=2/(p+1);let x=Number(v[0]);o[0]=x;for(let i=1;i<v.length;i++){x=Number(v[i])*a+x*(1-a);o[i]=x}return o}
function analyze({candles=[],analysisAsOf,params={}}={}){
  C.assertClosedCandles(candles,analysisAsOf);const P={...DEFAULTS,...params},n=candles.length;
  if(n<P.emaSlow+P.holdBars+2)return C.freeze({version:VERSION,mode:'SHADOW_ONLY',status:'DATA_INSUFFICIENT',state:'NO_SETUP',rankingContribution:0});
  const close=candles.map(x=>Number(x.close)),e5=ema(close,P.emaFast),e20=ema(close,P.emaMid),e60=ema(close,P.emaSlow),i=n-1,prev=i-1;
  const cross=e5[i]>e20[i]&&e5[prev]<=e20[prev],shape=e20[i]<e5[i]&&(!P.requireSlowAboveFast||e5[i]<e60[i]);
  const holdStart=Math.max(0,i-P.holdBars+1),held=Array.from({length:i-holdStart+1},(_,k)=>holdStart+k).every(j=>e5[j]>e20[j]);
  let state='NO_SETUP',status='NOT_CONFIRMED',facts=[];
  if(cross&&shape){state='CROSS';status='CANDIDATE';facts=['EMA5_CROSS_EMA20','EMA20_LT_EMA5_LT_EMA60']}
  else if(shape&&held){state='HOLD';status='CANDIDATE';facts=['EMA20_LT_EMA5_LT_EMA60','EMA5_ABOVE_EMA20_HOLD']}
  return C.freeze({version:VERSION,mode:'SHADOW_ONLY',status,state,evidenceFactIds:facts,latest:{ema5:e5[i],ema20:e20[i],ema60:e60[i]},params:P,paramsHash:C.paramsHash(P),rankingContribution:0});
}
return{VERSION,DEFAULTS,ema,analyze};
});
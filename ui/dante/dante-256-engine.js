(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./dante-contract.js'):root?.PulseDanteContract;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDante256=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){'use strict';
if(!C)throw new Error('PulseDanteContract required');
const VERSION='DANTE_256_v1';
const DEFAULTS=Object.freeze({emaFast:5,emaMid:20,emaSlow:60,emaSeedBars:224,atrPeriod:20,maxDistanceToEma60Atr:1.5,sourceProfile:'REPORT_PROXY_2026_09_24'});
function atr(c,p=20){const tr=c.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?c[i-1].close:x.close)),Math.abs(x.low-(i?c[i-1].close:x.close))));const out=Array(c.length).fill(null);for(let i=p-1;i<c.length;i++)out[i]=tr.slice(i-p+1,i+1).reduce((s,v)=>s+v,0)/p;return out}
function scanCandidates({candles=[],analysisAsOf,params={}}={}){
  C.assertClosedCandles(candles,analysisAsOf);const P={...DEFAULTS,...params},n=candles.length;
  if(n<P.emaSeedBars+2)return[];
  const close=candles.map(x=>Number(x.close)),e5=C.seededEma(close,P.emaFast,P.emaSeedBars),e20=C.seededEma(close,P.emaMid,P.emaSeedBars),e60=C.seededEma(close,P.emaSlow,P.emaSeedBars),a=atr(candles,P.atrPeriod),out=[];
  for(let i=P.emaSeedBars;i<n;i++){
    if(!Number.isFinite(e5[i-1])||!Number.isFinite(e20[i-1])||!Number.isFinite(e60[i]))continue;
    const cross=e5[i-1]<=e20[i-1]&&e5[i]>e20[i],closeAbove20=close[i]>e20[i],slowAbovePrice=e60[i]>close[i],distanceAtr=Number.isFinite(a[i])&&a[i]>0?(e60[i]-close[i])/a[i]:null,distanceOk=distanceAtr!=null&&distanceAtr>=0&&distanceAtr<=P.maxDistanceToEma60Atr;
    if(cross&&closeAbove20&&slowAbovePrice&&distanceOk)out.push({index:i,time:candles[i].closeTime??candles[i].time,state:'LEAD_CANDIDATE',paramsHash:C.paramsHash(P),distanceToEma60Atr:distanceAtr,evidenceFactIds:['EMA5_CROSS_EMA20','CLOSE_ABOVE_EMA20','EMA60_ABOVE_CLOSE','EMA60_DISTANCE_ATR_OK']});
  }
  return out;
}
function analyze({candles=[],analysisAsOf,params={}}={}){
  C.assertClosedCandles(candles,analysisAsOf);const P={...DEFAULTS,...params},n=candles.length;
  if(n<P.emaSeedBars+2)return C.freeze({version:VERSION,mode:'SHADOW_ONLY',status:'DATA_INSUFFICIENT',state:'NO_SETUP',rankingContribution:0});
  const close=candles.map(x=>Number(x.close)),e5=C.seededEma(close,P.emaFast,P.emaSeedBars),e20=C.seededEma(close,P.emaMid,P.emaSeedBars),e60=C.seededEma(close,P.emaSlow,P.emaSeedBars),a=atr(candles,P.atrPeriod),i=n-1,prev=i-1;
  const cross=Number.isFinite(e5[prev])&&e5[prev]<=e20[prev]&&e5[i]>e20[i],closeAbove20=close[i]>e20[i],slowAbovePrice=e60[i]>close[i],distanceAtr=Number.isFinite(a[i])&&a[i]>0?(e60[i]-close[i])/a[i]:null,distanceOk=distanceAtr!=null&&distanceAtr>=0&&distanceAtr<=P.maxDistanceToEma60Atr;
  const candidate=cross&&closeAbove20&&slowAbovePrice&&distanceOk,facts=[];
  if(cross)facts.push('EMA5_CROSS_EMA20');if(closeAbove20)facts.push('CLOSE_ABOVE_EMA20');if(slowAbovePrice)facts.push('EMA60_ABOVE_CLOSE');if(distanceOk)facts.push('EMA60_DISTANCE_ATR_OK');
  return C.freeze({version:VERSION,mode:'SHADOW_ONLY',status:candidate?'CANDIDATE':'NOT_CONFIRMED',state:candidate?'LEAD_CANDIDATE':'NO_SETUP',evidenceFactIds:facts,latest:{ema5:e5[i],ema20:e20[i],ema60:e60[i],close:close[i],distanceToEma60Atr:distanceAtr},params:P,paramsHash:C.paramsHash(P),rankingContribution:0});
}
return{VERSION,DEFAULTS,atr,scanCandidates,analyze};
});
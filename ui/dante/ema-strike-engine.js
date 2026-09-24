(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./dante-contract.js'):root?.PulseDanteContract;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDanteEmaStrike=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){'use strict';
if(!C)throw new Error('PulseDanteContract required');
const VERSION=C.EMA_STRIKE_VERSION;
function ema(values,p){const out=[];if(!values.length)return out;const a=2/(p+1);let prev=Number(values[0]);out[0]=prev;for(let i=1;i<values.length;i++){prev=Number(values[i])*a+prev*(1-a);out[i]=prev}return out}
function analyze({candles=[],analysisAsOf,params={}}={}){
  C.assertClosedCandles(candles,analysisAsOf);const P=C.normalizeParams(params),n=candles.length;if(n<P.ema.long+2)return C.freeze({version:VERSION,status:'DATA_INSUFFICIENT',state:'NO_STRIKE',evidenceFactIds:[],paramsHash:C.paramsHash(P)});
  const close=candles.map(x=>Number(x.close)),e112=ema(close,P.ema.fast),e224=ema(close,P.ema.pivot),e448=ema(close,P.ema.long),i=n-1,prev=i-1,p=close[i],pp=close[prev],facts=[];
  const bearish=e112[i]<e224[i]&&e224[i]<e448[i];
  let state='NO_STRIKE';
  if(bearish&&p<e112[i]&&p>=e112[i]*.97){state='EMA112_APPROACH';facts.push('EMA112_APPROACH')}
  if(pp<e112[prev]&&p>e112[i]){state='EMA112_BREAK';facts.push('EMA112_BREAK')}
  if(p>=e112[i]&&pp>=e112[prev]){state='EMA112_HOLD';facts.push('EMA112_HOLD')}
  if(p>=e112[i]&&p<e224[i]){state='EMA224_TARGET';facts.push('EMA224_TARGET')}
  if(pp<e224[prev]&&p>e224[i]){state='EMA224_BREAK';facts.push('EMA224_BREAK')}
  if(p>=e224[i]&&p<e448[i]){state='EMA448_TARGET';facts.push('EMA448_TARGET')}
  if(p<e112[i]*.97&&pp>=e112[prev]){state='FAILED';facts.push('EMA112_HOLD_FAILED')}
  return C.freeze({version:VERSION,status:state==='NO_STRIKE'?'NOT_CONFIRMED':state==='FAILED'?'INVALIDATED':'CANDIDATE',state,evidenceFactIds:facts,latest:{ema112:e112[i],ema224:e224[i],ema448:e448[i],close:p,bearishLongMa:bearish},paramsHash:C.paramsHash(P)});
}
return{VERSION,ema,analyze};
});
(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./dante-contract.js'):root?.PulseDanteContract;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDante625=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){'use strict';
if(!C)throw new Error('PulseDanteContract required');
const VERSION='DANTE_625_v1';
const DEFAULTS=Object.freeze({priorReturnPct:6,minVolumeVsPrior:.5,requireGapDown:true,requireBullishCurrent:true,allowedMarkets:['KR_EQUITY']});
function analyze({candles=[],analysisAsOf,params={},market='KR_EQUITY'}={}){
  C.assertClosedCandles(candles,analysisAsOf);const P={...DEFAULTS,...params,allowedMarkets:[...(params.allowedMarkets||DEFAULTS.allowedMarkets)]};
  if(!P.allowedMarkets.includes(market))return C.freeze({version:VERSION,mode:'SHADOW_ONLY',status:'NOT_APPLICABLE',state:'MARKET_SESSION_UNSUPPORTED',market,rankingContribution:0});
  if(candles.length<3)return C.freeze({version:VERSION,mode:'SHADOW_ONLY',status:'DATA_INSUFFICIENT',state:'NO_SETUP',market,rankingContribution:0});
  const y=candles.at(-2),t=candles.at(-1),before=candles.at(-3);
  const priorRet=before.close?((y.close/before.close)-1)*100:null;
  const c1=priorRet!=null&&priorRet>=P.priorReturnPct,c2=!P.requireGapDown||t.open<y.close,c3=!P.requireBullishCurrent||t.close>t.open,c4=Number(t.volume||0)>=Number(y.volume||0)*P.minVolumeVsPrior;
  const facts=[];if(c1)facts.push('PRIOR_DAY_SURGE');if(c2)facts.push('GAP_DOWN');if(c3)facts.push('BULLISH_REVERSAL');if(c4)facts.push('VOLUME_HELD');
  const ok=c1&&c2&&c3&&c4;
  return C.freeze({version:VERSION,mode:'SHADOW_ONLY',status:ok?'CANDIDATE':'NOT_CONFIRMED',state:ok?'SETUP':'NO_SETUP',market,priorReturnPct:priorRet,evidenceFactIds:facts,params:P,paramsHash:C.paramsHash(P),rankingContribution:0});
}
return{VERSION,DEFAULTS,analyze};
});
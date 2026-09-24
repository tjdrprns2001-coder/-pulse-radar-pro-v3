(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./dante-contract.js'):root?.PulseDanteContract;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseDanteGongguri=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){'use strict';
if(!C)throw new Error('PulseDanteContract required');
const VERSION=C.GONGGURI_VERSION;
function atr(c,p=14){const out=Array(c.length).fill(null),tr=[];for(let i=0;i<c.length;i++){const pc=i?c[i-1].close:c[i].close;tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-pc),Math.abs(c[i].low-pc)));if(i>=p-1)out[i]=tr.slice(i-p+1,i+1).reduce((s,v)=>s+v,0)/p}return out}
function analyze({candles=[],analysisAsOf,params={},level=null}={}){
  C.assertClosedCandles(candles,analysisAsOf);const P=C.normalizeGongguriParams(params),a=atr(candles),n=candles.length;if(n<P.boxLookback+P.minHoldBars+2)return C.freeze({version:VERSION,status:'DATA_INSUFFICIENT',level:null,evidenceFactIds:[],paramsHash:C.paramsHash(P),params:P});
  const end=n-1,start=end-P.boxLookback,box=candles.slice(start,end),av=a[end],candidate=Number.isFinite(level)?Number(level):Math.max(...box.map(x=>x.high));
  const tol=(Number.isFinite(av)?av:0)*P.retestToleranceAtr,touches=box.filter(x=>Math.abs(x.high-candidate)<=tol||x.high>=candidate-tol&&x.low<=candidate+tol).length;
  const hi=Math.max(...box.map(x=>x.high)),lo=Math.min(...box.map(x=>x.low)),widthAtr=av>0?(hi-lo)/av:null;
  const facts=[];if(touches<P.minPriorTouches||widthAtr==null||widthAtr>P.maxBoxAtrWidth)return C.freeze({version:VERSION,status:'NOT_CONFIRMED',level:candidate,touches,widthAtr,evidenceFactIds:[],paramsHash:C.paramsHash(P),params:P});
  facts.push('GONGGURI_LEVEL_QUALIFIED');
  let breakout=-1,retest=-1,reclaim=-1;
  for(let i=start+1;i<n;i++){const ai=a[i];if(!Number.isFinite(ai)||ai<=0)continue;if(breakout<0&&candles[i].close>candidate+ai*P.breakoutBufferAtr){breakout=i;facts.push('GONGGURI_BREAKOUT');continue}if(breakout>=0&&retest<0&&i-breakout<=P.maxRetestBars&&candles[i].low<=candidate+ai*P.retestToleranceAtr&&candles[i].high>=candidate-ai*P.retestToleranceAtr){retest=i;facts.push('GONGGURI_RETEST_TOUCH');continue}if(retest>=0&&reclaim<0&&candles[i].close>=candidate+ai*P.reclaimBufferAtr){reclaim=i;facts.push('GONGGURI_RECLAIM');continue}}
  let status='CANDIDATE';if(breakout<0)status='QUALIFIED_LEVEL';else if(retest<0)status='CANDIDATE';else if(reclaim<0)status='CANDIDATE';else if(n-1-reclaim>=P.minHoldBars){const held=candles.slice(reclaim+1).every((x,j)=>x.close>=candidate-(a[reclaim+1+j]||av)*P.reclaimBufferAtr);if(held){status='CONFIRMED';facts.push('GONGGURI_HOLD')}}
  return C.freeze({version:VERSION,status,level:candidate,touches,widthAtr,breakoutIndex:breakout<0?null:breakout,retestIndex:retest<0?null:retest,reclaimIndex:reclaim<0?null:reclaim,evidenceFactIds:facts,paramsHash:C.paramsHash(P),params:P});
}
return{VERSION,atr,analyze};
});
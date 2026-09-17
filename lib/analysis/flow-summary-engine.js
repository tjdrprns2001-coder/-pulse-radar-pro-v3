(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseFlowSummaryEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function n(v){const x=Number(v);return Number.isFinite(x)?x:null;}
function compactUsd(v){const x=n(v);if(x==null)return null;const a=Math.abs(x);if(a>=1e9)return'$'+(x/1e9).toFixed(2).replace(/\.00$/,'')+'B';if(a>=1e6)return'$'+(x/1e6).toFixed(2).replace(/\.00$/,'')+'M';if(a>=1e3)return'$'+(x/1e3).toFixed(2).replace(/\.00$/,'')+'K';return'$'+x.toFixed(2);}
function summarizeFlow(input={}){
  const oi=n(input.oi),oiChange24h=n(input.oi24h??input.oiChange24h),funding=n(input.funding),takerRatio=n(input.takerRatio),volumeImpulse=input.volumeImpulse??null,cvdBias=input.cvdBias??null;
  const available=[oi,oiChange24h,funding,takerRatio].some(v=>v!=null)||volumeImpulse!=null||cvdBias!=null;
  if(!available)return{available:false,oi:null,oiChange24h:null,funding:null,takerRatio:null,volumeImpulse:null,cvdBias:null,text:'Flow 데이터 없음'};
  const parts=[];
  if(oi!=null)parts.push(`OI ${compactUsd(oi)}${oiChange24h!=null?` (${oiChange24h>=0?'+':''}${oiChange24h.toFixed(1)}% 24h)`:''}`);else if(oiChange24h!=null)parts.push(`OI 24h ${oiChange24h>=0?'+':''}${oiChange24h.toFixed(1)}%`);
  if(funding!=null)parts.push(`funding ${funding>=0?'+':''}${funding.toFixed(4)}%`);
  if(takerRatio!=null)parts.push(`taker ${takerRatio.toFixed(2)}×`);
  if(volumeImpulse!=null)parts.push(`volume ${String(volumeImpulse)}`);
  if(cvdBias!=null)parts.push(`CVD ${String(cvdBias)}`);
  return{available:true,oi,oiChange24h,funding,takerRatio,volumeImpulse,cvdBias,text:`📊 Flow: ${parts.join(' · ')}`};
}
return{summarizeFlow};
});

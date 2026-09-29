(function(root,factory){const dep=typeof module==='object'&&module.exports?require('./math.js'):root.PulseAutoChartMath;const api=factory(dep);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartVolume=api;})(typeof globalThis!=='undefined'?globalThis:this,function(MathX){'use strict';
function rvol20(candles,index=candles.length-1,period=20){
  if(!Array.isArray(candles)||index<period||index>=candles.length)return null;
  const current=candles[index]?.volume;if(!MathX.finite(current))return null;
  const prev=candles.slice(index-period,index).map(x=>x?.volume);
  if(prev.length!==period||prev.some(v=>!MathX.finite(v)))return null;
  const avg=prev.reduce((a,b)=>a+Number(b),0)/period;
  return avg>0?Number(current)/avg:null;
}
function spikes(candles,{hours=72,threshold=3,period=20,asOf=null}={}){
  if(!Array.isArray(candles)||!candles.length)return[];
  const end=Number(asOf??candles.at(-1)?.closeTime);if(!Number.isFinite(end))return[];
  const start=end-hours*3600000,out=[];
  for(let i=period;i<candles.length;i++){
    const c=candles[i];if(!(Number(c.closeTime)>=start&&Number(c.closeTime)<=end))continue;
    const r=rvol20(candles,i,period);if(r!=null&&r>=threshold)out.push({index:i,time:c.closeTime,rvol:r,high:c.high,low:c.low,volume:c.volume});
  }
  return out;
}
function summarize(candles,{hours24=24,hours72=72,threshold=3,period=20}={}){
  const current=rvol20(candles,candles.length-1,period),s24=spikes(candles,{hours:hours24,threshold,period}),s72=spikes(candles,{hours:hours72,threshold,period}),last=s72.at(-1)||null;
  let cooldown=null;
  if(last){
    const after=candles.slice(last.index+1).filter(x=>MathX.finite(x.volume));
    if(after.length){const recent=after.slice(-Math.min(4,after.length)),avg=recent.reduce((a,b)=>a+Number(b.volume),0)/recent.length;cooldown=MathX.finite(last.volume)?avg<=Number(last.volume)*.5:null}
  }
  return{rvol20:current,spikes24h:s24,spikes72h:s72,lastSpike72h:last,cooldownAfterSpike:cooldown,definition:'current confirmed volume / previous 20 confirmed bars average',windowMode:'timestamp'};
}
return{rvol20,spikes,summarize};
});
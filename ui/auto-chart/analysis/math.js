(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartMath=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const missing=v=>v==null||(typeof v==='string'&&v.trim()==='');
const finite=v=>!missing(v)&&Number.isFinite(Number(v));
function ema(values,period){if(!Array.isArray(values)||!values.length)return[];const k=2/(period+1),out=[Number(values[0])];for(let i=1;i<values.length;i++)out.push(Number(values[i])*k+out[i-1]*(1-k));return out}
function atr(candles,period=14){if(!candles?.length)return[];const tr=candles.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-candles[i-1].close),Math.abs(x.low-candles[i-1].close)):x.high-x.low),out=[];let v=tr[0]||0,k=2/(period+1);for(let i=0;i<tr.length;i++){if(i)v=tr[i]*k+v*(1-k);out.push(v)}return out}
function avg(xs){const a=(xs||[]).filter(finite).map(Number);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
return{missing,finite,ema,atr,avg};
});
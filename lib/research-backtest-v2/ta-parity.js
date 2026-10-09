'use strict';
// Research-only independent formula comparison to MIT-licensed bukosabino/ta.
// Do not replace existing production indicators without a controlled migration.
function ema(values,p){if(!Number.isInteger(p)||p<1)throw Error('period');const out=[],alpha=2/(p+1);let x=null,count=0;
 for(const raw of values){const v=raw===null||raw===undefined?null:Number(raw);if(v!=null&&Number.isFinite(v)){x=x===null?v:x+alpha*(v-x);count++;}out.push(count>=p?x:null)}return out;}
function sma(values,p){const out=Array(values.length).fill(null);let total=0;for(let i=0;i<values.length;i++){total+=values[i];if(i>=p)total-=values[i-p];if(i>=p-1)out[i]=total/p}return out;}
function rsi(close,p=14){const up=[],down=[];for(let i=0;i<close.length;i++){const diff=i?close[i]-close[i-1]:0;up.push(Math.max(diff,0));down.push(Math.max(-diff,0))}
 const au=[],ad=[];let u=0,d=0;for(let i=0;i<close.length;i++){if(i===0){u=up[0];d=down[0]}else{u=(1-1/p)*u+up[i]/p;d=(1-1/p)*d+down[i]/p}
 au.push(i>=p-1?u:null);ad.push(i>=p-1?d:null)}
 return au.map((x,i)=>x===null?null:(ad[i]===0?100:100-100/(1+x/ad[i])))}
function macd(close){const fast=ema(close,12),slow=ema(close,26),line=close.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]),signal=ema(line,9);return{line,signal,hist:line.map((x,i)=>x===null||signal[i]===null?null:x-signal[i])}}
function atr(bars,p=14){const t=bars.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-bars[i-1].close),Math.abs(x.low-bars[i-1].close)):x.high-x.low),out=Array(t.length).fill(0);if(t.length<p)return out;
 let v=t.slice(0,p).reduce((a,b)=>a+b,0)/p;out[p-1]=v;for(let i=p;i<t.length;i++){v=(v*(p-1)+t[i])/p;out[i]=v}return out;}
function computeTaReference(bars){const candles=Array.isArray(bars)?bars:[],close=candles.map(x=>Number(x.close));if(!candles.length||candles.some(x=>!(Number(x.close)>0&&Number(x.high)>=Number(x.low))))throw Error('valid OHLC candles required');
 return {sma112:sma(close,112),ema20:ema(close,20),rsi14:rsi(close,14),macd:macd(close),atr14:atr(candles,14)};}
module.exports={ema,sma,rsi,macd,atr,computeTaReference};

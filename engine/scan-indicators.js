import {confirmedCandles} from './model.js';
import {scanCandidate} from './scanner.js';
export function ema(values,n){if(values.length<n)return null;let v=values.slice(0,n).reduce((a,b)=>a+b,0)/n;for(const x of values.slice(n))v+=(x-v)*2/(n+1);return v;}
export function rsi(values,n=14){if(values.length<=n)return null;let gain=0,loss=0;for(let i=1;i<=n;i++){const d=values[i]-values[i-1];gain+=Math.max(0,d)/n;loss+=Math.max(0,-d)/n;}for(let i=n+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(n-1)+Math.max(0,d))/n;loss=(loss*(n-1)+Math.max(0,-d))/n;}return gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);}
export function indicators(data){const closes=data.map(c=>c.close),last=data.at(-1),prev=data.slice(-21,-1);const average=prev.length===20&&prev.every(c=>Number.isFinite(c.volume)&&c.volume>0)?prev.reduce((s,c)=>s+c.volume,0)/20:null;return {rsi:rsi(closes),ema20:ema(closes,20),ema50:ema(closes,50),ema200:ema(closes,200),rvol:average&&Number.isFinite(last?.volume)&&last.volume>=0?last.volume/average:null,high20:prev.length===20?Math.max(...prev.map(c=>c.high)):null,low20:prev.length===20?Math.min(...prev.map(c=>c.low)):null};}
export function scanConditions(data,frame,options={}){
 const closed=confirmedCandles(data,frame,options.now),last=closed.at(-1),v=indicators(closed),checks=[];
 const check=(name,pass,detail)=>checks.push({name,pass,detail});
 if(options.wyckoff){const r=scanCandidate(closed,frame,options),e=r.matches.at(-1);check('와이코프',r.insufficient?null:!!e,e?`${e.type} · ${e.age}봉 전 · 무효 ${e.invalidation}`:r.insufficient?'61봉 필요':'활성 후보 없음');}
 if(options.rsiMode&&options.rsiMode!=='off'){const low=options.rsiMode==='low',threshold=options.rsiThreshold??(low?30:70);check('RSI(14)',v.rsi===null?null:low?v.rsi<=threshold:v.rsi>=threshold,v.rsi===null?'15봉 필요':`${v.rsi.toFixed(2)} / ${low?'≤':'≥'} ${threshold}`);}
 if(options.emaMode&&options.emaMode!=='off'){const bull=options.emaMode==='bull',ready=v.ema200!==null;check('EMA 추세',ready?(bull?last.close>v.ema20&&v.ema20>v.ema50&&v.ema50>v.ema200:last.close<v.ema20&&v.ema20<v.ema50&&v.ema50<v.ema200):null,ready?`종가 ${last.close.toPrecision(6)} · EMA20 ${v.ema20.toPrecision(6)} / 50 ${v.ema50.toPrecision(6)} / 200 ${v.ema200.toPrecision(6)}`:'200봉 필요');}
 if(options.volume){const threshold=options.volumeThreshold??2;check('거래량 급증',v.rvol===null?null:v.rvol>=threshold,v.rvol===null?'21봉 및 양수 기준 거래량 필요':`${v.rvol.toFixed(2)}배 / ≥ ${threshold}배`);}
 if(options.breakout&&options.breakout!=='off'){const up=options.breakout==='up';check('20봉 돌파',v.high20===null?null:up?last.close>v.high20:last.close<v.low20,v.high20===null?'21봉 필요':`종가 ${last.close.toPrecision(6)} / ${up?'직전 고가 초과':'직전 저가 미만'} ${up?v.high20:v.low20}`);}
 const matched=checks.length>0&&(options.join==='any'?checks.some(c=>c.pass===true):checks.every(c=>c.pass===true));
 return {matched,checks,values:v,time:last?.time,insufficient:checks.some(c=>c.pass===null),matches:matched?[{time:last.time,type:'지표 조건',status:'matched',age:0,checks}]:[]};
}

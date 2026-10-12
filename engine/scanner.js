import {wyckoff} from './wyckoff.js';
import {confirmedCandles} from './model.js';
export function scanCandidate(data,frame,{side='all',age=5,now=Date.now()/1000}={}){
 const closed=confirmedCandles(data,frame,now);if(closed.length<61)return {insufficient:true,matches:[]};
 const matches=wyckoff(closed).events.filter(e=>['watch','confirmed'].includes(e.status)&&closed.length-1-e.i<=age&&(side==='all'||e.side===side)).map(e=>({...e,age:closed.length-1-e.i,asOf:closed.at(-1).time}));
 return {insufficient:false,matches};
}
export async function scanMarkets(markets,{load,onResult,signal,delay=650,pause=(ms,signal)=>new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();})}){
 let failures=0,done=0;
 for(const market of markets){if(signal.aborted)return {done,reason:'stopped'};
  let result;
  try{result={market,data:await load(market,signal)};failures=0;}
  catch(error){if(signal.aborted)return {done,reason:'stopped'};result={market,error};failures++;}
  if(signal.aborted)return {done,reason:'stopped'};
  onResult(result);
  done++;if(result.error&&/\b(429|418|403)\b|rate.?limit|too many requests/i.test(result.error.message||''))return {done,reason:'restricted'};if(failures>=5)return {done,reason:'failures'};
  if(done<markets.length)try{await pause(delay,signal);}catch{if(signal.aborted)return {done,reason:'stopped'};throw Error('스캔 대기 실패');}
 }
 return {done,reason:'complete'};
}

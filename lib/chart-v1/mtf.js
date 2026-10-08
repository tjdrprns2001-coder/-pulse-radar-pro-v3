'use strict';
const DQ=require('../coin-report/modules/data-quality.js');
const MS=require('../coin-report/modules/market-structure.js');

const VERSION='MTF_CLOSED_V1';
const FRAMES=['1w','1d','4h','1h','15m','5m'];
function finite(v){if(v==null||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function ema(closes,period){if(!Array.isArray(closes)||closes.length<period)return null;const alpha=2/(period+1);let e=closes[0];for(let i=1;i<closes.length;i++)e+=alpha*(closes[i]-e);return e}
function rvol(bars){if(!bars||bars.length<21)return null;const current=finite(bars.at(-1).v),prior=bars.slice(-21,-1).map(x=>finite(x.v));if(current==null||prior.some(x=>x==null))return null;const avg=prior.reduce((a,b)=>a+b,0)/20;return avg>0?current/avg:null}
function analyzeFrame(rows,tf,nowMs=Date.now(),source='unknown'){
 const q=DQ.normalizeFrame(rows,{tf,nowMs}),bars=q.bars,closes=bars.map(x=>x.c);
 const result={timeframe:tf,status:q.state,source,as_of:q.lastClosedAt,candle_count:bars.length,trend:'unknown',price:null,ema14:null,ema28:null,ema14_above_ema28:null,rvol20:null,last_bos:null,last_choch:null,stage:'insufficient_data',missing_fields:[]};
 if(bars.length<60){result.status='partial';result.missing_fields.push('insufficient_closed_candles');return result}
 const structure=MS.analyze(bars,{tf}),a=ema(closes,14),b=ema(closes,28),last=bars.at(-1);
 result.trend=structure.trend;
 result.price=last.c;result.ema14=a;result.ema28=b;result.ema14_above_ema28=a!=null&&b!=null?a>b:null;
 result.rvol20=rvol(bars);
 const e=structure.events||[];
 result.last_bos=e.filter(x=>x.type==='BOS').at(-1)||null;
 result.last_choch=e.filter(x=>x.type==='CHOCH').at(-1)||null;
 result.stage=result.trend==='unknown'||result.trend==='range'?'range_or_unclear':result.ema14_above_ema28===null?'insufficient_data':result.trend==='bullish'&&result.ema14_above_ema28?'bullish_alignment':result.trend==='bearish'&&!result.ema14_above_ema28?'bearish_alignment':'transition';
 return result
}
function consensusOf(frames){
 const active=frames.filter(x=>x.status!=='unavailable'&&x.status!=='invalid'&&x.stage!=='insufficient_data'),bull=active.filter(x=>x.stage==='bullish_alignment').length,bear=active.filter(x=>x.stage==='bearish_alignment').length,trans=active.length-bull-bear;
 const total=active.length;
 return{status:total===FRAMES.length?'complete':total?'partial':'unavailable',observed:total,expected:FRAMES.length,bullish_aligned:bull,bearish_aligned:bear,mixed_or_transition:trans,bias:total<3?'insufficient_data':bull>=4?'bullish_alignment':bear>=4?'bearish_alignment':'mixed',explanation:'시간 프레임별 확정봉 구조 정렬 통계이며 매매 신호나 상승 확률은 아닙니다.'}
}
function createMtfService({provider,now=()=>Date.now(),ttlMs=90000}={}){
 if(!provider)throw Error('provider required');const cache=new Map();
 async function frame(symbol,tf,stamp){
  const attempts=[['spot',()=>provider.getSpotKlines?.(symbol,tf,340)],['perpetual_fallback',()=>provider.getFuturesKlines?.(symbol,tf,340)]];
  const errors=[];
  for(const [src,fn] of attempts){
   try{const rows=await fn();if(!Array.isArray(rows)||!rows.length)throw Error('empty');const result=analyzeFrame(rows,tf,stamp,rows._source||src);if(src!=='spot')result.market_fallback=true;return result}
   catch(e){errors.push(src+':'+String(e?.message||e))}
  }
  return{timeframe:tf,status:'unavailable',source:null,as_of:null,candle_count:0,trend:'unknown',stage:'insufficient_data',missing_fields:['ohlcv'],errors:errors.map(x=>x.slice(0,140))}
 }
 async function get(symbol){
  const s=String(symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,''),stamp=now();if(!/^[A-Z0-9]{2,25}USDT$/.test(s))throw Error('invalid symbol');
  const cached=cache.get(s);if(cached&&cached.until>stamp)return cached.data;
  const outputs=[];for(let i=0;i<FRAMES.length;i+=2){const group=await Promise.all(FRAMES.slice(i,i+2).map(tf=>frame(s,tf,stamp)));outputs.push(...group)}
  const data={symbol:s,as_of:stamp,frames:outputs,consensus:consensusOf(outputs),algorithm_version:VERSION,confirmed_candles_only:true};
  cache.set(s,{data,until:stamp+ttlMs});if(cache.size>100)cache.delete(cache.keys().next().value);
  return data
 }
 return{get}
}
module.exports={VERSION,FRAMES,finite,ema,rvol,analyzeFrame,consensusOf,createMtfService};

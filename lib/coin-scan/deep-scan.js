'use strict';
const preSurge=require('../analysis/presurge-v2.js');
const ORDER=['1w','1d','4h','1h','15m','5m'];
const n=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null};
function metric(rows=[]){
  if(!Array.isArray(rows)||rows.length<3)return{state:'unknown',structure:'neutral',returnPct:null,volumeAcceleration:null,takerRatio:null,pullback:false,reaccumulating:false};
  const closes=rows.map(r=>n(r?.[4])).filter(v=>v!=null),vols=rows.map(r=>n(r?.[5])).filter(v=>v!=null);
  if(closes.length<3||vols.length<3)return{state:'unknown',structure:'neutral',returnPct:null,volumeAcceleration:null,takerRatio:null,pullback:false,reaccumulating:false};
  const recent=closes[closes.length-1],anchor=closes[Math.max(0,closes.length-20)],ret=anchor?((recent-anchor)/anchor)*100:null;
  const short=vols.slice(-5),base=vols.slice(Math.max(0,vols.length-30),Math.max(0,vols.length-5));
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,va=avg(base)?avg(short)/avg(base):null;
  let buy=0,total=0;
  for(const r of rows.slice(-10)){const q=n(r?.[7]),b=n(r?.[10]);if(q!=null&&q>0&&b!=null){buy+=b;total+=q}}
  const taker=total>buy&&buy>0?buy/(total-buy):null;
  const structure=ret!=null&&ret>1?'bullish':ret!=null&&ret<-1?'bearish':'neutral';
  const last5=closes.slice(-5),max20=Math.max(...closes.slice(-20));
  const pullback=structure==='bullish'&&recent<max20*.985;
  const reaccumulating=pullback&&va!=null&&va>=.9&&last5[last5.length-1]>=last5[0]*.995;
  const state=structure==='bullish'?(va!=null&&va>=1.5?'accelerating':'bullish'):structure==='bearish'?'bearish':'neutral';
  return{state,structure,returnPct:ret,volumeAcceleration:va,takerRatio:taker,pullback,reaccumulating};
}
function majority(values){const b=values.filter(v=>v==='bullish').length,s=values.filter(v=>v==='bearish').length;return b>s?'bullish':s>b?'bearish':'neutral'}
function analyzeDeep(input={}){
  const frames=input.frames||{},metrics={};for(const tf of ORDER)metrics[tf]=metric(frames[tf]);
  const structure=majority(['1w','1d','4h'].map(tf=>metrics[tf].structure));
  const momentum=majority(['1h','15m','5m'].map(tf=>metrics[tf].structure));
  const pickAvg=(key,tfs)=>{const vals=tfs.map(tf=>metrics[tf][key]).filter(v=>v!=null);return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null};
  const takerRatio=pickAvg('takerRatio',['1h','15m','5m']);
  const volumeAcceleration=pickAvg('volumeAcceleration',['1h','15m','5m']);
  const oiChangePct=input.oiChangePct==null?null:n(input.oiChangePct),fundingPct=input.fundingPct==null?null:n(input.fundingPct);
  const dataState=String(input.dataState||'unknown').toLowerCase();
  const pre=preSurge.evaluate({dataState,bias:structure,takerRatio,oiChangePct,fundingPct,volumeAcceleration,alertState:input.alertState});
  const pullback=metrics['4h'].pullback||metrics['1h'].pullback,reaccumulating=metrics['1h'].reaccumulating||metrics['15m'].reaccumulating;
  const reasons=[`상위 구조 ${structure}`,volumeAcceleration==null?'거래량 가속 자료 부족':`단기 거래량 ${volumeAcceleration.toFixed(2)}배`,takerRatio==null?'체결 자료 부족':`단기 매수/매도 ${takerRatio.toFixed(2)}배`];
  return{symbol:String(input.symbol||''),dataState,structure,momentum,takerRatio,volumeAcceleration,oiChangePct,fundingPct,preSurge:pre,tfState:Object.fromEntries(ORDER.map(tf=>[tf,metrics[tf].state])),pullback,reaccumulating,reasons,updatedAt:Date.now(),priceChange1h:metrics['1h'].returnPct,priceChange24h:metrics['1d'].returnPct};
}
module.exports={ORDER,analyzeDeep};

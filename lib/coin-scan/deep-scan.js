'use strict';

const PreSurge=require('../analysis/presurge-v2.js');
const TF_ORDER=['1w','1d','4h','1h','15m','5m'];

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function close(k){return Array.isArray(k)?finite(k[4]):null}
function volume(k){return Array.isArray(k)?finite(k[5]):null}
function quoteVolume(k){return Array.isArray(k)?finite(k[7]):null}
function takerBuyQuote(k){return Array.isArray(k)?finite(k[10]):null}

function metrics(klines){
  const rows=Array.isArray(klines)?klines.filter(Array.isArray):[];
  if(rows.length<2)return{state:'unknown',structure:'neutral',returnPct:null,volumeAcceleration:null,takerRatio:null,pullback:false,reaccumulating:false};
  const closes=rows.map(close).filter(v=>v!=null),vols=rows.map(volume).filter(v=>v!=null);
  if(closes.length<2)return{state:'unknown',structure:'neutral',returnPct:null,volumeAcceleration:null,takerRatio:null,pullback:false,reaccumulating:false};
  const first=closes[Math.max(0,closes.length-30)],last=closes[closes.length-1];
  const ret=first?((last/first)-1)*100:null;
  const recent5=avg(vols.slice(-5)),baseline=avg(vols.slice(-25,-5));
  const volumeAcceleration=recent5!=null&&baseline>0?recent5/baseline:null;
  const recentRows=rows.slice(-12);let buy=0,sell=0,flowCount=0;
  for(const r of recentRows){const q=quoteVolume(r),b=takerBuyQuote(r);if(q!=null&&b!=null&&q>=b&&q>0){buy+=b;sell+=q-b;flowCount++}}
  const takerRatio=flowCount&&sell>0?buy/sell:flowCount&&buy>0?99:null;
  const structure=ret!=null&&ret>1?'bullish':ret!=null&&ret<-1?'bearish':'neutral';
  const highs=closes.slice(-12);const recentHigh=highs.length?Math.max(...highs):null;
  const pullback=structure==='bullish'&&recentHigh&&last<recentHigh*.985;
  const reaccumulating=pullback&&(volumeAcceleration==null||volumeAcceleration>=.9)&&(takerRatio==null||takerRatio>=.95);
  const state=structure==='bullish'?(volumeAcceleration!=null&&volumeAcceleration>=1.4?'accelerating':'bullish'):structure==='bearish'?'bearish':'neutral';
  return{state,structure,returnPct:ret,volumeAcceleration,takerRatio,pullback,reaccumulating};
}

function voteStructure(tf){
  const vals=['1w','1d','4h'].map(k=>tf[k]?.structure).filter(Boolean);let score=0;
  for(const v of vals)score+=v==='bullish'?1:v==='bearish'?-1:0;
  return score>0?'bullish':score<0?'bearish':'neutral';
}
function medianFinite(vals){const a=vals.filter(v=>Number.isFinite(v)).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}

function analyzeDeep(input={}){
  const frames=input.frames&&typeof input.frames==='object'?input.frames:{};
  const tfMetrics={},tfState={};
  for(const tf of TF_ORDER){tfMetrics[tf]=metrics(frames[tf]);tfState[tf]=tfMetrics[tf].state}
  const structure=voteStructure(tfMetrics);
  const takerRatio=medianFinite(['1h','15m','5m'].map(tf=>tfMetrics[tf].takerRatio));
  const volumeAcceleration=medianFinite(['1h','15m','5m'].map(tf=>tfMetrics[tf].volumeAcceleration));
  const oiChangePct=finite(input.oiChangePct),fundingPct=finite(input.fundingPct);
  const pullback=Boolean(tfMetrics['4h'].pullback||tfMetrics['1h'].pullback);
  const reaccumulating=Boolean(tfMetrics['4h'].reaccumulating||tfMetrics['1h'].reaccumulating||tfMetrics['15m'].reaccumulating);
  const momentum=structure==='bullish'&&takerRatio!=null&&takerRatio<=.87?'cooling':structure==='bullish'&&volumeAcceleration!=null&&volumeAcceleration>=1.4?'building':structure==='bearish'?'weak':'neutral';
  const derivedAlert=structure==='bullish'&&takerRatio!=null&&takerRatio>=1.15&&volumeAcceleration!=null&&volumeAcceleration>=1.5?'ARMED':'WATCH';
  const alertState=String(input.alertState||derivedAlert).toUpperCase();
  const preSurge=PreSurge.evaluate({
    dataState:String(input.dataState||'unknown').toLowerCase(),
    bias:structure,
    takerRatio,
    oiChangePct,
    fundingPct,
    volumeAcceleration,
    alertState
  });
  const reasons=[];
  if(structure==='bullish')reasons.push('상위 시간봉 상승 구조');
  else if(structure==='bearish')reasons.push('상위 시간봉 하락 구조');
  else reasons.push('상위 시간봉 방향 혼조');
  if(volumeAcceleration!=null&&volumeAcceleration>=1.4)reasons.push(`단기 거래량 ${volumeAcceleration.toFixed(2)}배 가속`);
  if(takerRatio!=null){if(takerRatio>=1.15)reasons.push(`단기 매수 체결 ${takerRatio.toFixed(2)}배 우위`);else if(takerRatio<=.87)reasons.push(`단기 매도 체결 ${takerRatio.toFixed(2)}배 우위`)}
  if(oiChangePct!=null)reasons.push(`OI ${oiChangePct>=0?'+':''}${oiChangePct.toFixed(2)}%`);
  if(pullback&&reaccumulating)reasons.push('눌림 구간 재축적 조건 관찰');
  return{
    symbol:String(input.symbol||'').toUpperCase(),dataState:String(input.dataState||'unknown').toLowerCase(),structure,momentum,alertState,
    takerRatio,volumeAcceleration,oiChangePct,fundingPct,preSurge,tfState,pullback,reaccumulating,reasons:reasons.slice(0,4),updatedAt:Date.now()
  };
}

module.exports={TF_ORDER,metrics,analyzeDeep};

'use strict';

const PreSurge=require('../analysis/presurge-v2.js');
const TF_ORDER=['1w','1d','4h','1h','15m','5m'];

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function close(k){return Array.isArray(k)?finite(k[4]):null}
function high(k){return Array.isArray(k)?finite(k[2]):null}
function low(k){return Array.isArray(k)?finite(k[3]):null}
function volume(k){return Array.isArray(k)?finite(k[5]):null}
function quoteVolume(k){return Array.isArray(k)?finite(k[7]):null}
function takerBuyQuote(k){return Array.isArray(k)?finite(k[10]):null}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function lastBarReturnPct(rows){
  const closes=(Array.isArray(rows)?rows:[]).map(close).filter(Number.isFinite);if(closes.length<2)return null;
  const prev=closes[closes.length-2],last=closes[closes.length-1];return prev?((last/prev)-1)*100:null;
}
function consecutiveVolumeIncreases(rows){
  const vols=(Array.isArray(rows)?rows:[]).map(volume).filter(Number.isFinite);let n=0;
  for(let i=vols.length-1;i>0&&vols[i]>vols[i-1];i--)n++;
  return n;
}
function lowTrend(rows){
  const lows=(Array.isArray(rows)?rows:[]).map(low).filter(Number.isFinite);if(lows.length<8)return'unknown';
  const recent=avg(lows.slice(-4)),prior=avg(lows.slice(-8,-4));if(recent==null||prior==null)return'unknown';
  return recent>prior*1.002?'rising':recent<prior*.998?'falling':'flat';
}
function isBreakout(rows){
  const closes=(Array.isArray(rows)?rows:[]).map(close).filter(Number.isFinite);if(closes.length<12)return false;
  const prevHigh=Math.max(...closes.slice(-12,-1)),last=closes[closes.length-1];return last>prevHigh*1.005;
}

function emaSeries(values,period){
  const src=values.filter(Number.isFinite);if(!src.length)return[];const alpha=2/(period+1);const out=[src[0]];
  for(let i=1;i<src.length;i++)out.push(src[i]*alpha+out[i-1]*(1-alpha));return out;
}
function rsiSeries(values,period=14){
  const src=values.filter(Number.isFinite);if(src.length<period+1)return[];const out=[];
  for(let end=period;end<src.length;end++){
    let gain=0,loss=0;for(let i=end-period+1;i<=end;i++){const d=src[i]-src[i-1];if(d>0)gain+=d;else loss-=d}
    const ag=gain/period,al=loss/period;out.push(al===0?100:100-(100/(1+ag/al)));
  }
  return out;
}
function indicatorSnapshot(klines){
  const rows=Array.isArray(klines)?klines.filter(Array.isArray):[];const closes=rows.map(close).filter(Number.isFinite);
  if(closes.length<30)return{rsi:null,macdHist:null,stochRsi:null,k:null,d:null,j:null,score:0,aligned:false,overheated:false};
  const rsiVals=rsiSeries(closes,14),rsi=rsiVals.length?rsiVals[rsiVals.length-1]:null;
  const e12=emaSeries(closes,12),e26=emaSeries(closes,26);const len=Math.min(e12.length,e26.length);const macd=[];
  for(let i=0;i<len;i++)macd.push(e12[e12.length-len+i]-e26[e26.length-len+i]);const signal=emaSeries(macd,9);const macdHist=macd.length&&signal.length?macd[macd.length-1]-signal[signal.length-1]:null;
  const recentRsi=rsiVals.slice(-14),rsiMin=recentRsi.length?Math.min(...recentRsi):null,rsiMax=recentRsi.length?Math.max(...recentRsi):null;
  const stochRsi=rsi!=null&&rsiMin!=null&&rsiMax!=null&&rsiMax>rsiMin?((rsi-rsiMin)/(rsiMax-rsiMin))*100:null;
  let k=null,d=null,j=null;const window=rows.slice(-9),hh=window.length?Math.max(...window.map(high).filter(Number.isFinite)):null,ll=window.length?Math.min(...window.map(low).filter(Number.isFinite)):null,last=closes[closes.length-1];
  if(hh!=null&&ll!=null&&hh>ll){const rsv=((last-ll)/(hh-ll))*100;k=clamp(rsv,0,100);d=clamp((50*2+k)/3,0,100);j=3*k-2*d}
  let score=0;if(rsi!=null&&rsi>=50&&rsi<72)score++;if(macdHist!=null&&macdHist>0)score++;if(stochRsi!=null&&stochRsi>=20&&stochRsi<=85)score++;if(k!=null&&d!=null&&k>d&&j<100)score++;
  const overheated=(rsi!=null&&rsi>=75)||(stochRsi!=null&&stochRsi>=95)||(j!=null&&j>=110);
  return{rsi,macdHist,stochRsi,k,d,j,score,aligned:score>=3,overheated};
}
function combineMomentum(oneHour,fifteen){
  const a=indicatorSnapshot(oneHour),b=indicatorSnapshot(fifteen);const score=Math.round((a.score+b.score)/2);return{
    aligned:(a.aligned||b.aligned)&&score>=3,overheated:Boolean(a.overheated||b.overheated),score,
    rsi1h:a.rsi,rsi15m:b.rsi,macd1h:a.macdHist,macd15m:b.macdHist,stochRsi1h:a.stochRsi,stochRsi15m:b.stochRsi,
    kdj1h:{k:a.k,d:a.d,j:a.j},kdj15m:{k:b.k,d:b.d,j:b.j}
  }
}

function metrics(klines){
  const rows=Array.isArray(klines)?klines.filter(Array.isArray):[];
  if(rows.length<2)return{state:'unknown',structure:'neutral',returnPct:null,lastBarReturnPct:null,volumeAcceleration:null,takerRatio:null,pullback:false,reaccumulating:false};
  const closes=rows.map(close).filter(v=>v!=null),vols=rows.map(volume).filter(v=>v!=null);
  if(closes.length<2)return{state:'unknown',structure:'neutral',returnPct:null,lastBarReturnPct:null,volumeAcceleration:null,takerRatio:null,pullback:false,reaccumulating:false};
  const first=closes[Math.max(0,closes.length-30)],last=closes[closes.length-1];
  const ret=first?((last/first)-1)*100:null;
  const recentRet=lastBarReturnPct(rows);
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
  return{state,structure,returnPct:ret,lastBarReturnPct:recentRet,volumeAcceleration,takerRatio,pullback,reaccumulating};
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
  const priceChange1h=finite(tfMetrics['1h']?.lastBarReturnPct),priceChange15m=finite(tfMetrics['15m']?.lastBarReturnPct);
  const volumeAcceleration4h=finite(tfMetrics['4h']?.volumeAcceleration),volumeAcceleration1h=finite(tfMetrics['1h']?.volumeAcceleration),volumeAcceleration15m=finite(tfMetrics['15m']?.volumeAcceleration);
  const volumeIncreasing5m=consecutiveVolumeIncreases(frames['5m']);
  const structureShift4h=tfMetrics['4h']?.structure==='bullish'&&finite(tfMetrics['4h']?.lastBarReturnPct)!=null&&tfMetrics['4h'].lastBarReturnPct>=0;
  const lowTrendState=lowTrend(frames['1h']);
  const breakout=isBreakout(frames['1h']);
  const oiChangePct=finite(input.oiChangePct),fundingPct=finite(input.fundingPct);
  const pullback=Boolean(tfMetrics['4h'].pullback||tfMetrics['1h'].pullback);
  const reaccumulating=Boolean(tfMetrics['4h'].reaccumulating||tfMetrics['1h'].reaccumulating||tfMetrics['15m'].reaccumulating);
  const momentumSignals=combineMomentum(frames['1h'],frames['15m']);
  const momentum=momentumSignals.overheated?'overheated':structure==='bullish'&&takerRatio!=null&&takerRatio<=.87?'cooling':structure==='bullish'&&volumeAcceleration!=null&&volumeAcceleration>=1.4?'building':structure==='bearish'?'weak':'neutral';
  const derivedAlert=structure==='bullish'&&takerRatio!=null&&takerRatio>=1.15&&volumeAcceleration!=null&&volumeAcceleration>=1.5?'ARMED':'WATCH';
  const alertState=String(input.alertState||derivedAlert).toUpperCase();
  const preSurge=PreSurge.evaluate({dataState:String(input.dataState||'unknown').toLowerCase(),bias:structure,takerRatio,oiChangePct,fundingPct,volumeAcceleration,alertState});
  const reasons=[];
  if(structure==='bullish')reasons.push('상위 시간봉 상승 구조');else if(structure==='bearish')reasons.push('상위 시간봉 하락 구조');else reasons.push('상위 시간봉 방향 혼조');
  if(volumeAcceleration!=null&&volumeAcceleration>=1.4)reasons.push(`단기 거래량 ${volumeAcceleration.toFixed(2)}배 가속`);
  if(takerRatio!=null){if(takerRatio>=1.15)reasons.push(`단기 매수 체결 ${takerRatio.toFixed(2)}배 우위`);else if(takerRatio<=.87)reasons.push(`단기 매도 체결 ${takerRatio.toFixed(2)}배 우위`)}
  if(momentumSignals.aligned)reasons.push('RSI·MACD·Stoch RSI·KDJ 모멘텀 정렬');else if(momentumSignals.overheated)reasons.push('단기 모멘텀 과열');
  if(oiChangePct!=null)reasons.push(`OI ${oiChangePct>=0?'+':''}${oiChangePct.toFixed(2)}%`);
  if(pullback&&reaccumulating)reasons.push('눌림 구간 재축적 조건 관찰');
  return{
    symbol:String(input.symbol||'').toUpperCase(),dataState:String(input.dataState||'unknown').toLowerCase(),structure,momentum,alertState,
    takerRatio,volumeAcceleration,volumeAcceleration4h,volumeAcceleration1h,volumeAcceleration15m,volumeIncreasing5m,structureShift4h,lowTrend:lowTrendState,breakout,
    priceChange1h,priceChange15m,oiChangePct,fundingPct,preSurge,tfState,pullback,reaccumulating,momentumSignals,reasons:reasons.slice(0,5),updatedAt:Date.now()
  };
}

module.exports={TF_ORDER,metrics,indicatorSnapshot,combineMomentum,consecutiveVolumeIncreases,analyzeDeep};

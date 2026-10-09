'use strict';
const {detectBowlSymmetry}=require('./bowl-symmetry.js');
const VERSION='PATTERN_EVIDENCE_SHADOW_v1';
function number(v){const n=Number(v);return Number.isFinite(n)?n:null}
function valid(c){return c&&c.open>0&&c.high>0&&c.low>0&&c.close>0&&c.volume>=0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.closeTime>=c.openTime}
function toClosedCandles(rows,asOf){
  if(!Array.isArray(rows)||!Number.isFinite(Number(asOf)))return [];
  const byOpen=new Map();
  for(const r of rows){
    const array=Array.isArray(r);
    const candle={openTime:number(array?r[0]:r?.openTime),open:number(array?r[1]:r?.open),high:number(array?r[2]:r?.high),
      low:number(array?r[3]:r?.low),close:number(array?r[4]:r?.close),volume:number(array?r[5]:r?.volume),
      closeTime:number(array?r[6]:r?.closeTime)};
    if(valid(candle)&&candle.closeTime<=Number(asOf))byOpen.set(candle.openTime,candle);
  }
  return [...byOpen.values()].sort((a,b)=>a.openTime-b.openTime);
}
function candlePatterns(candles){
  if(!Array.isArray(candles)||candles.length<2)return [];
  const a=candles.at(-2),b=candles.at(-1),range=b.high-b.low;
  if(range<=0)return [];
  const body=Math.abs(b.close-b.open),top=b.high-Math.max(b.open,b.close),bottom=Math.min(b.open,b.close)-b.low;
  const out=[];
  // A small real body near the candle top and a long lower wick.
  const prior=candles.slice(-7,-1);
  const downtrend=prior.length>=4&&prior.at(-1).close<prior[0].close;
  if(downtrend&&body>0&&bottom>=body*2&&top<=body*.5&&body/range<=.35)
    out.push({key:'HAMMER',label:'하락 후 망치형',direction:'possible-bullish',confirmed:false});
  if(body/range<=.1)out.push({key:'DOJI',label:'도지 · 방향 미확인',direction:'neutral',confirmed:false});
  if(a.close<a.open&&b.close>b.open&&b.open<=a.close&&b.close>=a.open)
    out.push({key:'BULLISH_ENGULFING',label:'상승 장악형',direction:'possible-bullish',confirmed:false});
  if(a.close>a.open&&b.close<b.open&&b.open>=a.close&&b.close<=a.open)
    out.push({key:'BEARISH_ENGULFING',label:'하락 장악형',direction:'possible-bearish',confirmed:false});
  return out;
}
function frameEvidence(rows,asOf,{timeframe,options}){
  const closed=toClosedCandles(rows,asOf),latest=closed.at(-1)||null;
  if(closed.length<80)return {timeframe,status:'INSUFFICIENT_HISTORY',closedBars:closed.length,asOf:Number(asOf),lastClosedTime:latest?.closeTime??null,
    bowl:{status:'INSUFFICIENT_HISTORY',signal:false},candlestickPatterns:[]};
  const bowl=detectBowlSymmetry(closed,options);
  return {timeframe,status:'READY',closedBars:closed.length,asOf:Number(asOf),lastClosedTime:latest?.closeTime??null,
    bowl,candlestickPatterns:candlePatterns(closed)};
}
function analyzePatternEvidence({frames={},asOf,options={}}={}){
  if(!Number.isFinite(Number(asOf))||Number(asOf)<=0)return{version:VERSION,shadowOnly:true,status:'UNAVAILABLE',reason:'AS_OF_REQUIRED'};
  const daily=frameEvidence(frames['1d'],asOf,{timeframe:'1d',options:{requireLongMa:true,...options}});
  const fourHour=frameEvidence(frames['4h'],asOf,{timeframe:'4h',options:{requireLongMa:false,...options}});
  return{version:VERSION,shadowOnly:true,status:daily.status==='READY'&&fourHour.status==='READY'?'READY':'PARTIAL',
    daily,fourHour,note:'Research-only. No scan-class or trade-signal promotion. Closing timestamps must be <= asOf.'};
}
module.exports={VERSION,toClosedCandles,candlePatterns,analyzePatternEvidence};

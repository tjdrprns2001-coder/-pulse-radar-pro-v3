(function(root,factory){const dep=typeof module==='object'&&module.exports?require('./bowl-symmetry.js'):root.PulseBowlSymmetry;const api=factory(dep);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulsePatternEvidence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Bowl){
'use strict';
const {detectBowlSymmetry}=Bowl;
const VERSION='PATTERN_EVIDENCE_SHADOW_v2';
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
 if(!(range>0))return [];
 const body=Math.abs(b.close-b.open),top=b.high-Math.max(b.open,b.close),bottom=Math.min(b.open,b.close)-b.low;
 const bodyA=Math.abs(a.close-a.open),prior=candles.slice(-7,-1);
 const downtrend=prior.length>=4&&prior.at(-1).close<prior[0].close;
 const uptrend=prior.length>=4&&prior.at(-1).close>prior[0].close;
 const out=[],add=(key,label,direction)=>out.push({key,label,direction,confirmed:false});
 if(downtrend&&body>0&&bottom>=body*2&&top<=body*.5&&body/range<=.35)add('HAMMER','하락 후 망치형','possible-bullish');
 if(downtrend&&body>0&&top>=body*2&&bottom<=body*.5&&body/range<=.35)add('INVERTED_HAMMER','역망치형','possible-bullish');
 if(uptrend&&body>0&&top>=body*2&&bottom<=body*.5&&body/range<=.35)add('SHOOTING_STAR','상승 후 유성형','possible-bearish');
 if(body/range<=.1){
   add('DOJI','도지 · 방향 미확인','neutral');
   if(top<=range*.1&&bottom>=range*.6)add('DRAGONFLY_DOJI','잠자리 도지','neutral');
   if(bottom<=range*.1&&top>=range*.6)add('GRAVESTONE_DOJI','비석 도지','neutral');
 }
 if(a.close<a.open&&b.close>b.open&&b.open<=a.close&&b.close>=a.open)add('BULLISH_ENGULFING','상승 장악형','possible-bullish');
 if(a.close>a.open&&b.close<b.open&&b.open>=a.close&&b.close<=a.open)add('BEARISH_ENGULFING','하락 장악형','possible-bearish');
 if(body>0&&bodyA>body*1.5&&a.close<a.open&&b.close>b.open&&
   Math.min(b.open,b.close)>=a.close&&Math.max(b.open,b.close)<=a.open)add('BULLISH_HARAMI','상승 잉태형','possible-bullish');
 if(body>0&&bodyA>body*1.5&&a.close>a.open&&b.close<b.open&&
   Math.min(b.open,b.close)>=a.open&&Math.max(b.open,b.close)<=a.close)add('BEARISH_HARAMI','하락 잉태형','possible-bearish');
 if(a.open>a.close&&b.close>b.open&&b.open<=a.close*1.002&&b.close>(a.open+a.close)/2&&b.close<a.open)add('PIERCING','상승 관통형','possible-bullish');
 if(a.close>a.open&&b.open>=a.close*.998&&b.close<(a.open+a.close)/2&&b.close>a.open)add('DARK_CLOUD','먹구름형','possible-bearish');
 if(candles.length>=3){
   const p=candles.at(-3),pBody=Math.abs(p.close-p.open),aRange=a.high-a.low;
   if(p.open>p.close&&pBody>(p.high-p.low)*.45&&body>pBody*.45&&
      bodyA<pBody*.5&&aRange>0&&b.close>b.open&&b.close>(p.open+p.close)/2)
     add('MORNING_STAR','샛별형','possible-bullish');
   if(p.close>p.open&&pBody>(p.high-p.low)*.45&&body>pBody*.45&&
      bodyA<pBody*.5&&aRange>0&&b.close<b.open&&b.close<(p.open+p.close)/2)
     add('EVENING_STAR','석별형','possible-bearish');
 }
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
return{VERSION,toClosedCandles,candlePatterns,frameEvidence,analyzePatternEvidence};

});

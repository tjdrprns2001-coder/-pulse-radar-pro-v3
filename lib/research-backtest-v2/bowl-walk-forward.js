'use strict';
// Closed-bar exploratory walk-forward study. No model training, orders or signal promotion.
const {toClosedCandles}=require('../coin-scan/pattern-evidence.js');
const {detectBowlSymmetry}=require('../coin-scan/bowl-symmetry.js');
const DAY=86400000;
const STEPS=Object.freeze({'1d':DAY,'4h':4*3600000});
const SPLITS=['train','validation','test'];
function pct(x){return Number.isFinite(x)?Math.round(x*10000)/10000:null}
function avg(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}
function aggregate(rows){
 const n=rows.length,hits=rows.filter(x=>x.hit72h10).length,h20=rows.filter(x=>x.hit7d20).length,h30=rows.filter(x=>x.hit72h30).length;
 return {count:n,hit72h10Count:hits,hit72h10Rate:n?hits/n:null,hit7d20Rate:n?h20/n:null,
   hit72h30Rate:n?h30/n:null,mean7dReturnPct:avg(rows.map(x=>x.return7dPct).filter(Number.isFinite)),
   mean7dMfePct:avg(rows.map(x=>x.mfe7dPct).filter(Number.isFinite)),
   mean7dMaePct:avg(rows.map(x=>x.mae7dPct).filter(Number.isFinite))};
}
function outcome(candles,i,step){
 const end=i+7*DAY/step,three=i+3*DAY/step,entry=candles[i].close;
 if(!Number.isInteger(end)||end>=candles.length||!(entry>0))return null;
 let max7=-Infinity,min7=Infinity,max3=-Infinity;
 for(let j=i+1;j<=end;j++){
   const c=candles[j];
   if(c.openTime-candles[j-1].openTime!==step)return null;
   max7=Math.max(max7,c.high);min7=Math.min(min7,c.low);
   if(j<=three)max3=Math.max(max3,c.high);
 }
 return {return7dPct:pct((candles[end].close/entry-1)*100),mfe7dPct:pct((max7/entry-1)*100),
   mae7dPct:pct((min7/entry-1)*100),hit72h10:max3>=entry*1.10,
   hit72h30:max3>=entry*1.30,hit7d20:max7>=entry*1.20};
}
function splitOf(i,n,h,begin){
 const a=Math.floor(n*.6),b=Math.floor(n*.8);
 if(i>=begin&&i+h<a)return 'train';
 if(i>=a+h&&i+h<b)return 'validation';
 if(i>=b+h&&i+h<n)return 'test';
 return null; // explicit purge / embargo / censored tail
}
function compare(x,y){return x?.hit72h10Rate!=null&&y?.hit72h10Rate!=null&&y.hit72h10Rate>0?x.hit72h10Rate/y.hit72h10Rate:null}
function evaluateBowlWalkForward({symbol,rows,asOf,timeframe='1d',source='BINANCE_FUTURES',options={}}={}){
 const tf=String(timeframe).toLowerCase(),step=STEPS[tf],minVolumeRatio=options.minVolumeRatio??1.2,
   minHistory=Math.max(448,Number(options.minHistory)||448);
 const header={version:'BOWL_WALK_FORWARD_v1',shadowOnly:true,symbol:String(symbol||'').toUpperCase(),
   timeframe:tf,source,thresholds:{h72:10,h72High:30,d7High:20},model:'rule-based-no-training',
   execution:'hypothetical signal-close anchor; not an executable fill; excludes fees, funding and slippage'};
 if(!step||!/^([A-Z0-9]{2,25})USDT$/.test(header.symbol)||!Number.isFinite(Number(asOf))||Number(asOf)<=0)
   return {...header,status:'INVALID_INPUT',reason:'symbol/asOf/timeframe required'};
 if(source!=='BINANCE_FUTURES')
   return {...header,status:'UNSUPPORTED_SOURCE',reason:'Single-venue Binance futures only; no venue mixing'};
 const candles=toClosedCandles(rows,asOf),n=candles.length,h=7*DAY/step,three=3*DAY/step;
 if(n<minHistory+h+20)
   return {...header,status:'INSUFFICIENT_HISTORY',closedBars:n,requiredBars:minHistory+h+20};
 const observations={train:{signals:[],controls:[],candidateCount:0,eligibleBars:0},validation:{signals:[],controls:[],candidateCount:0,eligibleBars:0},test:{signals:[],controls:[],candidateCount:0,eligibleBars:0}};
 let lastGap=0,gaps=0,detected=0,missing=0;
 // Exactly equal open-time spacing per timeframe. No cross-gap signals/labels.
 for(let i=1;i<n;i++){
   if(candles[i].openTime-candles[i-1].openTime!==step){gaps++;lastGap=i;}
   if(i<minHistory-1||i>=n-h)continue;
   if(i-lastGap+1<minHistory)continue;
   const split=splitOf(i,n,h,minHistory-1);
   if(!split)continue;
   const bucket=observations[split];bucket.eligibleBars++;
   const o=outcome(candles,i,step);
   if(!o){missing++;continue}
   // Deterministic calendar-spaced controls, chosen without reference to later returns.
   if((i-(minHistory-1))%h===0)bucket.controls.push({at:candles[i].closeTime,...o});
   const start=i-20,vAvg=avg(candles.slice(start,i).map(x=>x.volume));
   if(!(vAvg>0)||candles[i].volume/vAvg<minVolumeRatio)continue;
   const recentHigh=Math.max(...candles.slice(i-12,i).map(x=>x.high));
   if(candles[i].close<=recentHigh*1.005)continue;
   bucket.candidateCount++;
   const lookbackStart=Math.max(lastGap,i-520);
   const evidence=detectBowlSymmetry(candles.slice(lookbackStart,i+1),{
      minVolumeRatio,requireLongMa:tf==='1d',...options});
   if(evidence.status!=='BREAKOUT_CONFIRMED'||!evidence.signal)continue;
   detected++;bucket.signals.push({at:candles[i].closeTime,price:candles[i].close,asOf:candles[i].closeTime,
      status:evidence.status,declineBars:evidence.declineBars,baseBars:evidence.baseBars,
      symmetryRatio:pct(evidence.symmetryRatio),volumeRatio:pct(evidence.volumeRatio),...o});
 }
 const bySplit={};for(const key of SPLITS){const v=observations[key],s=aggregate(v.signals),b=aggregate(v.controls);
   bySplit[key]={eligibleBars:v.eligibleBars,breakoutCandidates:v.candidateCount,signals:s,controls:b,
     relativeHit72h10:compare(s,b)};}
 return {...header,status:'READY',asOf:Number(asOf),lastClosedTime:candles.at(-1).closeTime,
   closedBars:n,gapsExcluded:gaps,unavailableOutcomes:missing,patternCount:detected,
   trainValidationTest:'60/20/20 chronological; 7-day purge at both boundaries; same-bar no lookahead',
   sampling:'every 7 days at fixed index offset for controls; descriptive only, not causal matched comparison',
   bySplit,events:Object.fromEntries(SPLITS.map(k=>[k,observations[k].signals.slice(0,60)])),
   limitations:['only currently available symbols (survivorship bias)',
     'intrabar high thresholds may precede intrabar low; not a tradable fill',
     'no claim of predictive accuracy or statistical significance from small samples']};
}
module.exports={evaluateBowlWalkForward,outcome,aggregate,splitOf};

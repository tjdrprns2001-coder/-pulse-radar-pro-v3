'use strict';
const ELIGIBLE=new Set(['PRE-SURGE','ACCUMULATION-PRE','META-PRE','SECTOR-ROTATION','ANOMALY']);
const HORIZONS=Object.freeze({m15:900000,h1:3600000,h4:14400000,h24:86400000});
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function isEligibleClass(k){return ELIGIBLE.has(String(k||''))}
function bucketStart(ts){const n=finite(ts);return n==null?null:Math.floor(n/1800000)*1800000}
function snapshotId({symbol,scanClassKey,capturedAt}={}){return `${String(symbol||'').toUpperCase()}:${String(scanClassKey||'')}:${bucketStart(capturedAt)}`}
function targetTimestamps(ts){const n=finite(ts);return Object.fromEntries(Object.entries(HORIZONS).map(([k,ms])=>[k,n==null?null:n+ms]))}
function returnPct(entry,future){const a=finite(entry),b=finite(future);return a!=null&&a>0&&b!=null?((b/a)-1)*100:null}
function buildSnapshot(input={}){
  const scanClassKey=String(input.scanClassKey||input.scanClass?.key||'');
  const capturedAt=finite(input.capturedAt)??Date.now();
  const entryPrice=finite(input.entryPrice??input.lastPrice);
  const out={id:snapshotId({symbol:input.symbol,scanClassKey,capturedAt}),symbol:String(input.symbol||'').toUpperCase(),scanClassKey,scanClassLabel:String(input.scanClassLabel||input.scanClass?.label||scanClassKey),capturedAt,entryPrice,tradeSignal:input.tradeSignal?{level:String(input.tradeSignal.level||''),confidence:finite(input.tradeSignal.confidence)}:null,candidateScore:finite(input.candidateScore),sector:String(input.sector||'기타'),priceChange24h:finite(input.priceChange24h),volumeAcceleration:finite(input.volumeAcceleration),volumeAcceleration4h:finite(input.volumeAcceleration4h),volumeAcceleration1h:finite(input.volumeAcceleration1h),volumeAcceleration15m:finite(input.volumeAcceleration15m),takerRatio:finite(input.takerRatio),momentumSignals:input.momentumSignals?JSON.parse(JSON.stringify(input.momentumSignals)):null,reasons:Array.isArray(input.reasons)?input.reasons.slice(0,8).map(String):[],targets:targetTimestamps(capturedAt),version:String(input.version||'signal-performance-v1')};
  return Object.freeze(out);
}
function aggregate(records=[],minSamples=30){
  const arr=Array.isArray(records)?records:[];const evals=arr.filter(x=>x&&x.status==='evaluated'&&Number.isFinite(Number(x.returnPct))).map(x=>Number(x.returnPct));
  const pendingCount=arr.filter(x=>!x||x.status==='pending').length,unavailableCount=arr.filter(x=>x&&x.status==='unavailable').length;const sorted=[...evals].sort((a,b)=>a-b);const n=evals.length;
  const mean=n?evals.reduce((a,b)=>a+b,0)/n:null;const median=n?(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2):null;
  return{sampleCount:arr.length,evaluatedCount:n,pendingCount,unavailableCount,positiveRatio:n?evals.filter(x=>x>0).length/n:null,meanReturnPct:mean,medianReturnPct:median,bestReturnPct:n?sorted[n-1]:null,worstReturnPct:n?sorted[0]:null,sampleState:n>=minSamples?'통계 사용 가능':'표본 부족'};
}
module.exports={ELIGIBLE,HORIZONS,isEligibleClass,bucketStart,snapshotId,targetTimestamps,returnPct,buildSnapshot,aggregate};

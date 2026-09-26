'use strict';

const Sampling=require('./sampling-v3.js');

const VERSION='SAMPLING_V3_INTEGRITY_v1';
const INTERVAL_MS=Object.freeze({
  '1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,
  '1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'8h':28800000,
  '12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000
});
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function rowObj(r){
  return{
    openTime:finite(r?.[0]),open:finite(r?.[1]),high:finite(r?.[2]),low:finite(r?.[3]),close:finite(r?.[4]),
    volume:finite(r?.[5]),closeTime:finite(r?.[6]),quoteVolume:finite(r?.[7]),tradeCount:finite(r?.[8]),
    takerBuyBase:finite(r?.[9]),takerBuyQuote:finite(r?.[10])
  };
}
function annotateRows(rows=[],tf,{asOf=Date.now(),source='BINANCE_NATIVE',isSynthetic=false}={}){
  const ms=INTERVAL_MS[tf]||null,src=Array.isArray(rows)?rows:[];
  return src.map((r,i)=>{
    const x=rowObj(r),width=x.openTime!=null&&x.closeTime!=null?x.closeTime-x.openTime+1:null;
    const prev=i>0?rowObj(src[i-1]):null;
    const contiguous=!ms||!prev?.openTime||x.openTime-prev.openTime===ms;
    const isClosed=x.closeTime!=null&&x.closeTime<asOf;
    const isComplete=Boolean(isClosed&&(!ms||Math.abs((width??0)-ms)<=1)&&contiguous);
    return{...x,tf,source,isClosed,isComplete,isSynthetic:Boolean(isSynthetic),featureAvailableAt:x.closeTime};
  });
}
function asOfMerge(decisionTimes=[],htfRows=[],tf,{source='BINANCE_NATIVE'}={}){
  const rows=annotateRows(htfRows,tf,{asOf:Number.MAX_SAFE_INTEGER,source}).filter(x=>x.isComplete).sort((a,b)=>a.closeTime-b.closeTime);
  let j=-1;
  return (Array.isArray(decisionTimes)?decisionTimes:[]).map(t=>{
    const decisionTime=finite(t);while(j+1<rows.length&&rows[j+1].closeTime<decisionTime)j++;
    const feature=j>=0?rows[j]:null;
    return{decisionTime,feature,featureAvailableAt:feature?.closeTime??null,lookahead:Boolean(feature&&feature.closeTime>=decisionTime)};
  });
}
function auditSeries(rows=[],tf,{asOf=Date.now(),source='BINANCE_NATIVE',isSynthetic=false}={}){
  const ms=INTERVAL_MS[tf]||null,raw=Array.isArray(rows)?rows:[],input=raw.map(rowObj).filter(x=>x.openTime!=null&&x.closeTime!=null);
  let outOfOrder=0;for(let i=1;i<input.length;i++)if(input[i].openTime<input[i-1].openTime)outOfOrder++;
  const seen=new Set(),duplicates=[];for(const x of input){if(seen.has(x.openTime))duplicates.push(x.openTime);seen.add(x.openTime)}
  const ordered=[...input].sort((a,b)=>a.openTime-b.openTime);
  const closed=ordered.filter(x=>x.closeTime<asOf),openRows=ordered.filter(x=>x.closeTime>=asOf);
  const gaps=[],badWidth=[];
  if(ms){
    for(let i=0;i<closed.length;i++){
      const x=closed[i],width=x.closeTime-x.openTime+1;if(Math.abs(width-ms)>1)badWidth.push({openTime:x.openTime,width,expected:ms});
      if(i>0){const d=x.openTime-closed[i-1].openTime;if(d>ms)gaps.push({afterOpenTime:closed[i-1].openTime,nextOpenTime:x.openTime,missingApprox:Math.max(1,Math.round(d/ms)-1)});else if(d<ms)gaps.push({afterOpenTime:closed[i-1].openTime,nextOpenTime:x.openTime,overlap:true,deltaMs:d})}
    }
  }
  const invalidOhlc=closed.filter(x=>x.open==null||x.high==null||x.low==null||x.close==null||x.high<Math.max(x.open,x.close)||x.low>Math.min(x.open,x.close)).map(x=>x.openTime);
  const issues=[];
  if(duplicates.length)issues.push('DUPLICATE_OPEN_TIME');
  if(outOfOrder)issues.push('OUT_OF_ORDER');
  if(gaps.length)issues.push('GAP_OR_OVERLAP');
  if(badWidth.length)issues.push('BAD_INTERVAL_WIDTH');
  if(invalidOhlc.length)issues.push('INVALID_OHLC');
  const status=invalidOhlc.length||badWidth.length?'FAIL':duplicates.length||outOfOrder||gaps.length?'WARN':'PASS';
  return{
    version:VERSION,tf,source,isSynthetic,status,rowCount:input.length,closedCount:closed.length,openCount:openRows.length,
    duplicateCount:duplicates.length,outOfOrderCount:outOfOrder,gapCount:gaps.length,badWidthCount:badWidth.length,invalidOhlcCount:invalidOhlc.length,
    lastClosedTime:closed.at(-1)?.closeTime??null,featureAvailableAt:closed.at(-1)?.closeTime??null,
    issues,duplicates:duplicates.slice(0,20),gaps:gaps.slice(0,20),badWidth:badWidth.slice(0,20),invalidOhlc:invalidOhlc.slice(0,20)
  };
}
function safeAsOfRow(rows=[],decisionTime=Date.now()){
  const a=(Array.isArray(rows)?rows:[]).map(rowObj).filter(x=>x.closeTime!=null&&x.closeTime<decisionTime).sort((a,b)=>a.closeTime-b.closeTime);
  return a.at(-1)||null;
}
function auditFrameSet(frames={},decisionTime=Date.now()){
  const byTf={},violations=[];
  for(const [tf,rows] of Object.entries(frames||{})){
    const a=auditSeries(rows,tf,{asOf:decisionTime});
    byTf[tf]=a;
    const latest=safeAsOfRow(rows,decisionTime);
    if(latest?.closeTime>=decisionTime)violations.push({tf,closeTime:latest.closeTime,decisionTime});
  }
  const statuses=Object.values(byTf).map(x=>x.status);
  return{version:VERSION,status:violations.length||statuses.includes('FAIL')?'FAIL':statuses.includes('WARN')?'WARN':'PASS',decisionTime,lookaheadViolations:violations,byTf};
}
function relPct(a,b){a=finite(a);b=finite(b);if(a==null||b==null)return null;const den=Math.max(Math.abs(b),1e-12);return Math.abs(a-b)/den*100}
function compareNativeSynthetic(nativeRows=[],syntheticRows=[],tf,{asOf=Date.now(),priceTolerancePct=.02,volumeTolerancePct=.25}={}){
  const n=new Map((Array.isArray(nativeRows)?nativeRows:[]).map(r=>[finite(r?.[0]),rowObj(r)]).filter(x=>x[0]!=null));
  const s=new Map((Array.isArray(syntheticRows)?syntheticRows:[]).map(r=>[finite(r?.[0]),rowObj(r)]).filter(x=>x[0]!=null));
  const matches=[],mismatches=[];
  for(const [t,a] of n){
    const b=s.get(t);if(!b||a.closeTime>=asOf||b.closeTime>=asOf)continue;
    const diffs={
      openPct:relPct(a.open,b.open),highPct:relPct(a.high,b.high),lowPct:relPct(a.low,b.low),closePct:relPct(a.close,b.close),
      volumePct:relPct(a.volume,b.volume),quoteVolumePct:relPct(a.quoteVolume,b.quoteVolume),
      tradeCountDiff:(a.tradeCount!=null&&b.tradeCount!=null)?Math.abs(a.tradeCount-b.tradeCount):null,
      takerBuyBasePct:relPct(a.takerBuyBase,b.takerBuyBase)
    };
    const priceMax=Math.max(...[diffs.openPct,diffs.highPct,diffs.lowPct,diffs.closePct].filter(Number.isFinite),0);
    const bad=priceMax>priceTolerancePct||
      (Number.isFinite(diffs.volumePct)&&diffs.volumePct>volumeTolerancePct)||
      (Number.isFinite(diffs.quoteVolumePct)&&diffs.quoteVolumePct>volumeTolerancePct)||
      (Number.isFinite(diffs.takerBuyBasePct)&&diffs.takerBuyBasePct>volumeTolerancePct)||
      (Number.isFinite(diffs.tradeCountDiff)&&diffs.tradeCountDiff>0);
    const rec={openTime:t,priceMaxPct:priceMax,...diffs};
    (bad?mismatches:matches).push(rec);
  }
  const compared=matches.length+mismatches.length;
  return{version:VERSION,tf,status:compared===0?'NO_OVERLAP':mismatches.length?'MISMATCH':'PASS',compared,matchCount:matches.length,mismatchCount:mismatches.length,matchRate:compared?matches.length/compared:null,mismatches:mismatches.slice(-20)};
}
function auditNativeVsSynthetic({rows1m=[],native5m=[],native15m=[],asOf=Date.now()}={}){
  const synthetic5m=Sampling.resampleOHLCV(rows1m,'1m','5m',{asOf,dropPartial:true});
  const synthetic15m=Sampling.resampleOHLCV(rows1m,'1m','15m',{asOf,dropPartial:true});
  const five=compareNativeSynthetic(native5m,synthetic5m,'5m',{asOf});
  const fifteen=compareNativeSynthetic(native15m,synthetic15m,'15m',{asOf});
  const status=[five.status,fifteen.status].includes('MISMATCH')?'MISMATCH':[five.status,fifteen.status].every(x=>x==='PASS')?'PASS':'PARTIAL';
  return{version:VERSION,status,synthetic:{'5m':synthetic5m.length,'15m':synthetic15m.length},comparisons:{'5m':five,'15m':fifteen}};
}
module.exports={VERSION,INTERVAL_MS,rowObj,annotateRows,asOfMerge,auditSeries,safeAsOfRow,auditFrameSet,compareNativeSynthetic,auditNativeVsSynthetic};

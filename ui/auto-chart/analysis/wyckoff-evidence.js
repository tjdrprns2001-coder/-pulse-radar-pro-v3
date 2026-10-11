(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseWyckoffEvidence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const VERSION='WYCKOFF_CANDLE_EVIDENCE_v1';
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
function detect(rows,{asOf,lookback=60,minBars=32}={}){
 const raw=Array.isArray(rows)?rows:[];
 // Closed candles ONLY; no future candle lookahead or trade-level inference.
 const bars=raw.filter(c=>c?.closed===true&&finite(c.closeTime)&&finite(c.openTime)&&Number(c.closeTime)<=Number(asOf)&&
   ['open','high','low','close','volume'].every(k=>finite(c[k]))&&Number(c.high)>=Math.max(Number(c.open),Number(c.close))&&Number(c.low)<=Math.min(Number(c.open),Number(c.close))&&Number(c.volume)>=0)
  .slice().sort((a,b)=>Number(a.openTime)-Number(b.openTime)).slice(-Math.max(34,Math.min(150,lookback+1)));
 const limited=bars.slice(-Math.min(150,Math.max(32,lookback)));
 const latest=limited.at(-1)||null,base={version:VERSION,shadowOnly:true,source:'CLOSED_OHLCV_ONLY',asOf:Number(asOf)||null,
  closedBars:limited.length,confirmedActorIdentity:false,cvdAvailable:false,absorptionVerified:false,orderbookAvailable:false,
  lastClosedTime:latest?.closeTime??null};
 if(limited.length<minBars)return{...base,status:'INSUFFICIENT_HISTORY',pattern:'NONE',evidence:[],contradictions:[],invalidation:null};
 const pre=limited.slice(-31,-1),a=limited.at(-1),lo=Math.min(...pre.map(x=>Number(x.low))),hi=Math.max(...pre.map(x=>Number(x.high)));
 const median=xs=>{const q=xs.slice().sort((x,y)=>x-y);return(q[Math.floor((q.length-1)/2)]+q[Math.floor(q.length/2)])/2};
 const refVol=Math.max(1e-8,median(pre.map(x=>Number(x.volume))));
 const rvol=Number(a.volume)/refVol,boxPct=hi>0?100*(hi-lo)/hi:null;
 const within=pre.filter(x=>Number(x.close)>=lo&&Number(x.close)<=hi).length/pre.length;
 const spring=Number(a.low)<lo&&Number(a.close)>lo&&Number(a.close)<hi;
 const upthrust=Number(a.high)>hi&&Number(a.close)<hi&&Number(a.close)>lo;
 const closePos=(Number(a.close)-Number(a.low))/Math.max(1e-8,Number(a.high)-Number(a.low));
 const bullish= spring&&closePos>.55;
 const bearish=upthrust&&closePos<.45;
 const boxQualified=within>=.85&&boxPct!==null&&boxPct<=18;
 const type=boxQualified?(bullish?'SPRING_CANDIDATE':bearish?'UPTHRUST_CANDIDATE':'RANGE_WATCH'):'NO_PATTERN';
 const evidence=[],contradictions=[];
 evidence.push({field:'historicalRangeLow',value:lo,label:'직전 30봉 박스 하단'});
 evidence.push({field:'historicalRangeHigh',value:hi,label:'직전 30봉 박스 상단'});
 evidence.push({field:'rangeWidthPct',value:boxPct,label:'박스 폭 %'});
 evidence.push({field:'previousRangeContainment',value:within,label:'이전 종가 박스 내 비중'});
 evidence.push({field:'lastVolumeVsMedian',value:rvol,label:'최근봉/기존 거래량 중앙값'});
 if(spring)evidence.push({field:'springReclaim',value:1,label:'박스 하단 이탈 후 확정봉 종가 복귀'});
 if(upthrust)evidence.push({field:'upthrustRejection',value:1,label:'박스 상단 이탈 후 확정봉 종가 복귀'});
 if(!boxQualified)contradictions.push('횡보 박스 폭 또는 유지 기준 미달');
 if((spring||upthrust)&&rvol<1.2)contradictions.push('반전 시 거래량 증가 근거 부족');
 if(type==='RANGE_WATCH')contradictions.push('Spring/Upthrust 재진입 구조 미확인');
 const invalidation=type==='SPRING_CANDIDATE'?{direction:'bullish',price:Number(a.low),reason:'Spring 저가 재이탈'}:
  type==='UPTHRUST_CANDIDATE'?{direction:'bearish',price:Number(a.high),reason:'Upthrust 고가 재돌파'}:null;
 return{...base,status:'READY',pattern:type,range:{low:lo,high:hi,widthPct:boxPct,insideRatio:within},
  observed:{rvolMedian:rvol,closePosition:closePos,spring,upthrust},evidence,contradictions,invalidation,
  smcSweepConfluence:(type==='SPRING_CANDIDATE'||type==='UPTHRUST_CANDIDATE')?'POTENTIAL_SWEEP_NEEDS_SMC_CONFIRM':'NONE',
  interpretation:type==='SPRING_CANDIDATE'?'매집 가능성 관찰 · 실제 매집 확정 아님':type==='UPTHRUST_CANDIDATE'?'분산 가능성 관찰 · 실제 분산 확정 아님':type==='RANGE_WATCH'?'횡보 관찰 · 아직 방향 미확인':'매집·분산 구조 확인되지 않음'};
}
return{VERSION,detect};
});
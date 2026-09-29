(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartRanges=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function indexAtOrAfter(candles,ts){for(let i=0;i<candles.length;i++)if(candles[i].closeTime>=ts)return i;return 0}
function detect(candles,levels,{atrNow,timeframe,minWidthAtr=1.5,minInsideRatio=.68,lookback=80,excludeTail=2}={}){
  if(!candles?.length||!levels?.length||!(atrNow>0))return null;
  const last=candles.at(-1),supports=levels.filter(x=>x.type==='support'),resistances=levels.filter(x=>x.type==='resistance'),pairs=[];
  for(const s of supports)for(const r of resistances){
    if(r.low<=s.high)continue;const width=r.mid-s.mid,widthAtr=width/atrNow;if(widthAtr<minWidthAtr)continue;
    const knownAt=Math.max(Number(s.knownAt)||0,Number(r.knownAt)||0),start=Math.max(indexAtOrAfter(candles,knownAt),candles.length-lookback),end=Math.max(start,candles.length-1-excludeTail),sample=candles.slice(start,end+1);if(sample.length<8)continue;
    const inside=sample.filter(c=>c.close<=r.high+atrNow*.10&&c.close>=s.low-atrNow*.10).length,insideRatio=inside/sample.length;
    if(insideRatio<minInsideRatio)continue;
    const recency=Math.max(s.lastPivotIndex||0,r.lastPivotIndex||0)/Math.max(1,candles.length-1),score=(s.touches+r.touches)*12+insideRatio*45+recency*15-Math.max(0,widthAtr-8);
    pairs.push({id:'RANGE-'+timeframe+'-'+s.id+'-'+r.id,kind:'range',timeframe,low:s.low,high:r.high,mid:(s.mid+r.mid)/2,supportId:s.id,resistanceId:r.id,support:{...s},resistance:{...r},sourceIds:[s.id,r.id],knownAt,startAt:candles[start]?.openTime??knownAt,insideRatio,widthAtr,score,status:'valid',generation:'automatic',frozen:false,currentInside:last.close<=r.high&&last.close>=s.low});
  }
  return pairs.sort((a,b)=>b.score-a.score)[0]||null;
}
return{detect};
});
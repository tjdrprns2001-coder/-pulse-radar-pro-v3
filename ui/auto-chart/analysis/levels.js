(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartLevels=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function independentTouches(swings,minBars=3){const out=[];for(const s of [...swings].sort((a,b)=>a.pivotIndex-b.pivotIndex)){if(!out.length||s.pivotIndex-out.at(-1).pivotIndex>=minBars)out.push(s);else{const prev=out.at(-1);if(s.type==='H'&&s.price>prev.price)out[out.length-1]=s;if(s.type==='L'&&s.price<prev.price)out[out.length-1]=s}}return out}
function build(swings,{atrNow,currentPrice,timeframe,zoneAtr=.20,minTouches=2,maxEachSide=3}={}){
  if(!Number.isFinite(atrNow)||atrNow<=0||!Number.isFinite(currentPrice))return[];
  const tolerance=Math.max(atrNow*zoneAtr,Math.abs(currentPrice)*.0008),clusters=[];
  for(const s of swings){
    let c=clusters.find(x=>Math.abs(x.center-s.price)<=tolerance);
    if(!c){c={center:s.price,items:[]};clusters.push(c)}
    c.items.push(s);c.center=c.items.reduce((a,b)=>a+b.price,0)/c.items.length;
  }
  const zones=clusters.map((c,idx)=>{
    const touches=independentTouches(c.items),knownAt=Math.max(...touches.map(x=>Number(x.knownAt)||0)),prices=touches.map(x=>x.price),center=prices.reduce((a,b)=>a+b,0)/Math.max(1,prices.length),side=center>=currentPrice?'resistance':'support';
    return{id:'LEVEL-'+timeframe+'-'+side+'-'+idx,kind:'price-zone',type:side,low:Math.min(...prices)-tolerance*.35,high:Math.max(...prices)+tolerance*.35,mid:center,timeframe,evidence:'confirmed swing '+(side==='resistance'?'high':'low')+' cluster',sourceIds:touches.map(x=>x.id),touches:touches.length,knownAt,status:touches.length>=minTouches?'valid':'candidate',generation:'automatic',lastPivotIndex:Math.max(...touches.map(x=>x.pivotIndex))};
  }).filter(x=>x.touches>=minTouches);
  const below=zones.filter(x=>x.mid<currentPrice).sort((a,b)=>b.mid-a.mid).slice(0,maxEachSide),above=zones.filter(x=>x.mid>=currentPrice).sort((a,b)=>a.mid-b.mid).slice(0,maxEachSide);
  return[...below,...above];
}
return{independentTouches,build};
});
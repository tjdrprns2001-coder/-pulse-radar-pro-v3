(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartLevels=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function independentTouches(swings,minBars=3){const out=[];for(const s of [...swings].sort((a,b)=>a.pivotIndex-b.pivotIndex)){if(!out.length||s.pivotIndex-out.at(-1).pivotIndex>=minBars)out.push(s);else{const prev=out.at(-1);if(s.type==='H'&&s.price>prev.price)out[out.length-1]=s;if(s.type==='L'&&s.price<prev.price)out[out.length-1]=s}}return out}
function clusterSide(swings,{atrNow,timeframe,zoneAtr,minTouches,type}){
  const currentRef=swings.at(-1)?.price||1,tolerance=Math.max(atrNow*zoneAtr,Math.abs(currentRef)*.0008),clusters=[];
  for(const s of swings.filter(x=>x.type===type)){
    let c=clusters.find(x=>Math.abs(x.center-s.price)<=tolerance);
    if(!c){c={center:s.price,items:[]};clusters.push(c)}
    c.items.push(s);c.center=c.items.reduce((a,b)=>a+b.price,0)/c.items.length;
  }
  return clusters.map((c,idx)=>{
    const touches=independentTouches(c.items),prices=touches.map(x=>x.price);if(touches.length<minTouches)return null;
    const center=prices.reduce((a,b)=>a+b,0)/prices.length,side=type==='H'?'resistance':'support',knownAt=Math.max(...touches.map(x=>Number(x.knownAt)||0));
    return{id:'LEVEL-'+timeframe+'-'+side+'-'+idx,kind:'price-zone',type:side,origin:type==='H'?'swing-high-cluster':'swing-low-cluster',low:Math.min(...prices)-tolerance*.35,high:Math.max(...prices)+tolerance*.35,mid:center,timeframe,evidence:'confirmed '+(type==='H'?'swing high':'swing low')+' cluster',sourceIds:touches.map(x=>x.id),touches:touches.length,knownAt,status:'valid',generation:'automatic',lastPivotIndex:Math.max(...touches.map(x=>x.pivotIndex))};
  }).filter(Boolean);
}
function build(swings,{atrNow,currentPrice,timeframe,zoneAtr=.20,minTouches=2,maxEachSide=3}={}){
  if(!Number.isFinite(atrNow)||atrNow<=0||!Number.isFinite(currentPrice))return[];
  const all=[...clusterSide(swings,{atrNow,timeframe,zoneAtr,minTouches,type:'L'}),...clusterSide(swings,{atrNow,timeframe,zoneAtr,minTouches,type:'H'})];
  const support=all.filter(x=>x.type==='support').sort((a,b)=>Math.abs(a.mid-currentPrice)-Math.abs(b.mid-currentPrice)).slice(0,maxEachSide);
  const resistance=all.filter(x=>x.type==='resistance').sort((a,b)=>Math.abs(a.mid-currentPrice)-Math.abs(b.mid-currentPrice)).slice(0,maxEachSide);
  return[...support,...resistance];
}
return{independentTouches,build};
});
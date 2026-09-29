(function(root,factory){
 const deps=typeof module==='object'&&module.exports?{
  MathX:require('./math.js'),Swings:require('./swings.js'),Levels:require('./levels.js'),LevelState:require('./level-state.js'),Replay:require('./replay.js'),Indicators:require('./indicators.js'),Volume:require('./volume.js')
 }:{MathX:root.PulseAutoChartMath,Swings:root.PulseAutoChartSwings,Levels:root.PulseAutoChartLevels,LevelState:root.PulseAutoChartLevelState,Replay:root.PulseAutoChartReplay,Indicators:root.PulseAutoChartIndicators,Volume:root.PulseAutoChartVolume};
 const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(dep){'use strict';
const {MathX,Swings,Levels,LevelState,Replay,Indicators,Volume}=dep;
const VERSION='AUTO_CHART_CORE_v1_2';
function keyLevels(displayLevels,currentPrice){
  return{
    support:LevelState.nearest(displayLevels,'support',currentPrice),
    resistance:LevelState.nearest(displayLevels,'resistance',currentPrice)
  };
}
function analyze(dataset,settings={}){
  const candles=dataset?.candles||[],last=candles.at(-1);
  if(!last)return{available:false,version:VERSION,error:'확정봉 데이터 없음',dataset};
  const atrSeries=MathX.atr(candles,14),atrNow=atrSeries.at(-1),swings=Swings.extract(dataset),provisionalSwings=Swings.provisional(dataset),structure=Swings.classify(swings);
  const replay=Replay.track({candles,swings,atrSeries,timeframe:dataset.market.interval,settings}),range=replay.range||null,setup=replay.setup,ma=Indicators.movingAverages(candles,[20,60]),volume=Volume.summarize(candles,{hours24:24,hours72:72,threshold:settings.volumeSpikeRvol??3,period:20});
  const rawLevels=Levels.build(swings,{atrNow,currentPrice:last.close,timeframe:dataset.market.interval,zoneAtr:settings.zoneAtr??.20,minTouches:settings.minTouches??2,maxEachSide:12});
  const levelStates=LevelState.evaluate(rawLevels,candles,{atrSeries,atrNow,breakoutAtr:settings.breakoutAtr??.10,retestAtr:settings.retestAtr??.25});
  const localDisplayLevels=LevelState.select(levelStates,{atrNow,currentPrice:last.close,timeframe:dataset.market.interval,maxEachSide:settings.maxDisplayEachSide});
  const keys=keyLevels(localDisplayLevels,last.close);
  return{available:true,version:VERSION,asOf:last.closeTime,timeframe:dataset.market.interval,market:dataset.market,currentPrice:last.close,atrNow,candles,swings,provisionalSwings,structure,levels:rawLevels,levelStates,localDisplayLevels,displayLevels:localDisplayLevels,htfLevels:[],range,setup,setupHistory:replay.history,indicators:{ma},volume,keyLevels:{...keys,invalidation:setup.invalidation||null},dataStatus:dataset.status};
}
function tfRank(tf){return({'1w':5,'1d':4,'4h':3,'1h':2,'15m':1,'5m':0})[String(tf||'').toLowerCase()]??0}
function htfCoreLevels(frame,basePrice){
  if(!frame?.available)return[];
  const xs=frame.localDisplayLevels||frame.displayLevels||[],support=LevelState.nearest(xs,'support',basePrice),resistance=LevelState.nearest(xs,'resistance',basePrice),out=[];
  for(const z of[support,resistance]){
    if(!z)continue;
    out.push({...z,id:'HTF-'+frame.timeframe+'-'+z.id,scope:'htf',sourceTimeframe:frame.timeframe,timeframes:[String(frame.timeframe).toLowerCase()],timeframe:String(frame.timeframe).toLowerCase(),htfRank:tfRank(frame.timeframe)});
  }
  return out;
}
function attachHigherFrames(base,frames=[]){
  if(!base?.available)return base;
  const htf=(frames||[]).flatMap(x=>htfCoreLevels(x,base.currentPrice));
  const combined=[...(base.localDisplayLevels||[]),...htf],baseTf=String(base.timeframe).toLowerCase();
  const merged=LevelState.mergeGroup(combined,{atrNow:base.atrNow,currentPrice:base.currentPrice}).map(z=>{
    const ranks=(z.components||[]).map(c=>tfRank(c.timeframe)),rank=Math.max(0,...ranks),tfs=(z.timeframes||[]).map(x=>String(x).toLowerCase()),hasLocal=tfs.includes(baseTf),hasHtf=tfs.some(tf=>tf!==baseTf);
    return{...z,scope:hasLocal?(hasHtf?'mixed':'local'):'htf',hasLocal,hasHtf,htfRank:rank};
  });
  const p=base.currentPrice,a=base.atrNow||0,validRole=(role)=>merged.filter(x=>x.effectiveRole===role&&(role==='support'?x.low<=p+a*.25:x.high>=p-a*.25)).sort((x,y)=>Math.abs(x.mid-p)-Math.abs(y.mid-p));
  function sparse(role){
    const xs=validRole(role),local=xs.find(x=>x.hasLocal)||xs[0]||null,pureHtf=xs.find(x=>x.scope==='htf')||null,out=[];
    for(const z of[local,pureHtf])if(z&&!out.some(x=>x.id===z.id))out.push(z);
    return out;
  }
  const support=sparse('support'),resistance=sparse('resistance'),transition=merged.filter(x=>x.effectiveRole==='transition'&&x.hasLocal&&Math.abs(x.mid-p)<=a*1.5).sort((x,y)=>Math.abs(x.mid-p)-Math.abs(y.mid-p)).slice(0,1);
  const display=[...support,...resistance,...transition];
  const keys=keyLevels(display,p),htfMerged=LevelState.mergeGroup(htf,{atrNow:base.atrNow,currentPrice:p}),htfKeys=keyLevels(htfMerged,p);
  return{...base,htfLevels:htf,htfKeyLevels:htfKeys,displayLevels:display,keyLevels:{...keys,invalidation:base.setup?.invalidation||null},higherTimeframes:(frames||[]).filter(x=>x?.available).map(x=>x.timeframe)};
}
return{VERSION,analyze,attachHigherFrames,tfRank};
});
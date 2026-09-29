(function(root,factory){
 const deps=typeof module==='object'&&module.exports?{
  MathX:require('./math.js'),Swings:require('./swings.js'),Levels:require('./levels.js'),Replay:require('./replay.js'),Indicators:require('./indicators.js'),Volume:require('./volume.js')
 }:{MathX:root.PulseAutoChartMath,Swings:root.PulseAutoChartSwings,Levels:root.PulseAutoChartLevels,Replay:root.PulseAutoChartReplay,Indicators:root.PulseAutoChartIndicators,Volume:root.PulseAutoChartVolume};
 const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(dep){'use strict';
const {MathX,Swings,Levels,Replay,Indicators,Volume}=dep;
const VERSION='AUTO_CHART_CORE_v1_1';
function analyze(dataset,settings={}){
  const candles=dataset?.candles||[],last=candles.at(-1);
  if(!last)return{available:false,version:VERSION,error:'확정봉 데이터 없음',dataset};
  const atrSeries=MathX.atr(candles,14),atrNow=atrSeries.at(-1),swings=Swings.extract(dataset),provisionalSwings=Swings.provisional(dataset),structure=Swings.classify(swings);
  const replay=Replay.track({candles,swings,atrSeries,timeframe:dataset.market.interval,settings}),levels=replay.levels||[],range=replay.range||null,setup=replay.setup,ma=Indicators.movingAverages(candles,[20,60]),volume=Volume.summarize(candles,{hours24:24,hours72:72,threshold:settings.volumeSpikeRvol??3,period:20});
  const currentSupport=levels.filter(x=>x.type==='support'&&x.mid<=last.close).sort((a,b)=>b.mid-a.mid)[0]||levels.filter(x=>x.type==='support').sort((a,b)=>Math.abs(a.mid-last.close)-Math.abs(b.mid-last.close))[0]||null;
  const currentResistance=levels.filter(x=>x.type==='resistance'&&x.mid>=last.close).sort((a,b)=>a.mid-b.mid)[0]||levels.filter(x=>x.type==='resistance').sort((a,b)=>Math.abs(a.mid-last.close)-Math.abs(b.mid-last.close))[0]||null;
  const scenarioRange=setup?.range||range,nearestSupport=scenarioRange?.support||currentSupport,nearestResistance=scenarioRange?.resistance||currentResistance;
  return{available:true,version:VERSION,asOf:last.closeTime,timeframe:dataset.market.interval,market:dataset.market,currentPrice:last.close,atrNow,candles,swings,provisionalSwings,structure,levels,range,setup,setupHistory:replay.history,indicators:{ma},volume,keyLevels:{support:nearestSupport,resistance:nearestResistance,invalidation:setup.invalidation||null},dataStatus:dataset.status};
}
return{VERSION,analyze};
});
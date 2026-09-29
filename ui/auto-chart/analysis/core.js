(function(root,factory){
 const deps=typeof module==='object'&&module.exports?{
  MathX:require('./math.js'),Swings:require('./swings.js'),Levels:require('./levels.js'),Ranges:require('./ranges.js'),Setup:require('./setup-state.js'),Indicators:require('./indicators.js')
 }:{MathX:root.PulseAutoChartMath,Swings:root.PulseAutoChartSwings,Levels:root.PulseAutoChartLevels,Ranges:root.PulseAutoChartRanges,Setup:root.PulseAutoChartSetupState,Indicators:root.PulseAutoChartIndicators};
 const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function({MathX,Swings,Levels,Ranges,Setup,Indicators}){'use strict';
const VERSION='AUTO_CHART_CORE_v1';
function analyze(dataset,settings={}){
  const candles=dataset?.candles||[],last=candles.at(-1);
  if(!last)return{available:false,version:VERSION,error:'확정봉 데이터 없음',dataset};
  const atrSeries=MathX.atr(candles,14),atrNow=atrSeries.at(-1),swings=Swings.extract(dataset),provisionalSwings=Swings.provisional(dataset),structure=Swings.classify(swings),levels=Levels.build(swings,{atrNow,currentPrice:last.close,timeframe:dataset.market.interval,zoneAtr:settings.zoneAtr??.20,minTouches:settings.minTouches??2,maxEachSide:settings.maxEachSide??3}),range=Ranges.detect(candles,levels,{atrNow,timeframe:dataset.market.interval,minWidthAtr:settings.minWidthAtr??1.5,minInsideRatio:settings.minInsideRatio??.68}),setup=Setup.derive(candles,range,{atrNow,breakoutAtr:settings.breakoutAtr??.10,retestAtr:settings.retestAtr??.25}),ma=Indicators.movingAverages(candles,[20,60]);
  const nearestSupport=levels.filter(x=>x.type==='support'&&x.mid<=last.close).sort((a,b)=>b.mid-a.mid)[0]||levels.filter(x=>x.type==='support').sort((a,b)=>Math.abs(a.mid-last.close)-Math.abs(b.mid-last.close))[0]||null;
  const nearestResistance=levels.filter(x=>x.type==='resistance'&&x.mid>=last.close).sort((a,b)=>a.mid-b.mid)[0]||levels.filter(x=>x.type==='resistance').sort((a,b)=>Math.abs(a.mid-last.close)-Math.abs(b.mid-last.close))[0]||null;
  return{available:true,version:VERSION,asOf:last.closeTime,timeframe:dataset.market.interval,market:dataset.market,currentPrice:last.close,atrNow,candles,swings,provisionalSwings,structure,levels,range,setup,indicators:{ma},keyLevels:{support:nearestSupport,resistance:nearestResistance,invalidation:setup.invalidation||null},dataStatus:dataset.status};
}
return{VERSION,analyze};
});
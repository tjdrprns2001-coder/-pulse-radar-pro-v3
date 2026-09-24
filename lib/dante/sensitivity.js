'use strict';
const {runWalkForward,summarize}=require('./walk-forward.js');
const DEFAULT_GRID=Object.freeze([
  {id:'base',rice:{},d256:{}},
  {id:'breakout-atr-0.10',rice:{breakout:{breakoutBufferAtr:.10}},d256:{}},
  {id:'breakout-atr-0.30',rice:{breakout:{breakoutBufferAtr:.30}},d256:{}},
  {id:'prior-below-60',rice:{breakout:{minPriorClosesBelowPivot:60}},d256:{}},
  {id:'prior-below-100',rice:{breakout:{minPriorClosesBelowPivot:100}},d256:{}},
  {id:'retest-3',rice:{retest:{maxRetestBars:3}},d256:{}},
  {id:'retest-8',rice:{retest:{maxRetestBars:8}},d256:{}},
  {id:'256-dist-1.0',rice:{},d256:{maxDistanceToEma60Atr:1.0}},
  {id:'256-dist-2.0',rice:{},d256:{maxDistanceToEma60Atr:2.0}}
]);
function deepMerge(a,b){const o=JSON.parse(JSON.stringify(a||{}));for(const[k,v]of Object.entries(b||{})){if(v&&typeof v==='object'&&!Array.isArray(v)&&o[k]&&typeof o[k]==='object')o[k]=deepMerge(o[k],v);else o[k]=v}return o}
function runSensitivity({symbol,candles,baseRiceParams={},baseD256Params={},grid=DEFAULT_GRID,frictionPct=.2,horizons}={}){
  return grid.map(g=>{const riceParams=deepMerge(baseRiceParams,g.rice),d256Params=deepMerge(baseD256Params,g.d256),wf=runWalkForward({symbol,candles,riceParams,d256Params,frictionPct,horizons});return{id:g.id,riceParams,d256Params,eventCount:wf.eventCount,summary:summarize(wf.events,wf.horizons)}})
}
module.exports={DEFAULT_GRID,deepMerge,runSensitivity};

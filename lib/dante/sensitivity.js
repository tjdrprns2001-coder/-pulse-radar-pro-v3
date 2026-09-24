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
function metricCompact(summary,h='40'){
  const m=summary?.horizons?.[String(h)]?.netReturnPct||{};
  return{n:m.n??0,mean:m.mean??null,median:m.median??null,positiveRate:m.positiveRate??null,tradeSharpe:m.tradeSharpe??null};
}
function compactSummary(row){
  const s=row?.summary||{};
  return{
    id:row.id,eventCount:row.eventCount,
    strategies:Object.fromEntries(Object.entries(s.byStrategy||{}).map(([k,v])=>[k,{n:v.n,h20:metricCompact(v,'20'),h40:metricCompact(v,'40')}])),
    train:s.bySplit?.train?{n:s.bySplit.train.n,h20:metricCompact(s.bySplit.train,'20'),h40:metricCompact(s.bySplit.train,'40')}:null,
    validation:s.bySplit?.validation?{n:s.bySplit.validation.n,h20:metricCompact(s.bySplit.validation,'20'),h40:metricCompact(s.bySplit.validation,'40')}:null,
    overall:s.overall?{n:s.overall.n,h20:metricCompact(s.overall,'20'),h40:metricCompact(s.overall,'40')}:null
  };
}
function compactSensitivity(rows=[]){return rows.map(compactSummary)}
function runSensitivity({symbol,candles,baseRiceParams={},baseD256Params={},grid=DEFAULT_GRID,frictionPct=.2,horizons}={}){
  return grid.map(g=>{const riceParams=deepMerge(baseRiceParams,g.rice),d256Params=deepMerge(baseD256Params,g.d256),wf=runWalkForward({symbol,candles,riceParams,d256Params,frictionPct,horizons});return{id:g.id,riceParams,d256Params,eventCount:wf.eventCount,summary:summarize(wf.events,wf.horizons)}})
}
module.exports={DEFAULT_GRID,deepMerge,metricCompact,compactSummary,compactSensitivity,runSensitivity};

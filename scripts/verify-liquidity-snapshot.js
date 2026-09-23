'use strict';
const assert=require('assert'),fs=require('fs');
const Engine=require('../ui/chart/liquidity-map-engine.js');
const Smc=require('../ui/chart/smc-engine.js');
const html=fs.readFileSync('liquidity-snapshot.html','utf8');
const js=fs.readFileSync('ui/liquidity-snapshot.js','utf8');
const css=fs.readFileSync('ui/liquidity-snapshot.css','utf8');
const shell=fs.readFileSync('pulse-unified.html','utf8');
const shellJs=fs.readFileSync('ui/pulse-shell.js','utf8');
const scan=fs.readFileSync('ui/coin-scan.js','utf8');

for(const s of ['유동성 스냅샷','핵심 요약','차트 확대','scoreHelp','liqMore','pdMore','levelDetail','판정 원칙 · 용어 도움말','추세선 리테스트','TL B/R'])assert(html.includes(s),'page missing '+s);
for(const s of ['session-profile.js','smc-engine.js','liquidity-engine.js','liquidity-map-engine.js','trendline-retest-engine.js','liquidity-snapshot.js'])assert(html.includes(s),'engine wiring missing '+s);
for(const s of ["getContext('2d')",'requestFullscreen','pseudoFullscreen','inspectCanvas','rangePositionPct','showAllLiquidity','showAllPd','EXTRA_TF','5m 단독 신호','DOL →','trendRetest','RETESTING','TL 무효화'])assert(js.includes(s),'mobile interaction missing '+s);
for(const s of ['.chartCard:fullscreen','.chartCard.pseudoFullscreen','overflow-x:auto','aspect-ratio:1.18/1','.levelDetail','.stateBadge'])assert(css.includes(s),'mobile style missing '+s);
assert(shell.includes('data-view="liquiditysnapshot"')&&shell.includes('유동성 스냅샷'),'shell menu missing');
assert(shellJs.includes("liquiditysnapshot:{title:'유동성 스냅샷'")&&shellJs.includes("path:'/liquidity-snapshot.html'"),'shell route missing');
assert(scan.includes('liquidityUrl')&&scan.includes('유동성 지도'),'scanner deep link missing');
assert.deepEqual(Engine.TF_ORDER,['1w','1d','4h','1h','15m'],'primary TF order changed unexpectedly');
assert.deepEqual(Engine.EXTRA_TF_ORDER,['3d','12h','5m'],'extra TF order missing');
assert.deepEqual(Engine.SUPPORTED_TF_ORDER,['1w','3d','1d','12h','4h','1h','15m','5m'],'8TF support mismatch');

const clustered=Engine.collectLiquidityLevels({
  levels:[
    {type:'EQH',side:'buy',price:105,quality:50,touches:2,confirmedAt:10,sourceId:'a'},
    {type:'EQH',side:'buy',price:105.04,quality:54,touches:2,confirmedAt:12,sourceId:'b'},
    {type:'SWING_HIGH',side:'buy',price:108,quality:40,confirmedAt:8,sourceId:'c'},
    {type:'EQL',side:'sell',price:95,quality:48,touches:2,confirmedAt:11,sourceId:'d'},
    {type:'EQL',side:'sell',price:94.96,quality:52,touches:2,confirmedAt:13,sourceId:'e'}
  ]
},100,2,{low:94,high:108});
const eqh=clustered.find(x=>x.label==='EQH'),eql=clustered.find(x=>x.label==='EQL');
assert(eqh&&eqh.clusterCount===2,'EQH nearby levels must cluster');
assert(eql&&eql.clusterCount===2,'EQL nearby levels must cluster');
assert(Array.isArray(eqh.sourceIds)&&eqh.sourceIds.length===2,'cluster sources must be preserved');
assert(eqh.scoreBreakdown,'score breakdown must be exposed');

const candles=[];
for(let i=0;i<220;i++){
  const center=100+Math.sin(i/9)*7+Math.sin(i/3)*1.5+i*.018;
  const open=center+Math.sin(i*.7)*.7,close=center+Math.cos(i*.5)*.7;
  candles.push({time:(i+1)*3600000,open,high:Math.max(open,close)+1.1,low:Math.min(open,close)-1.1,close,volume:1000+Math.abs(Math.sin(i))*500,partial:false});
}
const swings=Smc.confirmedPivots(candles,{left:3,right:3});
assert(swings.length>=8,'fixture must contain confirmed pivots');
const events=[];
for(let i=1;i<swings.length;i++)if(swings[i].type!==swings[i-1].type)events.push({i:swings[i].index,index:swings[i].index,confirmedAt:swings[i].confirmedAt,dir:swings[i].type==='H'?'up':'down'});
const out=Engine.buildLiquidityMap({candles,canonicalSwings:swings,canonicalEvents:events,timeframe:'1h',htfBias:'up'});
assert(out.ok,'liquidity map should build');
assert(out.candles.length===220,'confirmed candles should be preserved');
assert(Array.isArray(out.levels)&&out.levels.length>0,'liquidity levels required');
assert(Array.isArray(out.pdArrays),'PD arrays required');
assert(out.scenario&&['PRE_SWEEP','SWEEP_WAIT_RECLAIM','POST_SWEEP_DRAW'].includes(out.scenario.phase),'scenario phase required');
assert(Array.isArray(out.overlays)&&out.overlays.some(x=>x.type==='current'),'overlay contract required');
assert(Number.isFinite(out.summary.rangePositionPct),'dealing range position percentage required');
assert(out.range.positionPct===out.summary.rangePositionPct,'range position percentage should be shared');

const ref=Engine.buildLiquidityMap({candles,canonicalSwings:swings,canonicalEvents:events,timeframe:'5m',htfBias:'up'});
assert(ref.ok&&ref.referenceOnly===true,'5m must remain reference-only');

console.log('liquidity snapshot mobile polish PASS');
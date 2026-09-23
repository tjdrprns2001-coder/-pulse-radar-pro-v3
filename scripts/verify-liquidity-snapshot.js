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

for(const s of ['유동성 스냅샷','BSL·SSL','EQH/EQL','FVG','OB','Breaker','PNG 저장','snapshot'])assert(html.includes(s),'page missing '+s);
for(const s of ['session-profile.js','smc-engine.js','liquidity-engine.js','liquidity-map-engine.js','liquidity-snapshot.js'])assert(html.includes(s),'engine wiring missing '+s);
for(const s of ['canvas','scenario','liquidity','structure','savePng','/api/structure','SWEEP + RECLAIM','Draw →'])assert(js.includes(s),'direct renderer missing '+s);
assert(css.includes('aspect-ratio:16/9'),'snapshot aspect ratio missing');
assert(css.includes('@media(max-width:720px)'),'mobile layout missing');
assert(shell.includes('data-view="liquiditysnapshot"')&&shell.includes('유동성 스냅샷'),'shell menu missing');
assert(shellJs.includes("liquiditysnapshot:{title:'유동성 스냅샷'")&&shellJs.includes("path:'/liquidity-snapshot.html'"),'shell route missing');
assert(scan.includes('liquidityUrl')&&scan.includes('유동성 지도'),'scanner deep link missing');
assert.deepEqual(Engine.TF_ORDER,['1w','1d','4h','1h','15m'],'liquidity snapshot TFs must exclude 5m decision view');

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
assert(out.summary&&Object.prototype.hasOwnProperty.call(out.summary,'position'),'range position required');
console.log('liquidity snapshot map PASS');
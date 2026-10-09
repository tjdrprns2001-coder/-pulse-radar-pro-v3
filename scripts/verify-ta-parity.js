'use strict';
const assert=require('node:assert/strict');
const path=require('node:path'),cp=require('node:child_process');
const Reference=require('../lib/research-backtest-v2/ta-parity.js');
const LegacyMath=require('../ui/auto-chart/analysis/math.js');
const LegacyAdvanced=require('../ui/auto-chart/analysis/advanced.js');
const bars=[];
for(let i=0;i<550;i++){
 const close=100+i*.07+Math.sin(i*.19)*4+Math.cos(i*.05)*2;
 const open=close+Math.sin(i*.11)*.3,high=Math.max(open,close)+1.2+(i%4)*.11,low=Math.min(open,close)-1.1-(i%3)*.13;
 bars.push({open,high,low,close,volume:1000+i});
}
const js=Reference.computeTaReference(bars);
const raw=cp.execFileSync('python3',[path.join(__dirname,'ta-parity-reference.py')],{
 input:JSON.stringify({candles:bars}),encoding:'utf8',maxBuffer:4*1024*1024,timeout:45000
});
const py=JSON.parse(raw);
function compare(name,a,b){
 assert.equal(a.length,b.length,name+' length');
 let max=0,checked=0;
 for(let i=0;i<a.length;i++){
  if(a[i]===null||b[i]===null){assert.equal(a[i],b[i],name+' missing at '+i);continue}
  const delta=Math.abs(a[i]-b[i]);max=Math.max(max,delta);checked++;
  assert(delta<1e-7,name+' mismatch at '+i+' JS '+a[i]+' ta '+b[i]);
 }
 assert(checked>0,name+' must have valid observations');
 return {name,maxError:max,checked};
}
const comparisons=[
 compare('SMA112',js.sma112,py.sma112),compare('EMA20',js.ema20,py.ema20),
 compare('RSI14',js.rsi14,py.rsi14),compare('MACD',js.macd.line,py.macd.line),
 compare('MACD signal',js.macd.signal,py.macd.signal),
 compare('MACD histogram',js.macd.hist,py.macd.hist),compare('ATR14',js.atr14,py.atr14)
];
const legacyAtr=LegacyMath.atr(bars,14).at(-1),legacyRsi=LegacyAdvanced.rsi(bars,14).at(-1);
const atrDelta=Math.abs(legacyAtr-js.atr14.at(-1)),rsiDelta=Math.abs(legacyRsi-js.rsi14.at(-1));
assert(atrDelta>1e-8,'legacy ATR should remain distinctly labeled EMA-smoothed, not misreported as TA Wilder ATR');
assert(rsiDelta>=0,'RSI delta available for migration audit');
console.log('ta parity PASS '+JSON.stringify({comparisons,legacyAudit:{atrLastDelta:atrDelta,rsiLastDelta:rsiDelta,action:'shadow only; no production indicator replacement'}}));

'use strict';
const assert=require('assert');
const fs=require('fs');
const E=require('../lib/coin-scan/integrated-surge-engine.js');
const asOf=1790842800000;
function rows(tf,{count=160,drift=.01,spikeAt=null,lastVolume=100,lastBreak=false}={}){
  const step=E.TFMS[tf],start=asOf-count*step,out=[];let price=100;
  for(let i=0;i<count;i++){
    const open=price,close=price+drift+(lastBreak&&i===count-1?1.5:0);
    const volume=i===spikeAt?400:i===count-1?lastVolume:100;
    const quote=volume*close;
    out.push([start+i*step,open,Math.max(open,close)+.2,Math.min(open,close)-.2,
      close,volume,start+(i+1)*step-1,quote,10,volume*1.3/2.3,quote*1.3/2.3,0]);
    price=close;
  }
  return out;
}
const f=E.frame(rows('5m',{lastVolume:300}),'5m',asOf);
assert.equal(f.last.rvol,3,'RVOL excludes current candle');
assert(Math.abs(f.last.compression-(Math.max(...f.last.emas)-Math.min(...f.last.emas))/f.last.close)<1e-12);
assert.equal(E.flowLabel([1.2,1.3,1.2,1.4]),'FLOW-SUSTAIN');
assert.equal(E.flowLabel([.7,.8,1.,1.8]),'FLOW-IGNITION');
assert.equal(E.flowLabel([4.5,.8,1.5,.3]),'FLOW-SPIKE-FAIL');
assert.equal(E.flowLabel([.8,.9,.7,4.5]),'FLOW-SPIKE');
assert(E.improving({candles:[{histPct:-.8},{histPct:-.5},{histPct:-.2}]}));
const future=rows('5m');future.push([asOf,100,10000,100,9000,1000000,asOf+300000-1,1e9,1,1,1,0]);
assert.equal(E.frame(future,'5m',asOf).bars,160,'future candle must be excluded');
assert.equal(E.frame([],'1h',asOf).available,false);

const frames={'1d':rows('1d'),'4h':rows('4h'),'1h':rows('1h',{lastBreak:true}),
  '15m':rows('15m',{lastBreak:true,lastVolume:300}),
  '5m':rows('5m',{lastBreak:true,lastVolume:300})};
const oiRows=Array.from({length:20},(_,i)=>({timestamp:asOf-(19-i)*900000,sumOpenInterest:100+i*.4}));
const result=E.evaluate({frames,oiRows,asOf});
assert.equal(result.stage,'점화초기','full structure/OI/FLOW/gates should ignite');
assert.equal(result.oi.known,true);
assert.equal(E.evaluate({frames,asOf}).stage,'B','missing OI must not promote A+B or ignition');

const entry=E.frame(frames['5m'],'5m',asOf);
entry.last.histPct=-.2;
assert(E.gate5m(entry).passed,'negative 5m MACD must not veto entry');
const unknown={known:false,a:false,aPre:false};
assert.equal(E.classifyStage({oi:unknown,flow:false,ready:true,gate15:true,gate5:true,extended:false}),'PRE');
assert.equal(E.classifyStage({oi:result.oi,flow:true,ready:true,gate15:true,gate5:true,extended:true}),'A+B');

const h4=E.frame(rows('4h'),'4h',asOf);
const echoFrame=E.frame(rows('1h',{drift:0,spikeAt:135}),'1h',asOf);
for(const c of echoFrame.candles)c.emas=[99,98.5,98,97];
const m15=E.frame(rows('15m'),'15m',asOf);
let context=E.volumeContext(h4,echoFrame,m15);
assert.equal(context.state,'VOLUME-ECHO');
echoFrame.candles.at(-2).rvol=3;
context=E.volumeContext(h4,echoFrame,m15);
assert.equal(context.state,'ECHO+RECENT-PRELOAD');
echoFrame.candles[135].rvol=1;
context=E.volumeContext(h4,echoFrame,m15);
assert.equal(context.state,'RECENT-PRELOAD');
assert.equal(context.detected,false);
const staleOi=E.oiFeatures(oiRows,asOf+3600000);
assert.equal(staleOi.known,false);
const appendedOi=[...oiRows,{timestamp:asOf+900000,sumOpenInterest:10000}];
assert.equal(E.oiFeatures(appendedOi,asOf).change1hPct,result.oi.change1hPct);
const backend=fs.readFileSync('lib/coin-scan/astra-auto-scanner.js','utf8');
const ui=fs.readFileSync('ui/astra-scan.js','utf8');
assert(backend.includes('row.integratedSurge=IntegratedSurge.evaluate'));
assert(ui.includes('integratedSurgeBar(x)+commonStageBar(x)'));
console.log('integrated surge engine and web wiring verification passed');

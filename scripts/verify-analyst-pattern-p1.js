'use strict';
const assert=require('node:assert/strict');
const FX=require('../ui/forex-book/forex-book-engine.js');
const Live=require('../ui/realtime-patterns/core.js');

function interpolate(anchors,i){
  for(let j=1;j<anchors.length;j++){
    const [k,p]=anchors[j-1],[e,q]=anchors[j];
    if(i<=e)return p+(q-p)*(i-k)/(e-k);
  }
  return anchors.at(-1)[1];
}
function batBars({bear=false,adRatio=.886}={}){
  const d=120-20*adRatio;
  const anchors=[[0,109],[10,100],[18,120],[26,111],[34,116.6],[42,d],[58,108]];
  return Array.from({length:59},(_,i)=>{
    let close=interpolate(anchors,i),open=close-.015,high=close+.1,low=close-.1;
    if(bear){const oldHigh=high;high=220-low;low=220-oldHigh;open=220-open;close=220-close}
    return{time:i,open,high,low,close,volume:150};
  });
}
for(const bear of [false,true]){
  const pat=FX.detectChartPatterns(batBars({bear})).find(x=>x.id===(bear?'bearish-bat':'bullish-bat'));
  assert(pat, 'a true A-to-D 0.886 XA Bat must be recognized');
  assert.equal(pat.status,'READY','PRZ alone cannot confirm a long or short');
  assert(Math.abs(pat.ratios.adXa-.886)<.02);
  assert(Math.abs(pat.ratios.xdXa-.114)<.02);
  assert(pat.ratios.abXa>=.35&&pat.ratios.abXa<=.53);
  assert(pat.points.every((x,i)=>i===0||x.i>pat.points[i-1].i));
}
assert(!FX.detectChartPatterns(batBars({adRatio:.76})).some(x=>x.id==='bullish-bat'),
  'Bat must reject a D pivot far from the 0.886 XA retracement');

function flagBars({bear=false,priorHighSpike=false,pauseVolume=120,deep=false}={}){
  const out=[];
  for(let i=0;i<64;i++){
    let close,open,volume;
    if(i<32){close=100+Math.sin(i*.35)*.2;open=close-.05;volume=130}
    else if(i<44){close=101+14*(i-32)/11;open=close-.10;volume=450}
    else{close=114.5-(deep?.49:.28)*(i-44);open=close+.07;volume=pauseVolume}
    let high=Math.max(open,close)+.25,low=Math.min(open,close)-.25;
    if(i===20&&priorHighSpike)high=125;
    if(bear){const oldHigh=high;high=220-low;low=220-oldHigh;open=220-open;close=220-close}
    out.push({time:i,open,high,low,close,volume});
  }
  return out;
}
for(const bear of [false,true]){
  const id=bear?'bearish-flag':'bullish-flag';
  const p=FX.detectChartPatterns(flagBars({bear})).find(x=>x.id===id);
  assert(p,'flag should be detected after an external pole, shallow countertrend channel and volume contraction');
  assert.equal(p.status,'READY');
  assert(p.meta.volumeRatio<=.90);
  assert(p.meta.depthRatio>=.06&&p.meta.depthRatio<=.55);
  assert(bear?p.meta.poleExtreme<p.meta.previousExtreme:p.meta.poleExtreme>p.meta.previousExtreme);
}
assert(!FX.detectChartPatterns(flagBars({priorHighSpike:true})).some(x=>x.id==='bullish-flag'),
  'a bounce failing to clear prior highs is not a validated bull flag');
assert(!FX.detectChartPatterns(flagBars({pauseVolume:650})).some(x=>x.id==='bullish-flag'),
  'high-volume distribution is not quiet flag consolidation');
assert(!FX.detectChartPatterns(flagBars({deep:true})).some(x=>x.id==='bullish-flag'),
  'a deep loss of the entire flagpole must invalidate the flag');

const baseTime=Date.UTC(2026,0,1);
function minuteBar(i,{open,high,low,close,volume=100}){
  const openTime=baseTime+i*900000;
  return{openTime,closeTime:openTime+899999,open,high,low,close,volume};
}
const hist=Array.from({length:95},(_,i)=>{
  const close=100-i*.08;return minuteBar(i,{open:close+.08,high:close+.3,low:close-.3,close});
});
const hammer=minuteBar(95,{open:92.28,close:92.34,high:92.43,low:90.9,volume:100});
const forming=Live.detect([...hist,hammer],{symbol:'TESTUSDT',timeframe:'15m'}).filter(x=>x.type==='hammer');
assert(forming.some(x=>x.state==='형성 중'),'closed hammer morphology alone remains unconfirmed');
assert(!forming.some(x=>x.state==='확정'),'a hammer needs a later, closed confirmation bar');
const follow=minuteBar(96,{open:92.4,close:92.85,high:93,low:92.35,volume:170});
const confirmed=Live.detect([...hist,hammer,follow],{symbol:'TESTUSDT',timeframe:'15m'}).find(x=>x.type==='hammer'&&x.state==='확정');
assert(confirmed,'a follow-through close above the hammer high with sufficient volume confirms');
assert.equal(confirmed.patternAt,hammer.closeTime);
assert.equal(confirmed.candleAt,follow.closeTime);
assert.equal(confirmed.invalidation,hammer.low);
assert(!Live.detect([...hist,hammer,{...follow,close:92.40}],{symbol:'TESTUSDT',timeframe:'15m'}).some(x=>x.type==='hammer'&&x.state==='확정'),
  'without a close above prior hammer high, never confirm');
assert(!Live.detect([...hist,hammer,{...follow,volume:1}],{symbol:'TESTUSDT',timeframe:'15m'}).some(x=>x.type==='hammer'&&x.state==='확정'),
  'unusually weak follow-through volume must not confirm');
console.log('analyst pattern P1 PASS');

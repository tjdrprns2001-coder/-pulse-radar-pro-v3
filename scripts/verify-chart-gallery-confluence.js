'use strict';
const assert=require('assert');
const G=require('../lib/coin-scan/chart-gallery-confluence.js');

const H=3600000;
function k(i,{p=100,v=100,hi=.5,lo=.5}={}){
  const t=Date.now()-(80-i)*H;
  return [t,String(p-.1),String(p+hi),String(p-lo),String(p),String(v),t+H-1,String(v*p),100,'0',String(v*.55),String(v*p*.55)];
}
function frame(n,step=.05,vol=100){
  return Array.from({length:n},(_,i)=>k(i,{p:100+i*step,v:vol+(i%7)}));
}
const frames={
  '1w':frame(80,.3,90),'3d':frame(80,.2,90),'1d':frame(90,.15,100),'12h':frame(90,.1,100),
  '4h':frame(90,.08,100),'1h':frame(90,.03,100),'15m':frame(90,.01,100),'5m':frame(90,.005,100)
};
for(let i=70;i<89;i++){frames['1h'][i][5]='70';frames['15m'][i][5]='70'}
frames['1h'][89][5]='220';frames['15m'][89][5]='230';
frames['1h'][89][4]=String(Number(frames['1h'][88][4])*1.003);
frames['15m'][89][4]=String(Number(frames['15m'][88][4])*1.002);

const out=G.analyze({
  frames,structure:'bullish',priceChange1h:.3,priceChange15m:.2,
  momentumSignals:{rsi1h:58,rsi15m:61,macd1h:.2,macd15m:.1,aligned:true,overheated:false},
  oiChangePct:2.8,takerRatio:1.42,fundingPct:.01
});
assert.equal(G.VERSION,'CHART_GALLERY_CONFLUENCE_v1');
assert.equal(out.evidenceDiversity.total,8);
assert(Number.isFinite(out.score));
assert(['PRE-SURGE','IGNITION_READY','IGNITION','WATCH'].includes(out.stage));
assert.equal(typeof out.volumeEfficiency.absorption,'boolean');
assert.equal(out.shadow,true);
assert.equal(out.rankingAssist,true);

const fake=JSON.parse(JSON.stringify(frames));
const a=fake['1h'];
const prevHigh=Math.max(...a.slice(-12,-1).map(x=>Number(x[2])));
a[a.length-1][2]=String(prevHigh*1.02);
a[a.length-1][4]=String(prevHigh*.99);
const fo=G.breakoutQuality(fake);
assert.equal(fo.fakeout,true);
console.log('chart gallery confluence PASS');

'use strict';
const assert=require('assert');
const Grok=require('../lib/coin-scan/grok-scan-mode.js');
const Gemini=require('../lib/coin-scan/gemini-scan-mode.js');
const Astra=require('../lib/coin-scan/astra-auto-scanner.js');

function k(open,close,volume,ms=900000){return[open,String(close*.999),String(close*1.002),String(close*.998),String(close),String(volume),open+ms-1,String(close*volume),100,String(volume*.6),String(close*volume*.6),'0']}
(function(){
  const rows=[
    {symbol:'A',priceChange24h:1,quoteVolume24h:5_000_000},
    {symbol:'B',priceChange24h:1,quoteVolume24h:8_000_000},
    {symbol:'C',priceChange24h:1,quoteVolume24h:12_000_000},
    {symbol:'D',priceChange24h:1,quoteVolume24h:18_000_000},
    {symbol:'E',priceChange24h:1,quoteVolume24h:30_000_000}
  ];
  const u=Grok.dynamicUniverse(rows);
  assert(u.threshold>=Grok.CONFIG.minDynamicQuoteVolume&&u.threshold<=Grok.CONFIG.maxDynamicQuoteVolume,'Grok dynamic liquidity threshold must be clamped');
  assert(u.items.every(x=>x.quoteVolume24h>=u.threshold),'Grok universe must respect dynamic threshold');

  const oi=Grok.selectOi([
    {symbol:'A',status:'SUCCESS',oi4hPct:.2,oiValueUsdt:10_000_000},
    {symbol:'B',status:'SUCCESS',oi4hPct:.5,oiValueUsdt:10_000_000},
    {symbol:'C',status:'SUCCESS',oi4hPct:1.0,oiValueUsdt:10_000_000},
    {symbol:'D',status:'SUCCESS',oi4hPct:1.4,oiValueUsdt:10_000_000},
    {symbol:'E',status:'SUCCESS',oi4hPct:2.2,oiValueUsdt:10_000_000},
    {symbol:'F',status:'SUCCESS',oi4hPct:4.0,oiValueUsdt:2_000_000}
  ]);
  assert(oi.find(x=>x.symbol==='E').pass,'top relative OI with sufficient notional should pass');
  assert.equal(oi.find(x=>x.symbol==='F').pass,false,'low absolute OI notional should fail even with high pct');
  assert(Math.abs(Grok.basisPct(101,100)-1)<1e-9,'basis pct');

  const day=86400000,tf=900000,asOf=10*day+12*3600000+tf;
  const bars=[];for(let d=4;d<=9;d++)bars.push(k(d*day+12*3600000,1,100,tf));bars.push(k(10*day+12*3600000,1,250,tf));
  const sr=Grok.sameSlotRvol(bars,asOf,5);
  assert(sr>2.4&&sr<2.6,'Grok same-slot RVOL should compare same time across days');

  assert.equal(Gemini.dynamicOiThreshold({breadthRatio:.7}),1);
  assert.equal(Gemini.dynamicOiThreshold({breadthRatio:.45}),1.5);
  assert.equal(Gemini.dynamicOiThreshold({breadthRatio:.2}),2.5);
  assert.equal(Gemini.priceOiDelta({oi4hPct:3,priceChange24h:1}).label,'POSITION_BUILD');
  assert.equal(Gemini.priceOiDelta({oi4hPct:-1,priceChange24h:5}).label,'SHORT_COVER_RISK');
  assert.equal(Gemini.priceOiDelta({oi4hPct:2,priceChange24h:-1}).label,'SHORT_BUILD_RISK');

  assert.equal(Astra.methodOf('grok'),'grok');
  assert.equal(Astra.methodOf('gemini'),'gemini');
  assert.deepEqual(Astra.GROK_TIMEFRAMES,['1w','1d','4h','1h','15m','5m']);
  assert.deepEqual(Astra.GEMINI_TIMEFRAMES,['1w','1d','4h','1h','15m','5m']);
  assert.equal(Astra.GROK_CONFIG.oiRelativeTopPct,.20);
  assert.equal(Astra.GEMINI_CONFIG.oiGateWeakPct,2.5);
  console.log('grok/gemini scan mode verification passed');
})();

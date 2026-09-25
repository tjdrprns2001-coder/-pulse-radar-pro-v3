'use strict';
const assert=require('assert');
const P=require('../lib/coin-scan/light-prescan-engine.js');

function rawCandles(n=160){
  const out=[];let price=100;
  for(let i=0;i<n;i++){
    const drift=i<120?.12:.06;const open=price,close=price+drift,high=Math.max(open,close)+.45,low=Math.min(open,close)-.42,vol=1000+(i%9)*25;
    out.push([i*3600000,open,high,low,close,vol,(i+1)*3600000-1,vol*close,100,vol*.55,vol*close*.55,0]);price=close;
  }
  return out;
}
const rising=rawCandles();
const ma=P.maState(P.rows(rising),'1h');
assert(ma&&ma.score>=60,'rising MA structure should be detected');

const liq=rawCandles();
const priorLow=Math.min(...liq.slice(-13,-1).map(x=>x[3]));
liq[liq.length-1][3]=priorLow-2;
liq[liq.length-1][4]=priorLow+.8;
liq[liq.length-1][2]=Math.max(liq[liq.length-1][2],priorLow+1.2);
const l=P.liquidityState(P.rows(liq),'1h');
assert(l&&l.active&&l.stage==='SSL_SWEEP_RECLAIM','SSL sweep reclaim must be promoted');

const analysis=P.analyze({symbol:'TESTUSDT',frames:{'1h':liq,'4h':rising},fast:{candidateScore:50},evidence:{priceChange24h:11,quoteVolume24h:20_000_000}});
assert(analysis.eligible,'strong light pattern must be eligible');
assert(analysis.reentryLike,'surged coin with structural pattern should be marked reentry-like');
assert(analysis.strongKinds.includes('LIQUIDITY'),'liquidity track should survive aggregation');

const selected=P.select([
  {...analysis,symbol:'AUSDT',score:90,strongKinds:['LIQUIDITY']},
  {...analysis,symbol:'BUSDT',score:89,strongKinds:['MA']},
  {...analysis,symbol:'CUSDT',score:88,strongKinds:['TRENDLINE']},
  {...analysis,symbol:'DUSDT',score:87,strongKinds:['REVERSAL']},
  {...analysis,symbol:'EUSDT',score:86,strongKinds:['COMPRESSION']}
],5);
assert.equal(selected.length,5,'selector should preserve strategy diversity');
assert.equal(new Set(selected.map(x=>x.symbol)).size,5,'prescan selection must dedupe symbols');
console.log('light prescan engine PASS');

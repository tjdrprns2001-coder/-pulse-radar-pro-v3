'use strict';
const assert=require('assert');
const A=require('../ui/trader/analysis-engine.js');

function candle(i,close,{volume=100,low=null,high=null}={}){
  return {
    time:1700000000000+i*86400000,
    closeTime:1700000000000+(i+1)*86400000-1,
    open:close-0.15,
    high:high==null?close+0.8:high,
    low:low==null?close-0.8:low,
    close,
    volume,
    partial:false
  };
}

function dSeries(){
  const c=[];
  for(let i=0;i<474;i++)c.push(candle(i,100));
  for(let i=474;i<497;i++)c.push(candle(i,103));
  c.push(candle(497,102.4,{low:100.4,volume:80}));
  c.push(candle(498,102.6,{low:100.5,volume:75}));
  c.push(candle(499,102.8,{low:100.6,volume:85}));
  return c;
}

{
  const r=A.danteMaCloudCycle(dSeries());
  assert.equal(r.stage,'D',JSON.stringify(r));
  assert.equal(r.matched,true);
  assert(Number.isFinite(r.lines[112]));
  assert(Number.isFinite(r.lines[224]));
  assert(Number.isFinite(r.lines[448]));
  assert.equal(r.cloud.position,'above');
  assert.equal(r.flags.retest224,true);
}
{
  const c=dSeries();
  c[c.length-1]=candle(c.length-1,99.1,{low:98.7,high:100.2,volume:220});
  const r=A.danteMaCloudCycle(c);
  assert.equal(r.stage,'F',JSON.stringify(r));
  assert.equal(r.matched,false);
}
{
  const c=[];
  for(let i=0;i<490;i++)c.push(candle(i,120-i*.04,{volume:100}));
  for(let i=490;i<497;i++)c.push(candle(i,100+i*.9,{volume:180}));
  c.push(candle(497,104.5,{low:103.5,volume:90}));
  c.push(candle(498,104.3,{low:103.7,volume:80}));
  c.push(candle(499,104.8,{low:103.9,volume:85}));
  const r=A.danteMaCloudCycle(c);
  assert(['PRE','A','A_WAIT','B','C','D','D_HOLD','TREND_PULLBACK','E','F'].includes(r.stage),JSON.stringify(r));
  assert(r.gap112_224_pct==null||Number.isFinite(r.gap112_224_pct));
}
console.log('dante MA cloud cycle PASS');

'use strict';
const assert=require('assert');
const S=require('../lib/coin-scan/sampling-v3.js');

function rows(count=120,tf=300000){
  const out=[];let p=100;const start=1_700_000_000_000;
  for(let i=0;i<count;i++){
    const drift=i<60?0.02:(i<90?0.08:0.18);
    const o=p,c=p*(1+drift/100),h=Math.max(o,c)*(1+(i%17===0?.012:.002)),l=Math.min(o,c)*(1-(i%23===0?.01:.002));
    const v=i===95?5000:1000+(i%5)*20,buy=v*(i>=90?.68:.52);
    out.push([start+i*tf,String(o),String(h),String(l),String(c),String(v),start+(i+1)*tf-1,String(v*c),100,String(buy),String(buy*c),'0']);
    p=c;
  }
  return out;
}

const src=rows(180,60000);
const r15=S.resampleOHLCV(src,'1m','15m',{asOf:1_700_000_000_000+180*60000+1});
assert.equal(r15.length,12,'1m -> 15m exact bucket count');
assert(r15.every(x=>Number.isFinite(Number(x[4]))),'resampled close numeric');

const base=rows(140,900000);
const cusum=S.cusumEvents(base);
const pth=S.priceThresholdEvents(base);
const range=S.rangeEvents(base);
const rv=S.rvolEvents(base);
const sweeps=S.liquiditySweepEvents(base);
assert(Array.isArray(cusum)&&cusum.length>0,'CUSUM events required');
assert(Array.isArray(pth)&&pth.length>0,'price-threshold events required');
assert(Array.isArray(range),'range events array');
assert(Array.isArray(rv),'RVOL events array');
assert(Array.isArray(sweeps),'liquidity sweep events array');

const d=S.derivativeEvents({oi1hPct:1.2,oi4hPct:3.1,taker15m:1.4,taker5m:1.3},Date.now());
assert(d.some(x=>x.type==='OI_ACCEL_1H'));
assert(d.some(x=>x.type==='OI_BUILD_4H'));
assert(d.some(x=>x.type==='TAKER_BUY_PULSE_15M'));

const tb=S.tripleBarrier(base,{index:80,time:Number(base[80][6])});
assert(['UPPER_BARRIER_HIT','LOWER_BARRIER_HIT','TIME_EXPIRED','AMBIGUOUS_SAME_BAR'].includes(tb.status));

const built=S.buildSamplingV3({
  rows5m:rows(140,300000),rows15m:base,asOf:Number(base.at(-1)[6])+1,
  derivatives:{oi1hPct:1.1,oi4hPct:3.2,taker15m:1.35,taker5m:1.28}
});
assert.equal(built.version,'ASTRA_SAMPLING_V3');
assert.equal(built.mode,'SHADOW');
assert.equal(built.rankingEffect,0);
assert(Array.isArray(built.sequence.recent));
assert(Number.isFinite(built.evidenceScore));
assert(typeof built.sequence.stage==='string');
console.log('sampling v3 PASS',JSON.stringify({events:built.sequence.eventCount,stage:built.sequence.stage,evidenceScore:built.evidenceScore,outcome:built.latestOutcomeProbe.status}));

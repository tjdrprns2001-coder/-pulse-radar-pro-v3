'use strict';
const assert=require('assert');
const {createFrozenManifest}=require('../lib/research-backtest-v2/contracts.js');
const {trimClosedFrames,buildFeatureSnapshot}=require('../lib/research-backtest-v2/features.js');

function bar(openTime,closeTime,close,vol=100,quote=1000,taker=550){
  return [openTime,close,close*1.01,close*.99,close,vol,closeTime,quote,10,taker/close,taker,0];
}
function series(step,count,start=0,base=100){
  return Array.from({length:count},(_,i)=>bar(start+i*step,start+(i+1)*step-1,base+i*.1,100+i,1000+i*5,550+i));
}
const manifest=createFrozenManifest({
  manifestVersion:'threshold-v1',createdAt:1,derivedFromSplit:'train',
  screenerConfigVersion:'screen-v1',signalTimeframe:'15m',evaluationGridMs:900000,
  thresholds:{volumeMultiple:3}
});
const cutoff=30*900000-1;
const baseFrames={
  '5m':series(300000,90),
  '15m':series(900000,30),
  '1h':series(3600000,30,0,90),
  '4h':series(14400000,10,0,80),
  '1d':series(86400000,5,0,70),
  '1w':series(604800000,2,0,60)
};
const future=bar(30*900000,31*900000-1,9999,999999,99999999,99999999);
const framesA={...baseFrames,'15m':[...baseFrames['15m'],future]};
const framesB={...baseFrames,'15m':[...baseFrames['15m'],[...future.slice(0,4),123456,...future.slice(5)]]};

const trimmed=trimClosedFrames(framesA,cutoff);
assert.equal(trimmed['15m'].length,30);
assert(trimmed['15m'].every(x=>Number(x[6])<=cutoff));

const input={symbol:'AAAUSDT',signalCandleCloseTs:cutoff,manifest,
  universe:{universeVersion:'u1',universeMode:'current-survivors-only',survivorshipSafe:false},
  scannerItem:{candidateScore:77,tradeSignal:{confidence:64},quoteVolume24h:null,sector:'AI',scanClass:{key:'ANOMALY',label:'🟠 이상징후'}}};
const a=buildFeatureSnapshot({...input,frames:framesA});
const b=buildFeatureSnapshot({...input,frames:framesB});
assert.deepEqual(a.numericFeatures,b.numericFeatures,'future candle changed features');
assert.equal(a.signalCandleCloseTs,cutoff);
assert.equal(a.signalCandleOpenTs,29*900000);
assert.equal(a.numericFeatures.quoteVolume24h,null,'missing feature must stay null');
assert.equal(a.featureAvailability.quoteVolume24h,false);
assert.equal(typeof a.numericFeatures.rsi15m,'number');
assert.equal(typeof a.numericFeatures.macdHist15m,'number');
assert.equal(typeof a.numericFeatures.atr15m,'number');
assert(a.numericFeatures.ribbonWidthAtr15m===null||Number.isFinite(a.numericFeatures.ribbonWidthAtr15m));
assert(Object.isFrozen(a));
assert(Object.isFrozen(a.numericFeatures));
console.log('research features PASS');

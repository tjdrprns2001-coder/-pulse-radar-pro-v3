const assert=require('assert');
const deep=require('../lib/coin-scan/deep-scan.js');

function mk(open,close,vol,buyQuote){
  const q=vol*close;
  const buy=buyQuote==null?q*.55:buyQuote;
  return [0,String(open),String(Math.max(open,close)*1.01),String(Math.min(open,close)*.99),String(close),String(vol),Date.now()-1000,String(q),100,String(vol*.55),String(buy),0];
}
const up=Array.from({length:90},(_,i)=>mk(100+i,101+i,1000+i*10));
const frames={'1w':up,'3d':up,'1d':up,'12h':up,'4h':up,'1h':up,'15m':up,'5m':up};
const out=deep.analyzeDeep({symbol:'XLMUSDT',frames,dataState:'live',oiChangePct:null,fundingPct:null,alertState:'WATCH'});
assert.equal(out.symbol,'XLMUSDT');
assert.deepEqual(Object.keys(out.tfState),['1w','3d','1d','12h','4h','1h','15m','5m']);
assert.equal(out.oiChangePct,null);
assert.equal(out.fundingPct,null);
assert(out.preSurge&&typeof out.preSurge.label==='string');
assert(out.takerRatio===null||out.takerRatio>0);
assert(Array.isArray(out.reasons));
assert(out.momentumSignals&&typeof out.momentumSignals==='object','momentumSignals required');
assert(out.samplePattern&&typeof out.samplePattern==='object','samplePattern required');
assert(out.sampleSimilarityV2&&out.sampleSimilarityV2.version==='SAMPLE_SIMILARITY_v2','sample similarity v2 required');
assert(Array.isArray(out.sampleSimilarityV2.successTop5)&&out.sampleSimilarityV2.successTop5.length<=5,'success TOP5 required');
assert(Array.isArray(out.sampleSimilarityV2.negativeTop3)&&out.sampleSimilarityV2.negativeTop3.length<=3,'negative TOP3 required');
assert(typeof out.sampleSimilarityV2.ignitionPath==='string','ignition path required');
assert(out.samplingV3&&out.samplingV3.version==='ASTRA_SAMPLING_V3','shared deep analyzer must attach Sampling v3');
assert.equal(out.samplingV3.rankingEffect,0,'shared Sampling v3 must remain shadow');
assert(out.samplingV3.integrity&&typeof out.samplingV3.integrity.status==='string','shared deep integrity audit required');
assert.equal(out.samplingV3.microstructure.status,'NOT_REQUESTED','microstructure must not be fetched implicitly inside shared analyzer');
assert(out.strategyCycle&&typeof out.strategyCycle==='object','multi-strategy cycle required');
assert(Array.isArray(out.strategyCycle.activeTracks),'multi-strategy active tracks required');
assert(typeof out.strategyCycle.stage==='string','multi-strategy stage required');
for(const k of ['sweep','timeSymmetry','resetReignition','volumeShockMemory','similarity','dormancy'])assert(Object.prototype.hasOwnProperty.call(out.samplePattern,k),`samplePattern ${k} required`);
assert(Object.prototype.hasOwnProperty.call(out,'volumeShockMemory'),'top-level volumeShockMemory required');
for(const k of ['rsi1h','rsi15m','macd1h','macd15m','stochRsi1h','stochRsi15m','aligned','overheated','score'])assert(Object.prototype.hasOwnProperty.call(out.momentumSignals,k),`${k} required`);
assert(Number.isFinite(out.momentumSignals.rsi1h),'1h RSI should be finite with enough candles');
assert(Number.isFinite(out.momentumSignals.rsi15m),'15m RSI should be finite with enough candles');
assert(Object.prototype.hasOwnProperty.call(out,'priceChange1h'),'deep scan must expose recent 1h price extension');
assert(Object.prototype.hasOwnProperty.call(out,'priceChange15m'),'deep scan must expose recent 15m price extension');
for(const k of ['rvol4h','rsi1h','rsi15m','rsi5m','macd1hPositive','maAligned1h','obv1hUp','breakout4h','lowerTfReset'])assert(Object.prototype.hasOwnProperty.call(out.v2Input,k),'v2 DNA input '+k+' required');
assert(Array.isArray(out.v2Flow.dnaTags),'v2 DNA tags required');
assert(Object.prototype.hasOwnProperty.call(out.v2Flow,'absorptionPresurge'),'absorption PRE-SURGE flag required');
assert(Number.isFinite(out.priceChange1h),'1h recent price extension should be finite');
assert(Number.isFinite(out.priceChange15m),'15m recent price extension should be finite');
const blocked=deep.analyzeDeep({symbol:'XLMUSDT',frames,dataState:'stale'});
assert.equal(blocked.preSurge.label,'판정 보류');
const missing=deep.analyzeDeep({symbol:'EMPTYUSDT',frames:{},dataState:'live'});
assert.equal(missing.oiChangePct,null);
assert.equal(missing.fundingPct,null);
assert.equal(missing.takerRatio,null);

const surgeRows=Array.from({length:90},(_,i)=>{const vol=i>=85?6000:1000;const price=100+i*.3;return mk(price,price+.5,vol,vol*(price+.5)*.72)});
const surgeFrames={'1w':surgeRows,'3d':surgeRows,'1d':surgeRows,'12h':surgeRows,'4h':surgeRows,'1h':surgeRows,'15m':surgeRows,'5m':surgeRows};
const strong=deep.analyzeDeep({symbol:'TESTUSDT',frames:surgeFrames,dataState:'live',oiChangePct:3,fundingPct:.01});
assert.equal(strong.alertState,'ARMED','strong multi-factor evidence should derive ARMED');
assert.equal(strong.preSurge.label,'가능성 높음','PRE-SURGE v2 strong path must be reachable when optional OI is available');

const snap=deep.indicatorSnapshot(up);
for(const k of ['rsi','macdHist','stochRsi','k','d','j','score','aligned','overheated'])assert(Object.prototype.hasOwnProperty.call(snap,k),`indicator ${k} required`);
console.log('coin scan deep PASS');

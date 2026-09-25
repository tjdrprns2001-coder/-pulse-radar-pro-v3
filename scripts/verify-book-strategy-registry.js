'use strict';
const assert=require('assert');
const R=require('../lib/coin-scan/book-strategy-registry.js');
const E=require('../lib/coin-scan/book-manual-engine.js');

assert.equal(R.VERSION,'BOOK_STRATEGY_REGISTRY_v1');
for(const id of ['MARKET_STRUCTURE','TRENDLINE_RETEST','MA_STRUCTURE','VOLUME_PRICE','VWAP','CVD','BOLLINGER','FIBONACCI','ELLIOTT','WYCKOFF_ACCUMULATION','WYCKOFF_DISTRIBUTION','VOLUME_PROFILE','LIQUIDITY_SWEEP','GAP','MEAN_REVERSION','REENTRY_SECOND_WAVE','POSITION_SIZING','INVALIDATION']){
  assert(R.get(id),`missing registry technique ${id}`);
}
assert.equal(R.get('BOLLINGER').mode,'evidence','Bollinger must remain evidence-only');
assert.equal(R.get('BOLLINGER').rankingWeight,0,'Bollinger must not affect ranking');
assert.equal(R.get('CVD').mode,'data-required','CVD requires true trade-direction data');
assert.equal(R.get('GAP').mode,'not-applicable','stock-style gap strategy must be disabled for default 24/7 crypto scan');

function candles(n=180){
  const out=[];let p=100;
  for(let i=0;i<n;i++){
    const drift=i<120?.12:i<150?-.04:.09,open=p,close=p+drift,high=Math.max(open,close)+.5,low=Math.min(open,close)-.45,vol=1000+(i%11)*35;
    out.push([i*3600000,open,high,low,close,vol,(i+1)*3600000-1,vol*close,100,vol*.55,vol*close*.55,0]);p=close;
  }
  return out;
}
const frames={'1d':candles(180),'4h':candles(180),'1h':candles(180)};
const x=E.analyze({frames});
assert.equal(x.registryVersion,R.VERSION);
assert(x.registrySummary.total>=35,'registry should include the full technique families');
assert(Array.isArray(x.evidence),'book evidence must be exposed');
assert(Array.isArray(x.rankable),'book rank tracks must be exposed');
assert(x.riskPlan&&Number.isFinite(x.riskPlan.invalidation),'risk plan must include invalidation');
assert(x.dataGaps.some(g=>g.id==='CVD'),'missing true CVD must be explicit');
assert(x.dataGaps.some(g=>g.id==='GAP'),'24/7 gap inapplicability must be explicit');
assert(!x.rankable.some(t=>t.id==='BOLLINGER'),'evidence-only Bollinger must not promote ranking');
console.log('book strategy registry PASS');

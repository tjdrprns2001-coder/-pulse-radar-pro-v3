const assert=require('assert');
const core=require('../lib/coin-scan/scanner-core.js');

const exchangeInfo={symbols:[
  {symbol:'XLMUSDT',baseAsset:'XLM',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'BTCUPUSDT',baseAsset:'BTCUP',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC',status:'TRADING',isSpotTradingAllowed:true},
  {symbol:'OLDUSDT',baseAsset:'OLD',quoteAsset:'USDT',status:'BREAK',isSpotTradingAllowed:true}
]};
const tickers=[{symbol:'XLMUSDT',lastPrice:'0.3',quoteVolume:'10000000',priceChangePercent:'2'}];
const universe=core.filterUniverse(exchangeInfo,tickers);
assert.deepEqual(universe.map(x=>x.symbol),['XLMUSDT']);

assert.equal(core.classify({dataState:'stale'}).category,'데이터 부족·판정 보류');
assert.equal(core.classify({dataState:'live',alreadySurged:true}).category,'이미 급등함');
assert.equal(core.classify({dataState:'live',structure:'bearish',takerRatio:.7}).category,'약세·이탈');
assert.equal(core.classify({dataState:'live',preSurge:{label:'가능성 높음'}}).category,'급등 전조 강함');
assert.equal(core.classify({dataState:'delayed',preSurge:{label:'가능성 높음'}}).category,'급등 전조 관찰');
assert.equal(core.classify({dataState:'live',volumeAcceleration:2.1,takerRatio:1}).category,'거래량 이상징후');
assert.equal(core.classify({dataState:'live',takerRatio:1.3,priceChange1h:1.2}).category,'매수세 유입');
assert.equal(core.classify({dataState:'live',structure:'bullish',pullback:true,reaccumulating:true}).category,'눌림·재축적');
const summary=core.beginnerSummary({category:'급등 전조 관찰',structure:'bullish',dataState:'live',reasons:['1H 거래량 증가']});
assert(summary.includes('상승'),'summary should mention bullish structure');
assert(summary.includes('1H 거래량 증가'),'summary should include a concrete reason');
assert(summary.includes('정상'),'summary should mention data state');
assert(!summary.includes('매수하세요'),'summary must not instruct a trade');

const fast=core.fastScore({priceChange24h:3,quoteVolume24h:10000000,volumeAcceleration:1.8,takerRatio:1.2});
assert(Number.isFinite(fast.candidateScore));
assert(fast.candidateScore>=0&&fast.candidateScore<=100);
assert(Array.isArray(fast.fastReasons));
assert.equal(core.CATEGORY_ORDER.length,8);

const strong=core.buildTradeSignal({
  dataState:'live',category:'급등 전조 강함',structure:'bullish',
  preSurge:{label:'가능성 높음',confirmations:4},takerRatio:1.42,
  volumeAcceleration:2.1,priceChange1h:2.4,priceChange15m:1.1,alreadySurged:false,
  momentumSignals:{aligned:true,overheated:false,score:4}
});
assert.equal(strong.level,'매수 후보');
assert(strong.confidence>=80,'strong candidate should have high confidence');
assert(strong.confirmations>=4,'strong candidate should require multiple confirmations');
assert(strong.reasons.some(x=>x.includes('모멘텀')),'aligned momentum should appear as one confirmation axis');
assert.equal(strong.invalidations.length,0);

const watch=core.buildTradeSignal({
  dataState:'live',category:'급등 전조 관찰',structure:'bullish',
  preSurge:{label:'관찰',confirmations:2},takerRatio:1.18,
  volumeAcceleration:1.5,priceChange1h:1.1,priceChange15m:.4,alreadySurged:false,
  momentumSignals:{aligned:false,overheated:false,score:1}
});
assert.equal(watch.level,'관찰');
assert(watch.confidence>0&&watch.confidence<80);

const overheated=core.buildTradeSignal({
  dataState:'live',category:'급등 전조 강함',structure:'bullish',
  preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.5,
  volumeAcceleration:2.3,priceChange1h:4.5,priceChange15m:2.2,alreadySurged:false,
  momentumSignals:{aligned:true,overheated:true,score:4,rsi1h:78,rsi15m:84}
});
assert.notEqual(overheated.level,'매수 후보','overheated momentum must downgrade a strong candidate');
assert(overheated.invalidations.some(x=>x.includes('과열')),'overheated downgrade must explain why');

const weakFlow=core.buildTradeSignal({
  dataState:'live',category:'급등 전조 강함',structure:'bullish',
  preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.03,
  volumeAcceleration:1.12,priceChange1h:1.8,priceChange15m:.6,reaccumulating:true,alreadySurged:false,
  momentumSignals:{aligned:true,overheated:false,score:4}
});
assert.notEqual(weakFlow.level,'매수 후보','indicator alignment must not override weak volume/flow');
assert(weakFlow.invalidations.some(x=>x.includes('거래량')||x.includes('체결')),'weak market confirmation downgrade must explain volume/flow weakness');

const lateChase=core.buildTradeSignal({
  dataState:'live',category:'급등 전조 강함',structure:'bullish',
  preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.55,
  volumeAcceleration:2.2,priceChange1h:7.2,priceChange15m:4.1,alreadySurged:false,
  momentumSignals:{aligned:true,overheated:false,score:4}
});
assert.notEqual(lateChase.level,'매수 후보','late short-term chase must be downgraded before hard surge threshold');
assert(lateChase.invalidations.some(x=>x.includes('추격')),'late chase downgrade must explain short-term extension');

const delayed=core.buildTradeSignal({dataState:'delayed',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.5,volumeAcceleration:2.5});
assert.equal(delayed.level,'제외');
assert(delayed.invalidations.some(x=>x.includes('데이터')));

const surged=core.buildTradeSignal({dataState:'live',category:'이미 급등함',structure:'bullish',alreadySurged:true,takerRatio:1.5,volumeAcceleration:2.5});
assert.equal(surged.level,'제외');
assert(surged.invalidations.some(x=>x.includes('급등')));

const bearish=core.buildTradeSignal({dataState:'live',category:'약세·이탈',structure:'bearish',takerRatio:.8,volumeAcceleration:2});
assert.equal(bearish.level,'제외');
assert(bearish.invalidations.some(x=>x.includes('약세')));
console.log('coin scan core PASS');

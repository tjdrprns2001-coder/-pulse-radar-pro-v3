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
assert(!core.beginnerSummary({category:'급등 전조 관찰',structure:'bullish',dataState:'live',reasons:['1H 거래량 증가']}).includes('매수하세요'));
const fs=core.fastScore({priceChange24h:2,volumeAcceleration:2.2,priceFromHighPct:-8,takerRatio:1.25,volatility:1.8});
assert(fs.candidateScore>0&&fs.candidateScore<=100);
assert.equal(fs.volumeAnomaly,true);
console.log('coin scan core PASS');

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

assert(Array.isArray(core.SCAN_CLASS_ORDER),'v2 scan class order required');
assert.equal(core.SCAN_CLASS_ORDER.length,9,'nine scanner classes required');
for(const key of ['PRE-SURGE','ACCUMULATION-PRE','META-PRE','SECTOR-ROTATION','ANOMALY','POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE'])assert(core.SCAN_CLASS_ORDER.includes(key),`missing ${key}`);

const pre=core.classifyV2({dataState:'live',alreadySurged:false,structure:'bullish',structureShift4h:true,priceChange24h:2.2,priceChange1h:2.1,priceChange15m:1.1,volumeAcceleration15m:3.4,volumeIncreasing5m:3,takerRatio:1.25,momentumSignals:{aligned:true,overheated:false}});
assert.equal(pre.key,'PRE-SURGE');
const learned=core.classifyV2({dataState:'live',priceChange24h:2.1,structure:'neutral',samplePattern:{archetype:'A+B',archetypeLabel:'A+B형 · OI축적+taker 왕복',phase:'IGNITION-WAIT',phaseLabel:'점화대기',score:72,reasons:['OI +3.2%'],liquidity:{label:'하단 유동성 보존'}}});
assert.equal(learned.key,'PRE-SURGE','learned sample DNA should promote a fresh candidate');
const learnedV4=core.classifyV2({dataState:'live',priceChange24h:1.8,structure:'neutral',samplePattern:{archetype:'NEUTRAL',phase:'OBSERVE',phaseLabel:'관찰',score:68,preSurgeDna:{eligible:true,label:'PRE-SURGE DNA 78'},maCluster:{label:'이평 초압축'},volumeMaDna:{label:'IGNITION'},flowType:{key:'DIRECT_BUILD',label:'DIRECT-BUILD'},reasons:['4H 이평 선행전환']}});
assert.equal(learnedV4.key,'PRE-SURGE','v4 MA-volume DNA should promote even when legacy archetype is neutral');
const controlBlocked=core.classifyV2({dataState:'live',priceChange24h:1.2,structure:'neutral',samplePattern:{archetype:'A+B',phase:'IGNITION-WAIT',score:90,controlRisk:true,preSurgeDna:{eligible:false,label:'대조군 유사'},flowType:{key:'PRICE_LED'}}});
assert.notEqual(controlBlocked.key,'PRE-SURGE','negative control similarity must block sample promotion');
const post=core.classifyV2({dataState:'live',priceChange24h:12,priceChange1h:7.5,priceChange15m:4.3,volumeAcceleration15m:4,takerRatio:1.4});
assert.equal(post.key,'POST-SURGE','already extended names must not remain PRE');
const pump=core.classifyV2({dataState:'live',quoteVolume24h:700000,priceChange24h:7,priceChange15m:3.5,volumeAcceleration15m:4.4,takerRatio:1.05,structure:'neutral',momentumSignals:{aligned:false}});
assert.equal(pump.key,'PUMP-RISK','thin liquidity burst without structure should be pump risk');
const accumulation=core.classifyV2({dataState:'live',priceChange24h:2.5,structure:'bullish',volumeAcceleration4h:1.25,volumeAcceleration1h:1.4,lowTrend:'rising',breakout:false,takerRatio:1.06});
assert.equal(accumulation.key,'ACCUMULATION-PRE');
const meta=core.classifyV2({dataState:'live',priceChange24h:2,metaEvidence:{strength:'strong',sources:2},structure:'neutral'});
assert.equal(meta.key,'META-PRE');
const noMeta=core.classifyV2({dataState:'live',priceChange24h:2,structure:'neutral'});
assert.notEqual(noMeta.key,'META-PRE','no source-backed meta evidence means no META-PRE');
const stale=core.classifyV2({dataState:'delayed'});
assert.equal(stale.key,'STALE');
assert(pre.label.includes('급등 직전'),'Korean label required');

assert.equal(core.classify({dataState:'stale'}).category,'데이터 부족·판정 보류');
assert.equal(core.classify({dataState:'live',alreadySurged:true}).category,'이미 급등함');
assert.equal(core.classify({dataState:'live',structure:'bearish',takerRatio:.7}).category,'약세·이탈');
assert.equal(core.classify({dataState:'live',preSurge:{label:'가능성 높음'}}).category,'급등 전조 강함');
assert.equal(core.classify({dataState:'delayed',preSurge:{label:'가능성 높음'}}).category,'급등 전조 관찰');
assert.equal(core.classify({dataState:'live',volumeAcceleration:2.1,takerRatio:1}).category,'거래량 이상징후');
assert.equal(core.classify({dataState:'live',takerRatio:1.3,priceChange1h:1.2}).category,'매수세 유입');
assert.equal(core.classify({dataState:'live',structure:'bullish',pullback:true,reaccumulating:true}).category,'눌림·재축적');
const summary=core.beginnerSummary({category:'급등 전조 관찰',structure:'bullish',dataState:'live',reasons:['1H 거래량 증가']});
assert(summary.includes('상승'));
assert(summary.includes('1H 거래량 증가'));
assert(summary.includes('정상'));
assert(!summary.includes('매수하세요'));

const fast=core.fastScore({priceChange24h:3,quoteVolume24h:10000000,volumeAcceleration:1.8,takerRatio:1.2});
assert(Number.isFinite(fast.candidateScore));
assert(fast.candidateScore>=0&&fast.candidateScore<=100);
assert(Array.isArray(fast.fastReasons));
assert.equal(core.CATEGORY_ORDER.length,8);

const strong=core.buildTradeSignal({dataState:'live',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:4},takerRatio:1.42,volumeAcceleration:2.1,priceChange1h:2.4,priceChange15m:1.1,alreadySurged:false,momentumSignals:{aligned:true,overheated:false,score:4}});
assert.equal(strong.level,'매수 후보');
assert(strong.confidence>=80);
assert(strong.confirmations>=4);
assert(strong.reasons.some(x=>x.includes('모멘텀')));
assert.equal(strong.invalidations.length,0);

const watch=core.buildTradeSignal({dataState:'live',category:'급등 전조 관찰',structure:'bullish',preSurge:{label:'관찰',confirmations:2},takerRatio:1.18,volumeAcceleration:1.5,priceChange1h:1.1,priceChange15m:.4,alreadySurged:false,momentumSignals:{aligned:false,overheated:false,score:1}});
assert.equal(watch.level,'관찰');
assert(watch.confidence>0&&watch.confidence<80);

const overheated=core.buildTradeSignal({dataState:'live',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.5,volumeAcceleration:2.3,priceChange1h:4.5,priceChange15m:2.2,alreadySurged:false,momentumSignals:{aligned:true,overheated:true,score:4,rsi1h:78,rsi15m:84}});
assert.notEqual(overheated.level,'매수 후보','overheated momentum must downgrade a strong candidate');
assert(overheated.invalidations.some(x=>x.includes('과열')),'overheated downgrade must explain why');

const pumpBlocked=core.buildTradeSignal({dataState:'live',scanClassKey:'PUMP-RISK',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.55,volumeAcceleration:2.4,priceChange1h:2.2,priceChange15m:1.1,momentumSignals:{aligned:true,overheated:false,score:4}});
assert.notEqual(pumpBlocked.level,'매수 후보','PUMP-RISK must never show a buy candidate');
assert(pumpBlocked.invalidations.some(x=>x.includes('위험')),'risk-class block must be explained');
const postBlocked=core.buildTradeSignal({dataState:'live',scanClassKey:'POST-SURGE',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.55,volumeAcceleration:2.4,priceChange1h:2.2,priceChange15m:1.1,momentumSignals:{aligned:true,overheated:false,score:4}});
assert.notEqual(postBlocked.level,'매수 후보','POST-SURGE must never show a buy candidate');
const distributionBlocked=core.buildTradeSignal({dataState:'live',scanClassKey:'DISTRIBUTION-RISK',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.55,volumeAcceleration:2.4,priceChange1h:2.2,priceChange15m:1.1,momentumSignals:{aligned:true,overheated:false,score:4}});
assert.notEqual(distributionBlocked.level,'매수 후보','DISTRIBUTION-RISK must never show a buy candidate');

const weakFlow=core.buildTradeSignal({dataState:'live',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.03,volumeAcceleration:1.12,priceChange1h:1.8,priceChange15m:.6,reaccumulating:true,alreadySurged:false,momentumSignals:{aligned:true,overheated:false,score:4}});
assert.notEqual(weakFlow.level,'매수 후보');
assert(weakFlow.invalidations.some(x=>x.includes('거래량')||x.includes('체결')),'weak market confirmation downgrade must explain volume/flow weakness');
const lateChase=core.buildTradeSignal({dataState:'live',category:'급등 전조 강함',structure:'bullish',preSurge:{label:'가능성 높음',confirmations:5},takerRatio:1.55,volumeAcceleration:2.2,priceChange1h:7.2,priceChange15m:4.1,alreadySurged:false,momentumSignals:{aligned:true,overheated:false,score:4}});
assert.notEqual(lateChase.level,'매수 후보');
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

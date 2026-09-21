const assert=require('assert');
const Book=require('../lib/coin-scan/book-evidence.js');
const V2=require('../lib/coin-scan/v2-flow-scanner.js');
const Core=require('../lib/coin-scan/scanner-core.js');
const Deep=require('../lib/coin-scan/deep-scan.js');

function mk(i,drift=.08,vol=1200){
  const o=100+i*drift,c=o+drift*.8,h=Math.max(o,c)+.45,l=Math.min(o,c)-.35,q=vol*c,buy=q*.62;
  return [i*3600000,String(o),String(h),String(l),String(c),String(vol),i*3600000+3599999,String(q),100,String(vol*.6),String(buy),0];
}
const base=Array.from({length:180},(_,i)=>mk(i,.06,1000+(i%12)*20));
const frames={'1w':base,'3d':base,'1d':base,'12h':base,'4h':base,'1h':base,'15m':base,'5m':base};

const evidence=Book.analyze(frames);
assert(evidence.available,'book/SMC/ICT evidence must be available');
assert(evidence.book&&Number.isFinite(Number(evidence.book.score)),'book evidence score required');
assert(evidence.smc&&Object.prototype.hasOwnProperty.call(evidence.smc,'bias'),'SMC evidence required');
assert(evidence.ict&&Object.prototype.hasOwnProperty.call(evidence.ict,'state'),'ICT evidence required');
assert(evidence.smartMoney&&Number.isFinite(Number(evidence.smartMoney.score)),'smart-money aggregate required');
assert(evidence.disclaimer.includes('승률'),'evidence score must not be described as win rate');

const fusion=V2.buildEvidenceFusion({
  price1hPct:1.1,price24hPct:5,oi4hPct:2.1,taker1h:[1.2,1.3,1.25,1.4,1.35,1.3],
  rvol1h:1.6,rvol15m:2.2,rvol5m:2.1,
  bookBias:'상승',bookScore:82,bookState:'확인',bookHtfAligned:'상승',
  smcBias:'상승',ictBias:'상승',ictState:'forming',smartMoneyBias:'상승',smartMoneyScore:84,smartMoneyAligned:true,
  sampleDnaScore:70
},['ZETA_FLOW_COMPRESSION']);
assert.equal(fusion.eligible,true,'full book+DNA+flow+SMC/ICT evidence must be eligible');
assert(fusion.score>=90,'full evidence should score high');
assert(fusion.disclaimer.includes('승률'),'fusion score must not claim win rate');

const blocked=V2.buildEvidenceFusion({
  price1hPct:.5,price24hPct:3,oi4hPct:2,taker1h:[1.3,1.4],rvol1h:2,
  bookBias:'하락',bookScore:85,bookState:'확인',bookHtfAligned:'하락',
  smcBias:'하락',ictBias:'하락',ictState:'invalidated',smartMoneyBias:'하락',smartMoneyScore:88,
  sampleDnaScore:75
},['PTB_LEVERAGE_IGNITION']);
assert.equal(blocked.eligible,false,'bearish book/SMC/ICT contradiction must block fusion');
assert(blocked.score<=49,'hard contradiction must cap fusion score');

const classified=Core.classifyV2({
  dataState:'live',priceChange24h:4,priceChange1h:1,priceChange15m:.5,quoteVolume24h:20000000,
  volumeAcceleration15m:2,volumeAcceleration1h:1.6,takerRatio:1.3,structure:'bullish',
  momentumSignals:{aligned:true},v2Flow:{fusion}
});
assert.equal(classified.key,'PRE-SURGE','eligible fusion must promote PRE-SURGE');
assert(classified.reasons.some(x=>String(x).includes('책+DNA+수급+SMC/ICT')),'PRE-SURGE reason must expose fusion');

const signal=Core.buildTradeSignal({
  dataState:'live',category:'급등 전조 강함',scanClass:{key:'PRE-SURGE'},structure:'bullish',
  takerRatio:1.3,volumeAcceleration:1.7,priceChange1h:1,priceChange15m:.4,
  momentumSignals:{aligned:true,overheated:false},preSurge:{label:'관찰'},v2Flow:{fusion},
  bookEvidence:{book:{bias:'상승',score:82},smartMoney:{bias:'상승',score:84}}
});
assert.equal(signal.level,'매수 후보','eligible fusion with market confirmation should reach candidate level');
assert(signal.reasons.some(x=>String(x).includes('책+DNA+OI/taker+거래량+SMC/ICT')),'trade signal must state fused evidence');

const deep=Deep.analyzeDeep({symbol:'TESTUSDT',frames,dataState:'live',priceChange24hPct:4,derivativesProfile:{v2Profile:{oi4hPct:2,oi8hPct:2,oi12hPct:1,oi24hPct:2,taker1h:[{ratio:1.3},{ratio:1.35},{ratio:1.25}],taker15m:[{ratio:1.4},{ratio:1.5}],fundingRate:.01}}});
assert(deep.bookEvidence&&deep.bookEvidence.book,'deep scan must attach bookEvidence');
assert(deep.v2Flow&&deep.v2Flow.fusion,'deep scan must attach fusion result');
for(const k of ['bookBias','bookScore','smartMoneyBias','smartMoneyScore'])assert(Object.prototype.hasOwnProperty.call(deep.v2Input,k),'deep v2 input missing '+k);

console.log('PRE-SURGE book + DNA + flow + SMC/ICT fusion PASS');

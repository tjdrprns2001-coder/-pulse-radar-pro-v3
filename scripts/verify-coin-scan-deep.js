const assert=require('assert');
const deep=require('../lib/coin-scan/deep-scan.js');

function mk(open,close,vol,buyQuote){
  const q=vol*close;
  const buy=buyQuote==null?q*.55:buyQuote;
  return [0,String(open),String(Math.max(open,close)*1.01),String(Math.min(open,close)*.99),String(close),String(vol),Date.now()-1000,String(q),100,String(vol*.55),String(buy),0];
}
const up=Array.from({length:90},(_,i)=>mk(100+i,101+i,1000+i*10));
const frames={'1w':up,'1d':up,'4h':up,'1h':up,'15m':up,'5m':up};
const out=deep.analyzeDeep({symbol:'XLMUSDT',frames,dataState:'live',oiChangePct:null,fundingPct:null,alertState:'WATCH'});
assert.equal(out.symbol,'XLMUSDT');
assert.deepEqual(Object.keys(out.tfState),['1w','1d','4h','1h','15m','5m']);
assert.equal(out.oiChangePct,null);
assert.equal(out.fundingPct,null);
assert(out.preSurge&&typeof out.preSurge.label==='string');
assert(out.takerRatio===null||out.takerRatio>0);
assert(Array.isArray(out.reasons));
const blocked=deep.analyzeDeep({symbol:'XLMUSDT',frames,dataState:'stale'});
assert.equal(blocked.preSurge.label,'판정 보류');
const missing=deep.analyzeDeep({symbol:'EMPTYUSDT',frames:{},dataState:'live'});
assert.equal(missing.oiChangePct,null);
assert.equal(missing.fundingPct,null);
assert.equal(missing.takerRatio,null);
console.log('coin scan deep PASS');

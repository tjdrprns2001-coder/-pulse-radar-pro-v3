const assert=require('assert');
const p=require('../lib/coin-scan/ptb-early-cross-exchange.js');
const t0=Date.UTC(2026,8,18);
const r=p.analyzeCrossExchangeLead({symbol:'PTBUSDT',priceChangePct:7.5,
 spot:[{exchange:'mexc',timestamp:t0,volume:300,baselineVolume:100},{exchange:'bitget',timestamp:t0+3600000,volumeRatio:2.4}],
 futures:[{exchange:'binance',timestamp:t0+7200000,volumeRatio:3.2}],
 binanceOi4hPct:3.4,binanceOi8hPct:5.1,
 priceRows:[{timestamp:t0,low:.00068,close:.00070},{timestamp:t0+1,low:.00069,close:.00070},{timestamp:t0+2,low:.00067,close:.000675},{timestamp:t0+3,low:.000675,close:.000705}]
});
assert.equal(r.eligible,true);
assert.equal(r.firstSignal.exchange,'mexc');
assert(r.tags.includes('PTB_EARLY_SPOT_LEAD'));
assert(r.tags.includes('PTB_EARLY_OI_CONFIRM'));
assert.equal(r.sweep.found,true);
const a=p.appendSample([],r),b=p.appendSample(a,r);
assert.equal(b.length,2,'duplicate samples must be preserved');
assert.equal(b[0].symbol,b[1].symbol);
console.log('PTB-EARLY cross-exchange PASS');

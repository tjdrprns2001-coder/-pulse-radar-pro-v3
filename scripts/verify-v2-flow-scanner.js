const assert=require('assert');
const V2=require('../lib/coin-scan/v2-flow-scanner.js');

assert.equal(V2.PARAM_SET,'v2_taker_0.8_1.2');
assert.equal(V2.PARAMS.OI_BUILD_4H_PCT,1);
assert.equal(V2.trueTakerDirection(.8),'none');
assert.equal(V2.trueTakerDirection(1.2),'none');
assert.equal(V2.trueTakerDirection(.79),'sell');
assert.equal(V2.trueTakerDirection(1.5),'strong-buy');

const a=V2.evaluate({symbol:'FETUSDT',price1hPct:.2,price24hPct:1.1,oi4hPct:4.2,oi8hPct:2.4,oi1hPct:.3,taker1h:[1.05,.91,1.01],taker15m:[1.0,1.1],fundingRate:.01,htfRangePct:30,structureImproving:true,rvol1h:1.1});
assert.equal(a.type,'A');
assert.equal(a.direction,'none');
assert.equal(a.oiBuild,true);

const confirmed=V2.evaluate({symbol:'TESTUSDT',price1hPct:1.1,price24hPct:3,oi4hPct:3,oi8hPct:4,taker1h:[1.3,1.4,1.0],taker15m:[1.4,1.5],fundingRate:.01,htfRangePct:30,structureImproving:true,bosUp:true,rvol1h:2});
assert.equal(confirmed.direction,'long');

const nfbsc=V2.evaluate({symbol:'GUSDT',price1hPct:-2,price24hPct:-20,oi4hPct:2.1,oi8hPct:3,taker1h:[.9,.85,.76],fundingRate:-.26,htfRangePct:20,structureImproving:false});
assert.equal(nfbsc.type,'NFB-SC');
assert.equal(nfbsc.direction,'short');

const missing=V2.evaluate({symbol:'NAUSDT',price1hPct:0});
assert.equal(missing.type,'미완성');
assert.equal(missing.direction,'none');
assert(missing.missing.includes('oi4hPct'));

const ptbBuild=V2.evaluate({symbol:'PTBUSDT',price1hPct:.8,price24hPct:5,oi1hPct:9,oi4hPct:2.5,oi8hPct:3.5,oiDrawdownPct:-1,taker1h:[.9,1.0,.95],taker15m:[1.0],fundingRate:.01,htfRangePct:30,structureImproving:true,rvol1h:2.2,volumeShockSeen:true});
assert.equal(ptbBuild.sampleSubtype,'PTB_OI_LED_BUILD');

const ptbReload=V2.evaluate({symbol:'PTBUSDT',price1hPct:-.6,price24hPct:8,oi4hPct:5,oi8hPct:8,oiDrawdownPct:-2,taker1h:[.9,1.0,.95],taker15m:[1.0],fundingRate:.01,htfRangePct:30,structureImproving:true,rvol1h:1.2,priceHoldAfterShock:true});
assert.equal(ptbReload.sampleSubtype,'PTB_OI_LED_RELOAD');

const ptb=V2.evaluate({symbol:'PTBUSDT',price1hPct:.8,price24hPct:5,oi4hPct:5,oi8hPct:8,oiDrawdownPct:-1,taker1h:[.9,1.0,.95],taker15m:[1.0],fundingRate:.01,htfRangePct:30,structureImproving:true,rvol1h:2.5,rvol15m:4,priceHoldAfterShock:true});
assert.equal(ptb.sampleSubtype,'PTB_OI_LED_REIGNITION');

const csv=V2.csvRow({symbol:'FETUSDT',priceClose:.17,price1hPct:.2,price24hPct:1,oi4hPct:4,oi8hPct:2,fundingRate:.01},a,null);
assert.equal(csv.stage_transition,'unknown');
assert.equal(csv.next_open,null);
assert.equal(csv.param_set,'v2_taker_0.8_1.2');

console.log('v2 official flow scanner PASS');

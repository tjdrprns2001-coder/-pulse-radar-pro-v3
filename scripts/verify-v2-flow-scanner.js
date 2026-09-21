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

const zetaBuild=V2.evaluate({symbol:'ZETAUSDT',price1hPct:.6,price24hPct:7,oi1hPct:.4,oi4hPct:.5,oi8hPct:.2,taker1h:[1.46,2.55,1.47,1.32,1.29,1.38],taker15m:[1.1,1.8,.9,5.07,2.04,1.48,1.37,2.37],fundingRate:.005,htfRangePct:20,structureImproving:true,rvol1h:1.2});
assert.equal(zetaBuild.sampleSubtype,'ZETA_FLOW_LED_BUILD');

const zetaExpansion=V2.evaluate({symbol:'ZETAUSDT',price1hPct:48,price24hPct:65,oi1hPct:108,oi4hPct:111,oi8hPct:113,taker1h:[2.55,1.47,1.32,1.29,1.38,.99],taker15m:[1.8,5.07,2.04,1.48,2.37,.87],fundingRate:.005,htfRangePct:20,structureImproving:true,rvol1h:125,bosUp:true,breakout:true});
assert.equal(zetaExpansion.sampleSubtype,'ZETA_DIRECT_OI_EXPANSION');

const zetaDna=V2.evaluate({symbol:'ZETAUSDT',price1hPct:.4,price24hPct:4,oi4hPct:.5,oi12hPct:-.1,oi8hPct:.2,taker1h:[1.35,1.55,1.42,1.6,1.3,1.5],fundingRate:.005,structureImproving:true,rsi5m:26});
assert(zetaDna.dnaTags.includes('ZETA_FLOW_COMPRESSION'));
assert.equal(zetaDna.dnaStage,'FLOW-LED PRE-SURGE');

const phaDna=V2.evaluate({symbol:'PHAUSDT',price1hPct:3.1,price24hPct:10,oi4hPct:-.6,oi12hPct:-3.1,oi24hPct:-1.9,oi72hPct:-10,taker1h:[.8,.9,1.0],fundingRate:.005,bosUp:true,breakout:true,rvol15m:1.9});
assert(phaDna.dnaTags.includes('PHA_SHORT_COVER_ACCEL'));

const ptbDna=V2.evaluate({symbol:'PTBUSDT',price1hPct:2,price24hPct:15,oi4hPct:8,oi12hPct:30,oi24hPct:29,taker1h:[.9,1,1.05],fundingRate:.005,breakout:true,rvol4h:15});
assert(ptbDna.dnaTags.includes('PTB_LEVERAGE_IGNITION'));

const uaiDna=V2.evaluate({symbol:'UAIUSDT',price1hPct:1,price24hPct:9,oi4hPct:.2,oi12hPct:.2,taker1h:[1.02,1.08,1.12,1.15,1.1,1.16],fundingRate:.005,structureShift4h:true,breakout4h:true,maAligned1h:true,macd1hPositive:true,obv1hUp:true});
assert(uaiDna.dnaTags.includes('UAI_TECHNICAL_STEP_IGNITION'));

const kmnoDna=V2.evaluate({symbol:'KMNOUSDT',price1hPct:-2,price24hPct:-4,oi4hPct:.3,oi12hPct:.5,taker1h:[.7,.8,.75],fundingRate:.005,rsi1h:27,rsi15m:8,rvol1h:3.5,rvol15m:18.7,rvol5m:4.2,priceHoldAfterShock:true,sslSweep:true});
assert(kmnoDna.dnaTags.includes('ABSORPTION_LIQUIDITY_SWEEP'));
assert.equal(kmnoDna.absorptionPresurge,true);
assert.equal(kmnoDna.dnaStage,'ABSORPTION / LIQUIDITY-SWEEP PRE-SURGE');

const seiDna=V2.evaluate({symbol:'SEIUSDT',price1hPct:-1,price24hPct:-3,oi4hPct:-1.2,oi12hPct:-2.7,taker1h:[.9,1.02,1.1,1.2,1.3,1.43],fundingRate:.005,rsi1h:22,rsi5m:31,sslSweep:true});
assert(seiDna.dnaTags.includes('SEI_DELEVERAGING_REVERSAL'));

const csv=V2.csvRow({symbol:'FETUSDT',priceClose:.17,price1hPct:.2,price24hPct:1,oi4hPct:4,oi8hPct:2,fundingRate:.01},a,null);
assert.equal(csv.stage_transition,'unknown');
assert.equal(csv.next_open,null);
assert.equal(csv.param_set,'v2_taker_0.8_1.2');

console.log('v2 official flow scanner PASS');

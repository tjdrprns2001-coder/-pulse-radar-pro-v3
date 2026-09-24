const assert=require('assert');
const fs=require('fs');
const V3=require('../lib/coin-scan/v3-scan-engine.js');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');

const DAY=86400000;
function k(i,{vol=10,price=100+i,closeTime=null}={}){
  const t=i*DAY,ct=closeTime==null?t+DAY-1:closeTime;
  return[t,String(price-0.2),String(price+1),String(price-1),String(price),String(vol),ct,String(vol*price),100,'0',String(vol*.55),String(vol*price*.55)];
}

assert.equal(V3.VERSION,'v3');
assert.equal(typeof V3.causalSequencePack,'function');
assert.equal(V3.PARAM_SET,'v3_longtrend_taker_0.8_1.2');
assert.deepEqual(V3.MA_PERIODS,[14,28,57,92,268,378]);

const withLive=[k(1),k(2),k(3,{closeTime:Date.now()+60000})];
assert.equal(V3.toConfirmedCandles(withLive).length,2,'현재 진행봉은 판정 데이터에서 제외되어야 한다');

const days=Array.from({length:57},(_,i)=>k(i));
assert.equal(V3.rollupFixedDaily(days,28).length,2,'28D 미완성 꼬리 구간은 제외되어야 한다');
assert.equal(V3.rollupFixedDaily(days,14).length,4,'14D 완성 고정 롤업만 사용해야 한다');

const card=(badgeKey)=>({available:true,badgeKey});
const passCards={'28d':card('UP'),'14d':card('NEUTRAL'),'1w':card('UP'),'3d':card('UP'),'1d':card('DOWN'),'4h':card('NEUTRAL')};
const pass=V3.longFilter(passCards);
assert.equal(pass.tier,'PASS');
assert.equal(pass.core.up,3);
assert.equal(pass.alignmentPct,50);

const mixedCards={'28d':card('UP'),'14d':card('UP'),'1w':card('DOWN'),'3d':card('DOWN'),'1d':card('NEUTRAL'),'4h':card('NEUTRAL')};
const mixed=V3.longFilter(mixedCards);
assert.equal(mixed.tier,'MIXED');
assert.equal(mixed.typeClassificationAllowed,false);
assert.equal(mixed.alignmentPct,33.3);

const lowCoverage=V3.longFilter({'28d':card('UP'),'1w':card('UP'),'3d':card('UP')});
assert.equal(lowCoverage.tier,'MIXED');
assert.equal(lowCoverage.lowCoverage,true);

const rvRows=Array.from({length:21},(_,i)=>k(i,{vol:i===7?1000:10}));
rvRows.push(k(21,{vol:30}));
const rv=V3.rvol(rvRows);
assert.equal(rv.value,3);
assert.equal(rv.state,'IGNITION');
assert.equal(rv.baseline,'median');

assert.equal(V3.trueTakerRatio({buyVol:120,sellVol:60,ratio:9}),2);
assert.equal(V3.takerState(.79),'WEAK');
assert.equal(V3.takerState(.8),'NEUTRAL');
assert.equal(V3.takerState(1.2),'NEUTRAL');
assert.equal(V3.takerState(1.21),'IMPROVE');
assert.equal(V3.takerState(1.5),'STRONG');

const oiValues=[100,102,104,106,110,112,114,116,120,119,118,117,115];
const oi=V3.oiPath({rows:oiValues.map((x,i)=>({timestamp:i,sumOpenInterest:x})),oi4hPct:-4.17});
assert.equal(oi.pattern,'-/+/+');
assert.equal(oi.state,'CLEAN→REBUILD');

const maRows=Array.from({length:420},(_,i)=>k(i,{price:100+i*.2,vol:20}));
const ma=V3.movingAverageStructure(maRows);
assert.equal(ma.available,true);
assert.equal(ma.bullishAligned,true);
assert.ok(Number.isFinite(ma.ribbonWidthAtr));
assert.ok(ma.divergence.priceEma14&&Object.hasOwn(ma.divergence.priceEma14,'change3Bars'));

assert.equal(V3.effectiveType({rawType:'A'},{classificationAllowed:false,precision:{enabled:false}}),'미완성');
assert.equal(V3.effectiveType({rawType:'A'},{classificationAllowed:true,precision:{enabled:true,htfDiscount:false}}),'A-pre');
assert.equal(V3.effectiveType({rawType:'A+B'},{classificationAllowed:true,precision:{enabled:true,htfDiscount:false}}),'A+B');

const causalFrames={'4h':Array.from({length:90},(_,i)=>k(i,{price:100+Math.sin(i/5)*3+i*.03,vol:20+i%5})),'1h':Array.from({length:90},(_,i)=>k(i,{price:100+Math.sin(i/4)*2+i*.02,vol:15+i%7}))};
const causalPack=V3.causalSequencePack(causalFrames);
assert.equal(causalPack.version,'CAUSAL_ICT_R0_1_JS');
assert.equal(causalPack.available,true);
assert.equal(causalPack.contractPass,true);
assert(causalPack.timeframes['4h']&&causalPack.timeframes['1h']);

const fakeV3={classificationAllowed:true,invalidation:false,longTerm:{filter:pass},oiPath:{state:'BUILD',pattern:'+/+/+'},taker:{latest:1.31,state:'IMPROVE'},rvol:{main1h:{value:1.8,state:'PRE-SPARK'},ignition15m:{value:3.4,state:'IGNITION'}},nearestPd:{kind:'FVG',dir:'up',distancePct:-.8}};
assert.equal(V3.stageFor('A-pre',fakeV3),'🟢 A-pre');
assert.equal(V3.stageFor('A',fakeV3),'🟡 A');
assert.equal(V3.stageFor('A→A+B',fakeV3),'🟠 A→A+B');
assert.equal(V3.stageFor('A+B',fakeV3),'🔴 A+B');
assert.match(V3.formatOutput({symbol:'TESTUSDT',type:'A',v3:fakeV3}),/장기정렬\(.+\).*\| A \| 🟡 A .* OI BUILD.*taker 1\.31 IMPROVE.*RVOL 1H 1\.80x PRE-SPARK.*근접PD FVG↑/);

const provider=createBinanceProvider({fetchImpl:async()=>{throw new Error('network disabled in unit test')}});
assert.equal(provider.deepRowsForInterval('1d'),1500);
assert.equal(provider.deepRowsForInterval('1h'),420);
assert.equal(provider.deepRowsForInterval('5m'),300);

const deep=fs.readFileSync(require.resolve('../lib/coin-scan/deep-scan.js'),'utf8');
assert.match(deep,/const V3=require\('\.\/v3-scan-engine\.js'\)/);
assert.match(deep,/completedRows\(klines\)/);
assert.match(deep,/V3\.formatOutput/);
const service=fs.readFileSync(require.resolve('../lib/coin-scan/scan-service.js'),'utf8');
assert.match(service,/scannerVersion:'v3'/);
assert.match(service,/v3Rank/);
assert.match(service,/longTrendTimeframes:\['28d','14d','1w','3d','1d','4h'\]/);

console.log('scanner v3 long-trend layer PASS');

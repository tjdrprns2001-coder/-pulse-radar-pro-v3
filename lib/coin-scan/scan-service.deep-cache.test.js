'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createScanService}=require('./scan-service.js');
const market=[
  {symbol:'AAAUSDT',baseAsset:'AAA',quoteAsset:'USDT',status:'TRADING',contractType:'PERPETUAL',isSpotTradingAllowed:true},
  {symbol:'BBBUSDT',baseAsset:'BBB',quoteAsset:'USDT',status:'TRADING',contractType:'PERPETUAL',isSpotTradingAllowed:true},
  {symbol:'SURGEUSDT',baseAsset:'SURGE',quoteAsset:'USDT',status:'TRADING',contractType:'PERPETUAL',isSpotTradingAllowed:true}
];
const prices=[
  {symbol:'AAAUSDT',lastPrice:'10',quoteVolume:'10000000',priceChangePercent:'1.2'},
  {symbol:'BBBUSDT',lastPrice:'12',quoteVolume:'12000000',priceChangePercent:'2.1'},
  {symbol:'SURGEUSDT',lastPrice:'50',quoteVolume:'25000000',priceChangePercent:'30'}
];
test('parallel read-only deep chunks share a fresh prepared universe and do not scan bonus surge symbols',async()=>{
  let clock=Date.UTC(2026,9,16,12,0,0),universeReads=0,tickerReads=0,deepCalls=[];
  const provider={
    async getSpotUniverse(){universeReads++;await Promise.resolve();return{symbols:market}},
    async getFuturesUniverse(){universeReads++;await Promise.resolve();return{symbols:market}},
    async getSpotTickers(){tickerReads++;await Promise.resolve();return prices},
    async getFuturesTickers(){tickerReads++;await Promise.resolve();return prices},
    async scanDeepCandidates(symbols){deepCalls.push([...symbols]);return{results:{},contexts:{},errors:[]}}
  };
  const service=createScanService({provider,now:()=>clock});
  const options={mode:'deep',validation:'off',persistObservations:false,limit:1};
  const [a,b]=await Promise.all([
    service.run({...options,symbols:['AAAUSDT']}),
    service.run({...options,symbols:['BBBUSDT']})
  ]);
  assert.equal(a.status,'ok');
  assert.equal(b.status,'ok');
  assert.equal(a.scanCount,3);
  assert.equal(universeReads,2,'coalesced dual-market universe should load only once');
  assert.equal(tickerReads,2,'coalesced dual-market ticker should load only once');
  assert.equal(deepCalls.length,2,'only requested deep symbols may be read in UI path');
  assert.deepEqual(deepCalls.map(x=>x[0]).sort(),['AAAUSDT','BBBUSDT']);
  assert(a.scanPerformance?.marketPreparation&&b.scanPerformance?.marketPreparation);
  assert([a.scanPerformance.marketPreparation.cacheHit,b.scanPerformance.marketPreparation.cacheHit].includes(true));
  assert(a.autoSampleLearning?.surgeSampler?.requested===0,'UI chunks must skip unrelated high-growth sample rescans');
  assert.equal(a.scanPerformance.marketPreparation.ageMs,0);
  clock+=10000;
  const c=await service.run({...options,symbols:['AAAUSDT']});
  assert.equal(c.scanPerformance.marketPreparation.cacheHit,true);
  assert.equal(universeReads,2,'snapshot fresh within 20s must be reusable');
  clock+=21000;
  const d=await service.run({...options,symbols:['AAAUSDT']});
  assert.equal(d.scanPerformance.marketPreparation.cacheHit,false,'snapshot must not silently outlive TTL');
  assert.equal(universeReads,4);
  const e=await service.run({mode:'summary',limit:3,persistObservations:false});
  assert.equal(e.status,'ok');
  assert.equal(universeReads,6,'summary must continue to fetch a fresh whole-market snapshot');
  assert(!e.candidateSymbols.includes('SURGEUSDT'),'extended asset must remain excluded from auto deep candidates');
});

test('incomplete venue coverage is never reused as a healthy deep-scan cache snapshot',async()=>{
  let tick=Date.UTC(2026,9,17,9,0,0),spotUp=false,spotCalls=0,futuresCalls=0;
  const provider={
    async getSpotUniverse(){spotCalls++;if(!spotUp)throw new Error('spot unavailable');return {symbols:market}},
    async getSpotTickers(){return prices},
    async getFuturesUniverse(){futuresCalls++;return {symbols:market}},
    async getFuturesTickers(){return prices},
    async scanDeepCandidates(){return{results:{},contexts:{},errors:[]}}
  };
  const scan=createScanService({provider,now:()=>tick});
  const opts={mode:'deep',symbols:['AAAUSDT'],limit:1,validation:'off',persistObservations:false};
  const first=await scan.run(opts);
  assert.equal(first.marketCoverage.spot,0);
  assert.equal(first.scanPerformance.marketPreparation.cacheHit,false);
  // A brief burst can share a degraded snapshot, but it must be labelled as such.
  assert.equal(first.scanPerformance.marketPreparation.sourceComplete,false);
  spotUp=true;
  const burst=await scan.run(opts);
  assert.equal(burst.scanPerformance.marketPreparation.cacheHit,true);
  assert.equal(burst.scanPerformance.marketPreparation.sourceComplete,false);
  tick+=2001; // beyond the 2-second degraded-data throttle
  const next=await scan.run(opts);
  assert(next.marketCoverage.spot>0,'spot source recovery must be visible without waiting for TTL');
  assert.equal(next.scanPerformance.marketPreparation.cacheHit,false);
  assert.equal(next.scanPerformance.marketPreparation.sourceComplete,true);
  assert.equal(spotCalls,2);
  assert.equal(futuresCalls,2);
});

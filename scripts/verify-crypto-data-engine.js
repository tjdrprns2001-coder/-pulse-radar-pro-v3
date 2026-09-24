'use strict';
const assert=require('assert');
const {normalizeExchangeInfo,executionCostModel,createCryptoResearchDataEngine}=require('../lib/research-backtest-v2/crypto-data-engine.js');
const {createUniverseSnapshot,eligibleSymbolsAt}=require('../lib/research-backtest-v2/universe.js');

(async()=>{
  const spotInfo={symbols:[
    {symbol:'AAAUSDT',baseAsset:'AAA',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true,listedAt:1000},
    {symbol:'BBBUSD',baseAsset:'BBB',quoteAsset:'USD',status:'TRADING',isSpotTradingAllowed:true},
    {symbol:'CCCUSDT',baseAsset:'CCC',quoteAsset:'USDT',status:'BREAK',isSpotTradingAllowed:true}
  ]};
  const normalized=normalizeExchangeInfo(spotInfo,{marketType:'spot'});
  assert.deepEqual(normalized.map(x=>x.symbol),['AAAUSDT']);
  assert.equal(normalized[0].marketType,'spot');

  const snap=createUniverseSnapshot({
    exchangeInfo:{symbols:normalized},version:'u1',mode:'point-in-time',observedAt:5000,
    source:'fixture',exchange:'BINANCE',marketType:'spot',quoteAsset:'USDT',lineageComplete:true
  });
  assert.equal(snap.survivorshipSafe,true);
  assert.equal(snap.exchange,'BINANCE');
  assert.deepEqual(eligibleSymbolsAt(snap,1500),['AAAUSDT']);

  const cost=executionCostModel({marketType:'perpetual',notional:1000,feeBps:5,spreadBps:2,slippageBps:3,fundingRatePct:.01});
  assert(cost.roundTripPct>0);
  assert(cost.roundTripCost>0);
  assert.equal(cost.assumptions.fundingRatePct,.01);

  const calls=[];
  const fetchImpl=async url=>{
    calls.push(url);const u=new URL(url);
    if(u.host.startsWith('fapi'))return{ok:false,status:451,json:async()=>({})};
    if(u.pathname==='/api/v3/exchangeInfo')return{ok:true,status:200,json:async()=>spotInfo};
    if(u.pathname.includes('/klines'))return{ok:true,status:200,json:async()=>[]};
    return{ok:false,status:404,json:async()=>({})};
  };
  const eng=createCryptoResearchDataEngine({
    fetchImpl,now:()=>9999,marketType:'perpetual',
    spotBases:['https://spot.test'],futuresBases:['https://fapi.test']
  });
  const uni=await eng.getUniverse();
  assert.equal(uni.symbols[0].symbol,'AAAUSDT');
  const prov=eng.provenance();
  assert.equal(prov.engineVersion,'CRYPTO_RESEARCH_DATA_v1');
  assert.equal(prov.session,'24x7');
  assert.equal(prov.sessionAnchor,'UTC 00:00');
  assert.equal(prov.universe.fallback,true);
  assert.equal(prov.universe.marketType,'spot-fallback');
  assert.equal(eng.lineagePolicy.unknown,'FLAG_AND_EXCLUDE_FROM_POINT_IN_TIME_TEST');
  assert.equal(eng.sessionPolicy.continuous,true);
  console.log('crypto research data engine PASS');
})().catch(e=>{console.error(e);process.exit(1)});

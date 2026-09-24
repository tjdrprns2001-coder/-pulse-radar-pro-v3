'use strict';
const assert=require('assert');
const {createTtlCache}=require('../lib/coin-scan/cache.js');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');

function candles(limit=500){
  const out=[];let p=10,ts=1700000000000;
  for(let i=0;i<limit;i++){
    const drift=Math.sin(i/17)*0.03+0.01;
    const o=p,c=Math.max(.1,o+drift),h=Math.max(o,c)+.08,l=Math.min(o,c)-.08,v=1_000_000+(i%20)*50_000;
    out.push([ts+i*300000,String(o),String(h),String(l),String(c),String(v),ts+(i+1)*300000-1,String(v*c),100,String(v*.55),String(v*c*.55),'0']);
    p=c;
  }
  return out;
}

(async()=>{
  let now=1790265000000;
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(url);
    const u=new URL(url);
    if(u.host.startsWith('fapi-'))return{ok:false,status:451,json:async()=>({code:0})};
    if(u.host!=='spot.test')return{ok:false,status:404,json:async()=>({})};
    if(u.pathname.endsWith('/exchangeInfo'))return{ok:true,status:200,json:async()=>({symbols:[
      {symbol:'ETHUSDT',baseAsset:'ETH',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}
    ]})};
    if(u.pathname.endsWith('/ticker/24hr'))return{ok:true,status:200,json:async()=>[
      {symbol:'ETHUSDT',lastPrice:'10.5',quoteVolume:'250000000',priceChangePercent:'1.2'}
    ]};
    if(u.pathname.endsWith('/klines'))return{ok:true,status:200,json:async()=>candles(Number(u.searchParams.get('limit'))||500)};
    return{ok:false,status:404,json:async()=>({})};
  };
  const crossOiProvider={getProfile:async()=>({
    available:true,breadth:2,positiveBreadth:2,strongBreadth:1,leaderExchange:'bybit',
    leaderChangePct:2.8,aggregateChangePct:1.9,samples:64,
    exchanges:{bybit:{available:true,changePct:2.8,samples:32},okx:{available:true,changePct:1.0,samples:32}}
  })};
  const provider=createBinanceProvider({
    fetchImpl,now:()=>now,cache:createTtlCache({now:()=>now}),
    bases:['https://spot.test'],
    futuresBases:['https://fapi-a.test','https://fapi-b.test'],
    crossOiProvider
  });

  const universe=await provider.getUniverse();
  assert.equal(universe.symbols[0].symbol,'ETHUSDT','spot exchangeInfo should rescue universe');
  const tickers=await provider.getTickers();
  assert.equal(tickers[0].symbol,'ETHUSDT','spot ticker should rescue market breadth');
  const klines=await provider.getKlines('ETHUSDT','4h',420);
  assert.equal(klines.length,420,'spot klines should rescue deep frames');
  const state=provider.getSourceState();
  assert.equal(state.marketSource,'spot-fallback');
  assert(state.lastFuturesError&&state.lastFuturesError.includes('451'),'451 provenance must be retained');

  const fapiBefore=calls.filter(x=>x.includes('fapi-')).length;
  await provider.getKlines('ETHUSDT','1h',420);
  const fapiAfter=calls.filter(x=>x.includes('fapi-')).length;
  assert.equal(fapiAfter,fapiBefore,'451 circuit breaker should prevent repeated futures retries');

  const ctx=await provider.getDerivativesContext('ETHUSDT');
  assert.equal(ctx.fundingPct,null,'blocked Binance funding must remain N/A');
  assert.equal(ctx.oiChangePct,null,'blocked Binance OI must remain N/A');
  assert.equal(ctx.derivativesProfile.takerProfile.samples,0,'blocked Binance taker must remain empty');
  assert.equal(ctx.derivativesProfile.xoiProfile.available,true,'cross-exchange OI should remain available');
  assert.equal(ctx.derivativesProfile.xoiProfile.leaderExchange,'bybit');

  provider.resetSourceState();
  const service=createScanService({provider,now:()=>now});
  const summary=await service.run({mode:'summary',limit:10});
  assert.equal(summary.status,'ok');
  assert.equal(summary.marketSource,'spot-only');
  assert.equal(summary.universe,'Binance USDT 현물+무기한 통합');
  assert.equal(summary.partial,true);
  assert(summary.sourceWarning&&summary.sourceWarning.includes('Futures 데이터가 없어 현물'));

  const deep=await service.run({mode:'deep',symbols:['ETHUSDT'],limit:5,precision:true});
  assert.equal(deep.status,'ok','deep scan must survive Futures 451');
  assert.equal(deep.marketSource,'spot-only');
  assert.equal(deep.items.length,1);
  assert.notEqual(deep.items[0].dataState,'failed','spot frames should keep deep item usable');
  assert(deep.items[0].samplePattern,'deep analysis should still run on spot frames');
  assert(deep.items[0].xoiProfile&&deep.items[0].xoiProfile.available,'deep result should preserve XOI');
  console.log('coin scan 451 spot fallback PASS');
})().catch(e=>{console.error(e);process.exit(1)});

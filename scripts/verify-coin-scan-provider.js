const assert=require('assert');
const {createTtlCache}=require('../lib/coin-scan/cache.js');
const {DEFAULT_BASES,createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');

assert.equal(DEFAULT_BASES[0],'https://data-api.binance.vision','public market-data-only host should be preferred for serverless deployments');

(async()=>{
  let now=1000;
  const cache=createTtlCache({now:()=>now});
  cache.set('x',123,100);
  assert.equal(cache.get('x'),123);
  now=1200;
  assert.equal(cache.get('x'),null);

  const calls=[];
  let active=0,maxActive=0;
  const fetchImpl=async url=>{
    calls.push(url);active++;maxActive=Math.max(maxActive,active);
    await new Promise(r=>setTimeout(r,2));
    active--;
    const u=new URL(url);
    if(u.pathname.endsWith('/exchangeInfo'))return{ok:true,json:async()=>({symbols:[{symbol:'XLMUSDT',baseAsset:'XLM',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}]})};
    if(u.pathname.endsWith('/ticker/24hr'))return{ok:true,json:async()=>[{symbol:'XLMUSDT',lastPrice:'1',quoteVolume:'1000',priceChangePercent:'2'}]};
    if(u.pathname.endsWith('/premiumIndex'))return{ok:true,json:async()=>[{symbol:'XLMUSDT',lastFundingRate:'0.0001'}]};
    if(u.pathname.endsWith('/openInterestHist'))return{ok:true,json:async()=>[{sumOpenInterest:'100'},{sumOpenInterest:'103'}]};
    if(u.pathname.endsWith('/klines')){
      if(u.searchParams.get('symbol')==='BADUSDT')return{ok:false,status:502,json:async()=>({})};
      return{ok:true,json:async()=>[[0,'1','1','1','1','10',1,'10',1,'5','5',0]]};
    }
    return{ok:false,status:404,json:async()=>({})};
  };
  const crossOiProvider={getProfile:async()=>({available:true,breadth:1,positiveBreadth:1,strongBreadth:1,leaderExchange:'bybit',leaderChangePct:3.5,aggregateChangePct:3.5,samples:32,exchanges:{bybit:{available:true,changePct:3.5,samples:32}}})};
  const p=createBinanceProvider({fetchImpl,now:()=>now,concurrency:2,cache:createTtlCache({now:()=>now}),bases:['https://api.binance.test'],futuresBase:'https://fapi.binance.test',crossOiProvider});
  const a=await p.getUniverse();
  const b=await p.getUniverse();
  assert.equal(a.symbols.length,1);
  assert.equal(calls.filter(x=>x.includes('exchangeInfo')).length,1,'exchangeInfo should cache');
  const ticks=await p.getTickers();assert.equal(ticks.length,1);
  const k=await p.getKlines('XLMUSDT','1h',120);assert.equal(k.length,1);
  const ctx=await p.getDerivativesContext('XLMUSDT');
  assert(Math.abs(ctx.fundingPct-.01)<1e-12,'funding percent should be preserved');
  assert(Math.abs(ctx.oiChangePct-3)<1e-9,'OI percent should be approximately 3%');
  assert.equal(ctx.derivativesProfile.xoiProfile.leaderExchange,'bybit','cross-exchange OI should be preserved');
  assert.equal(ctx.derivativesProfile.xoiProfile.positiveBreadth,1);
  const batch=await p.scanDeepCandidates(['XLMUSDT','BADUSDT'],['1h','15m']);
  assert(batch.results.XLMUSDT,'successful symbol preserved');
  assert(batch.contexts.XLMUSDT&&Math.abs(batch.contexts.XLMUSDT.oiChangePct-3)<1e-9,'optional derivatives context preserved');
  assert(batch.errors.length>=1,'failed symbol recorded');
  await p.mapLimit([1,2,3,4],async x=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,2));active--;return x});
  assert(maxActive<=2,'concurrency must be bounded');
  console.log('coin scan provider PASS');
})().catch(e=>{console.error(e);process.exit(1)});

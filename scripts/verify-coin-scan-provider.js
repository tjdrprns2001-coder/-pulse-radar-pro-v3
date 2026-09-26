const assert=require('assert');
const {createTtlCache}=require('../lib/coin-scan/cache.js');
const {DEFAULT_BASES,DEFAULT_FUTURES_BASES,createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');

assert.equal(DEFAULT_BASES[0],'https://data-api.binance.vision','public market-data-only host should be preferred for serverless deployments');
assert.equal(DEFAULT_FUTURES_BASES[0],'https://fapi.binance.com','primary futures host should remain canonical');
assert(DEFAULT_FUTURES_BASES.length>=3,'official futures host fallback list should be present');

(async()=>{
  let now=1000;
  const cache=createTtlCache({now:()=>now});
  cache.set('x',123,100);
  assert.equal(cache.get('x'),123);
  now=1200;
  assert.equal(cache.get('x'),null);

  const calls=[];
  let active=0,maxActive=0;const klineActive=new Map(),klineMax=new Map();
  const fetchImpl=async url=>{
    calls.push(url);active++;maxActive=Math.max(maxActive,active);
    await new Promise(r=>setTimeout(r,2));
    active--;
    const u=new URL(url);
    if(u.pathname.endsWith('/exchangeInfo'))return{ok:true,json:async()=>({symbols:[{symbol:'XLMUSDT',baseAsset:'XLM',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}]})};
    if(u.pathname.endsWith('/ticker/24hr'))return{ok:true,json:async()=>[{symbol:'XLMUSDT',lastPrice:'1',quoteVolume:'1000',priceChangePercent:'2'}]};
    if(u.pathname.endsWith('/premiumIndex'))return{ok:true,json:async()=>[{symbol:'XLMUSDT',lastFundingRate:'0.0001'}]};
    if(u.pathname.endsWith('/openInterestHist'))return{ok:true,json:async()=>Array.from({length:97},(_,i)=>({sumOpenInterest:String(i===96?103:100),timestamp:i}))};
    if(u.pathname.endsWith('/takerlongshortRatio'))return{ok:true,json:async()=>Array.from({length:32},(_,i)=>({timestamp:i,buyVol:String(120+i),sellVol:'100',buySellRatio:String((120+i)/100)}))};
    if(u.pathname.endsWith('/klines')){
      const sym=u.searchParams.get('symbol')||'UNKNOWN',n=(klineActive.get(sym)||0)+1;klineActive.set(sym,n);klineMax.set(sym,Math.max(klineMax.get(sym)||0,n));
      await new Promise(r=>setTimeout(r,3));klineActive.set(sym,Math.max(0,(klineActive.get(sym)||1)-1));
      if(sym==='BADUSDT')return{ok:false,status:502,json:async()=>({})};
      return{ok:true,json:async()=>[[0,'1','1','1','1','10',1,'10',1,'5','5',0]]};
    }
    return{ok:false,status:404,json:async()=>({})};
  };
  const crossOiProvider={getProfile:async()=>({available:true,breadth:1,positiveBreadth:1,strongBreadth:1,leaderExchange:'bybit',leaderChangePct:3.5,aggregateChangePct:3.5,samples:32,exchanges:{bybit:{available:true,changePct:3.5,samples:32}}})};
  const fallbackCalls=[];
  const fallbackFetch=async url=>{fallbackCalls.push(url);const u=new URL(url);if(u.host==='fapi-a.test')return{ok:false,status:451,json:async()=>({})};if(u.pathname.endsWith('/exchangeInfo'))return{ok:true,json:async()=>({symbols:[]})};return{ok:true,json:async()=>([])};};
  const fallbackProvider=createBinanceProvider({fetchImpl:fallbackFetch,cache:createTtlCache({now:()=>now}),futuresBases:['https://fapi-a.test','https://fapi-b.test'],crossOiProvider:{getProfile:async()=>({})}});
  await fallbackProvider.getUniverse();
  assert(fallbackCalls[0].startsWith('https://fapi-a.test'),'first futures base should be tried first');
  assert(fallbackCalls[1].startsWith('https://fapi-b.test'),'451 should fall through to next futures base');

  const p=createBinanceProvider({fetchImpl,now:()=>now,concurrency:2,cache:createTtlCache({now:()=>now}),bases:['https://api.binance.test'],futuresBase:'https://fapi.binance.test',crossOiProvider});
  const a=await p.getUniverse();
  const b=await p.getUniverse();
  assert.equal(a.symbols.length,1);
  assert.equal(calls.filter(x=>x.includes('exchangeInfo')).length,1,'exchangeInfo should cache');
  const ticks=await p.getTickers();assert.equal(ticks.length,1);
  const k=await p.getKlines('XLMUSDT','1h',120);assert.equal(k.length,1);
  assert.equal(typeof p.scanLightCandidates,'function','light prescan provider required');
  assert(p.klineTtl('1w')>p.klineTtl('1h'),'completed slow timeframes should cache longer than 1h');
  assert(p.klineTtl('1d')>=600000,'daily deep frames should reuse cache across short repeated scans');
  const light=await p.scanLightCandidates(['XLMUSDT'],['4h','1h'],150);assert(light.results.XLMUSDT&&light.results.XLMUSDT['4h']&&light.results.XLMUSDT['1h'],'light prescan must return 4H/1H frames');
  assert(calls.some(x=>x.includes('/klines')&&x.includes('limit=150')),'light prescan must use bounded 150-bar requests');
  const taker15Before=calls.filter(x=>x.includes('/takerlongshortRatio')&&x.includes('period=15m')).length;
  const oiBefore=calls.filter(x=>x.includes('/openInterestHist')).length;
  const ctx=await p.getDerivativesContext('XLMUSDT');
  const taker15After=calls.filter(x=>x.includes('/takerlongshortRatio')&&x.includes('period=15m')).length;
  const oiAfter=calls.filter(x=>x.includes('/openInterestHist')).length;
  assert.equal(taker15After-taker15Before,1,'legacy and v2 15m taker profiles should share one upstream request');
  assert.equal(oiAfter-oiBefore,1,'legacy OI change/profile should reuse the v2 1h OI request');
  assert(Math.abs(ctx.fundingPct-.01)<1e-12,'funding percent should be preserved');
  assert(Math.abs(ctx.oiChangePct-3)<1e-9,'OI percent should be approximately 3%');
  assert.equal(ctx.derivativesProfile.xoiProfile.leaderExchange,'bybit','cross-exchange OI should be preserved');
  assert.equal(ctx.derivativesProfile.xoiProfile.positiveBreadth,1);
  assert.equal(ctx.v2Profile.sourcePeriod,'15m','deduplicated OI source period must remain explicit');
  assert.equal(ctx.v2Profile.raw15mRows.length,97,'single upstream OI series must retain 15m raw coverage');
  assert.equal(ctx.v2Profile.rows.length,25,'v2 rows must remain on 1H cadence for V3 OI-path segment semantics');
  assert.equal(ctx.derivativesProfile.oiProfile.samples,32,'legacy OI profile must preserve its ~8H 15m sampling window');
  assert(ctx.derivativesProfile.takerProfile.samples>0,'legacy taker profile must reuse v2 15m rows');
  const coalesceBefore=calls.filter(x=>x.includes('/klines')&&x.includes('symbol=COALUSDT')&&x.includes('interval=4h')).length;
  await Promise.all([p.getKlines('COALUSDT','4h',120),p.getKlines('COALUSDT','4h',120),p.getKlines('COALUSDT','4h',120)]);
  const coalesceAfter=calls.filter(x=>x.includes('/klines')&&x.includes('symbol=COALUSDT')&&x.includes('interval=4h')).length;
  assert.equal(coalesceAfter-coalesceBefore,1,'identical concurrent kline requests must coalesce');
  const batch=await p.scanDeepCandidates(['XLMUSDT','BADUSDT'],['1h','15m']);
  assert(batch.results.XLMUSDT,'successful symbol preserved');
  assert.equal(p.intervalConcurrency,2,'deep interval concurrency default must remain bounded at two');
  assert((klineMax.get('XLMUSDT')||0)>=2,'deep timeframe klines should fetch in parallel');
  assert((klineMax.get('XLMUSDT')||0)<=2,'per-symbol timeframe concurrency must stay bounded');
  await p.scanDeepCandidates(['XLMUSDT'],['5m']);
  assert(calls.some(x=>x.includes('/klines')&&x.includes('interval=5m')&&x.includes('limit=300')),'5m deep scan must preserve 24H RVOL memory coverage');
  assert(batch.contexts.XLMUSDT&&Math.abs(batch.contexts.XLMUSDT.oiChangePct-3)<1e-9,'optional derivatives context preserved');
  assert(batch.errors.length>=1,'failed symbol recorded');
  active=0;maxActive=0; // measure mapLimit itself, not parallel derivative/XOI fetches above
  await p.mapLimit([1,2,3,4],async x=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,2));active--;return x});
  assert(maxActive<=2,'concurrency must be bounded');
  console.log('coin scan provider PASS');
})().catch(e=>{console.error(e);process.exit(1)});

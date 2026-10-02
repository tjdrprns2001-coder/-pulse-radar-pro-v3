'use strict';
const assert=require('assert'),fs=require('fs');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const handler=require('../api/astra-scan.js');
(async()=>{
  const stamp=1700000000000;
  const cases=[
    {status:418,header:'7200',body:{},delay:7200000},
    {status:429,header:new Date(stamp+120000).toUTCString(),body:{},delay:120000},
    {status:418,header:'60',body:{msg:'IP banned until '+(stamp+10800000)},delay:10800000},
    {status:418,header:null,body:{},delay:900000},
    {status:429,header:'invalid',body:{},delay:60000}
  ];
  for(const c of cases){
    let at=stamp,calls=0,banned=true;
    const provider=createBinanceProvider({now:()=>at,disableFuturesFallback:true,
      futuresBases:['https://one.test','https://two.test'],
      fetchImpl:async()=>{calls++;return banned?{ok:false,status:c.status,headers:{get:()=>c.header},json:async()=>c.body}:{ok:true,json:async()=>({symbols:[]})}}});
    const first=await provider.getFuturesUniverse().catch(e=>e);
    assert(first instanceof Error);
    assert.equal(first.retryAt,stamp+c.delay);
    assert.equal(provider.getSourceState().futuresBlockedUntil,stamp+c.delay);
    assert.equal(calls,1,'ban must stop official-host failover');
    await provider.getFuturesTickers().catch(()=>null);
    await provider.getFuturesKlines('BTCUSDT','15m').catch(()=>null);
    assert.equal(calls,1,'uncached endpoints must pause until deadline');
    at=stamp+c.delay-1;await provider.getFuturesUniverse().catch(()=>null);
    assert.equal(calls,1);
    at++;banned=false;
    assert.deepEqual(await provider.getFuturesUniverse(),{symbols:[]});
    assert.equal(calls,2,'resume only at server deadline');
    assert.equal(provider.getSourceState().futuresBlockedUntil,null);
  }
  let release;const pending=new Promise(resolve=>{release=resolve});
  const raceProvider=createBinanceProvider({now:()=>stamp,disableFuturesFallback:true,futuresBases:['https://race.test'],fetchImpl:async url=>{
    if(url.includes('exchangeInfo')){await pending;return{ok:true,json:async()=>({symbols:[]})}}
    return{ok:false,status:418,headers:{get:()=> '7200'},json:async()=>({})};
  }});
  const lateSuccess=raceProvider.getFuturesUniverse();
  await raceProvider.getFuturesTickers().catch(()=>null);release();await lateSuccess;
  assert.equal(raceProvider.getSourceState().futuresBlockedUntil,stamp+7200000,'late successful in-flight request must not clear a ban');
  const retryAt=Date.now()+600000,headers={},response={setHeader:(k,v)=>{headers[k]=v},status:function(v){this.statusCode=v;return this},json:function(v){this.body=v;return this}};
  await handler({query:{stage:'universe'}},response,{scanner:{
    universe:async()=>{const e=new Error('Futures HTTP 418');e.retryAt=retryAt;e.upstreamStatus=418;throw e},
    getSourceState:()=>({futuresBlockedUntil:retryAt,futuresFallbackUsed:false})}});
  assert.equal(response.statusCode,503);
  assert.equal(response.body.retryAt,retryAt);
  assert.equal(response.body.upstreamStatus,418);
  assert(Number(headers['Retry-After'])>=599);
  const ui=fs.readFileSync('ui/astra-scan.js','utf8');
  const begin=ui.indexOf('function cooldownError(x)');
  const endMarker="throw last||new Error('scanner api unavailable')}";
  const end=ui.indexOf(endMarker,begin)+endMarker.length;
  assert(begin>=0&&end>begin);
  let browserCalls=0;
  const get=new Function('state','location','fetch',ui.slice(begin,end)+';return get;')(
    {method:'astra',controller:new AbortController()},
    {hostname:'pulse-radar-pro-v3.vercel.app'},
    async()=>{browserCalls++;return{ok:false,status:503,json:async()=>({status:'error',retryAt})}});
  const error=await get('universe').catch(e=>e);
  assert.equal(error.retryAt,retryAt);
  assert.equal(browserCalls,2,'browser may try one alternate scanner endpoint after a retryable upstream ban');
  assert(ui.includes("if(state.retryAt>Date.now())"));
  assert(ui.includes("$('astraRun').disabled=state.retryAt>Date.now()"));
  const runtime=fs.readFileSync('workers/selector-runtime.mjs','utf8');
  assert(runtime.includes("res.setHeader('Retry-After'"));
  assert(runtime.includes('retryAt,upstreamStatus:e?.upstreamStatus||null,sourceState'));
  console.log('Binance cooldown, API retry metadata and browser failover verification passed');
})().catch(e=>{console.error(e);process.exit(1)});

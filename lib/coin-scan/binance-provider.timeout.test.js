'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBinanceProvider}=require('./binance-provider.js');

test('Binance futures and spot requests abort a stalled upstream host instead of blocking scan batches',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts={})=>{
    calls.push({url,hasSignal:Boolean(opts?.signal)});
    assert(opts?.signal,'all direct Binance requests must have abort signals');
    return new Promise((_resolve,reject)=>{
      if(opts.signal.aborted)return reject(Object.assign(new Error('timed out'),{name:'AbortError'}));
      opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error('timed out'),{name:'AbortError'})),{once:true});
    });
  };
  const p=createBinanceProvider({
    fetchImpl,env:{BINANCE_REST_TIMEOUT_MS:2000},futuresBases:['https://fapi.deadline.test'],
    bases:['https://spot.deadline.test'],disableFuturesFallback:true,concurrency:2,intervalConcurrency:2
  });
  const start=Date.now();
  const results=await Promise.allSettled([p.getStrictFuturesUniverse(),p.getSpotUniverse()]);
  assert(results.every(x=>x.status==='rejected'),'both market-source requests must terminate');
  assert.equal(calls.length,2);
  assert(calls.every(x=>x.hasSignal));
  assert(Date.now()-start<5500,'stalled source calls should terminate well before 55s UI deadline');
});

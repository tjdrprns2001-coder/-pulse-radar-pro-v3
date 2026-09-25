'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
assert(fs.existsSync(require('node:path').join(__dirname,'../lib/coin-scan/trader-service.js')),'trader service must exist');
const {createTraderService}=require('../lib/coin-scan/trader-service.js');
const {bars,fixture,NOW}=require('./verify-trader-scan.js');
const symbols=['TESTUSDT','LATEUSDT','THINUSDT','BTCUSDT','ETHUSDT'];
const provider={
  getFuturesUniverse:async()=>({symbols:symbols.map(symbol=>({symbol,status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT'}))}),
  getFuturesTickers:async()=>symbols.map(symbol=>({...fixture().ticker,symbol,priceChangePercent:symbol==='LATEUSDT'?22:2,quoteVolume:symbol==='THINUSDT'?100:40000000})),
  getFuturesKlines:async(symbol,tf)=>{if(symbol==='TESTUSDT')return fixture().frames[tf];return bars(tf)},
  getV2DerivativesProfile:async()=>fixture().derivatives,
  getFundingInfoMap:async()=>new Map(),
  getFuturesExecution:async()=>fixture().execution
};
(async()=>{
  const service=createTraderService({provider,now:()=>NOW});
  const summary=await service.summary();
  assert.equal(summary.universeCount,5);
  assert.deepEqual(summary.candidates.map(x=>x.symbol),['TESTUSDT']);
  assert.equal(summary.regime.state,'SUPPORTIVE');
  assert.equal(summary.excludedCount,4);
  const light=await service.light(['TESTUSDT']);assert.equal(light.items[0].symbol,'TESTUSDT');assert(light.items[0].eligible);
  const deep=await service.deep('TESTUSDT');assert.equal(deep.item.state,'CONFIRMED');
  await assert.rejects(()=>service.deep('NOTLISTEDUSDT'),/universe/);
  await assert.rejects(()=>service.light(['TESTUSDT','BTCUSDT','ETHUSDT','LATEUSDT','THINUSDT']),/four/);
  const late=await service.deep('LATEUSDT');assert.equal(late.item.state,'EXCLUDED');
  const failed=createTraderService({provider:{...provider,getFuturesUniverse:async()=>{throw new Error('upstream unavailable')}},now:()=>NOW});
  await assert.rejects(()=>failed.summary(),/upstream/,'never fabricate a futures universe');
  const partial=createTraderService({provider:{...provider,getFuturesKlines:async(s,tf)=>{if(tf==='5m')throw new Error('outage');return provider.getFuturesKlines(s,tf)}},now:()=>NOW});
  assert.equal((await partial.deep('TESTUSDT')).item.state,'DATA_GAP');
  const noFunding=createTraderService({provider:{...provider,getFundingInfoMap:async()=>{throw new Error('outage')}},now:()=>NOW});
  assert.equal((await noFunding.deep('TESTUSDT')).item.state,'DATA_GAP');
  const handler=require('../api/coin-scan.js');
  async function call(query){let code=200,body;const headers={};await handler({query},{setHeader:(k,v)=>headers[k]=v,status(n){code=n;return this},json(v){body=v;return v}},{traderService:service,service:{run:async()=>({legacy:true})}});return{code,body,headers}}
  const api=await call({mode:'trader-deep',symbol:'TESTUSDT'});
  assert.equal(api.body.item?.state,'CONFIRMED','trader route must use independent engine');
  assert.equal(api.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal((await call({mode:'trader-deep',symbol:'BOGUSUSDT'})).code,400);
  assert.equal((await call({mode:'summary'})).body.legacy,true,'legacy endpoint unchanged');
  console.log('trader service: universe, futures-only errors, partial-data and batching PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

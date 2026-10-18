'use strict';
const assert=require('node:assert/strict');
const handler=require('../api/astra-scan.js');
async function call(symbols){
  const result={statusCode:200,headers:{}};
  const res={setHeader(k,v){result.headers[k]=v;return this},status(n){result.statusCode=n;return this},json(v){result.body=v;return this}};
  const scanner={async oi(list){return {status:'ok',items:list,requested:list.length}},getSourceState(){return null}};
  await handler({query:{stage:'oi',symbols}},res,{scanner});
  return result;
}
(async()=>{
  const normalized=await call(' btcusdt ,BTCUSDT, ethusdt ');
  assert.equal(normalized.statusCode,200);
  assert.deepEqual(normalized.body.items,['BTCUSDT','ETHUSDT']);
  const malformed=await call('BTCUSDT,ETH/USDT');
  assert.equal(malformed.statusCode,400);
  const oversized=await call(Array.from({length:201},(_,i)=>'COIN'+i+'USDT').join(','));
  assert.equal(oversized.statusCode,400);
  console.log('Astra symbol input guard passed');
})().catch(e=>{console.error(e);process.exitCode=1});

import {test} from 'node:test';import assert from 'node:assert/strict';import server from '../src/server.js';
test('market requests work when default Cache API is forbidden',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'caches'),oldFetch=globalThis.fetch;let calls=0;
 Object.defineProperty(globalThis,'caches',{configurable:true,get(){throw Error('This Worker is not permitted to access the default cache.');}});
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({symbols:[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}]}));};
 try{const r=await server.fetch(new Request('https://example.test/api/markets?exchange=binance'),{},{});assert.equal(r.status,200);assert.equal((await r.json()).data[0].id,'BTCUSDT');assert.equal(calls,1);const cached=await server.fetch(new Request('https://example.test/api/markets?exchange=binance'),{},{});assert.equal(cached.status,200);assert.equal(calls,1);}finally{globalThis.fetch=oldFetch;if(prior)Object.defineProperty(globalThis,'caches',prior);else delete globalThis.caches;}
});

test('invalid markets, intervals, symbols and contract routes fail before upstream fetch',async()=>{const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected fetch');};try{for(const query of ['exchange=upbit&type=perpetual&symbol=KRW-BTC&frame=1h','exchange=okx&symbol=BTC-USDT&frame=17m','exchange=okx&symbol=%3Cscript%3E&frame=1h','exchange=binance&type=perpetual&symbol=BTCUSDT&frame=1h&route=evil']){const r=await server.fetch(new Request('https://example.test/api/candles?'+query),{},{});assert.equal(r.status,400);}assert.equal(calls,0);}finally{globalThis.fetch=old;}});

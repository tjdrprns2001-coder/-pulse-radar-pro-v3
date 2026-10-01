'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createBinanceProvider}=require('./binance-provider.js');

function response(status,body){
  return {
    ok:status>=200&&status<300,
    status,
    async json(){return body}
  };
}

test('Astra provider falls back to Bybit universe, tickers, klines and OI during Binance 418',async()=>{
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(String(url));
    if(String(url).includes('binance.com')) return response(418,{msg:'IP banned until 4102444800000'});
    if(String(url).includes('/v5/market/instruments-info')) return response(200,{retCode:0,result:{list:[
      {symbol:'BTCUSDT',quoteCoin:'USDT',status:'Trading',contractType:'LinearPerpetual',baseCoin:'BTC'}
    ]}});
    if(String(url).includes('/v5/market/tickers')) return response(200,{retCode:0,result:{list:[
      {symbol:'BTCUSDT',lastPrice:'100',price24hPcnt:'0.01',turnover24h:'1000000',fundingRate:'0.0001'}
    ]}});
    if(String(url).includes('/v5/market/kline')) return response(200,{retCode:0,result:{list:[
      ['1000','100','101','99','100.5','10','1000'],
      ['2000','100.5','102','100','101.5','12','1200']
    ]}});
    if(String(url).includes('/v5/market/open-interest')) return response(200,{retCode:0,result:{list:[
      {timestamp:'1000',openInterest:'100'},
      {timestamp:'2000',openInterest:'101'},
      {timestamp:'3000',openInterest:'102'},
      {timestamp:'4000',openInterest:'103'},
      {timestamp:'5000',openInterest:'104'}
    ]}});
    throw new Error('unexpected '+url);
  };
  const p=createBinanceProvider({fetchImpl,disableFuturesFallback:false,futuresMinIntervalMs:0});
  const u=await p.getFuturesUniverse();
  const t=await p.getFuturesTickers();
  const k=await p.getFuturesKlines('BTCUSDT','1h',2);
  const oi=await p.getV2OiProfile('BTCUSDT');
  assert.equal(u._fallbackSource,'BYBIT_LINEAR');
  assert.equal(t[0]._fallbackSource,'BYBIT_LINEAR');
  assert.equal(k.length,2);
  assert.equal(oi.fallbackSource,'BYBIT_LINEAR');
  assert.equal(p.getSourceState().futuresFallbackUsed,true);
  assert.match(p.getSourceState().marketSource,/bybit-futures-fallback/);
});

test('fallback can be explicitly disabled for strict callers',async()=>{
  const fetchImpl=async url=>{
    if(String(url).includes('binance.com')) return response(418,{msg:'IP banned until 4102444800000'});
    throw new Error('fallback should not be called');
  };
  const p=createBinanceProvider({fetchImpl,disableFuturesFallback:true,futuresMinIntervalMs:0});
  await assert.rejects(()=>p.getFuturesUniverse());
});

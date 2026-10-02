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


test('provider falls through to Gate when Binance is banned and Bybit is blocked',async()=>{
  const fetchImpl=async url=>{
    const u=String(url);
    if(u.includes('binance.com'))return response(418,{msg:'IP banned until 4102444800000'});
    if(u.includes('api.bybit.com'))return response(403,{});
    if(u.includes('/futures/usdt/contracts'))return response(200,[
      {name:'BTC_USDT',in_delisting:false},{name:'ETH_USDT',in_delisting:false}
    ]);
    if(u.includes('/futures/usdt/tickers'))return response(200,[
      {contract:'BTC_USDT',last:'100',change_percentage:'1.2',volume_24h_quote:'25000000',funding_rate:'0.0001'},
      {contract:'ETH_USDT',last:'4',change_percentage:'0.5',volume_24h_quote:'15000000',funding_rate:'-0.0002'}
    ]);
    if(u.includes('/futures/usdt/contract_stats')){
      const rows=Array.from({length:97},(_,i)=>({time:1700000000+i*900,open_interest:String(1000+i*2),open_interest_usd:100000+i*100,lsr_taker:1.1+i*.001}));
      return response(200,rows);
    }
    throw new Error('unexpected '+u);
  };
  const p=createBinanceProvider({fetchImpl,disableFuturesFallback:false,futuresMinIntervalMs:0});
  const u=await p.getFuturesUniverse(),t=await p.getFuturesTickers(),fund=await p.getFundingMap(),oi=await p.getV2OiProfile('BTCUSDT'),tak=await p.getV2TakerSeries('BTCUSDT','15m',8);
  assert.equal(u._fallbackSource,'GATE_USDT');
  assert.equal(t[0]._fallbackSource,'GATE_USDT');
  assert.equal(t[0].quoteVolume,'25000000');
  assert.equal(fund.get('BTCUSDT'),.01);
  assert(oi.oi4hPct>0);
  assert.equal(oi.fallbackSource,'GATE_USDT');
  assert.equal(tak.at(-1).ratioSource,'gate_contract_stats_lsr_taker');
  assert.equal(p.getSourceState().futuresFallbackSource,'gate');
  assert.match(p.getSourceState().marketSource,/gate-futures-fallback/);
});

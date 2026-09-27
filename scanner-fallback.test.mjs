import test from 'node:test';
import assert from 'node:assert/strict';
import {Binance} from './scanner/binance.mjs';
import {analyze} from './scanner/indicators.mjs';

class Store{
  constructor(){this.cache=new Map();}
  async get(k){const e=this.cache.get(k);return e?.data??null;}
  async put(k,data,ttl){this.cache.set(k,{data,ttl});}
  async reserve(){return true;}
}
class FailWebSocket{
  constructor(){this.handlers=new Map();queueMicrotask(()=>this.handlers.get('error')?.({}));}
  addEventListener(name,fn){this.handlers.set(name,fn);}
  close(){}
}
function bybit(body){return Response.json({retCode:0,retMsg:'OK',result:body});}

test('websocket failure falls back to labeled Bybit linear universe',async()=>{
  const prior=globalThis.WebSocket;globalThis.WebSocket=FailWebSocket;
  const fetcher=async url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/tickers'))return bybit({list:[{symbol:'BTCUSDT',lastPrice:'70000',price24hPcnt:'0.03',turnover24h:'25000000'},{symbol:'SOXLUSDT',lastPrice:'50',price24hPcnt:'0.10',turnover24h:'50000000'}]});
    throw new Error('unexpected '+url);
  };
  try{
    const api=new Binance(new Store(),fetcher,{universeAllowlist:new Set(['AAAUSDT']),universeAllowlistAsOf:123});
    const u=await api.universe();
    assert.equal(u.source,'BYBIT_LINEAR_FALLBACK');
    assert.equal(u.rows.length,527);
    const btc=u.rows.find(x=>x.symbol==='BTCUSDT');
    assert.ok(btc);assert.equal(btc.change,3);assert.equal(btc.marketSource,'BYBIT_LINEAR_FALLBACK');
    assert.equal(u.coverage.total,527);assert.ok(u.coverage.available>=1);
    assert.equal(u.rows.some(x=>x.symbol==='SOXLUSDT')&& !u.rows.find(x=>x.symbol==='SOXLUSDT')?.price,false);
  }finally{if(prior===undefined)delete globalThis.WebSocket;else globalThis.WebSocket=prior;}
});

test('Binance cooldown uses Bybit OI without fabricating taker volume',async()=>{
  const store=new Store();
  await store.put('binance:blocked:futures',{message:'rate limited',until:Date.now()+60000},60000);
  const asOf=Math.floor(Date.now()/300000)*300000;
  const oiRows=Array.from({length:100},(_,i)=>({timestamp:asOf-i*300000,openInterest:String(200-i)}));
  const fetcher=async url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/open-interest'))return bybit({list:oiRows});
    if(u.pathname.endsWith('/kline')){
      const end=Number(u.searchParams.get('end')||asOf);
      const list=Array.from({length:160},(_,i)=>{
        const t=end-(i+1)*3600000;
        return[String(t),'10','11','9','10.5','100','1000'];
      });
      return bybit({list});
    }
    throw new Error('unexpected '+url);
  };
  const api=new Binance(store,fetcher);
  const oi=await api.oi('AAAUSDT',asOf);
  assert.equal(oi.source,'BYBIT_LINEAR_FALLBACK');
  assert.ok(Number.isFinite(oi.change4h));

  const bars=await api.bars('AAAUSDT','1h',asOf,149);
  assert.equal(bars._source,'BYBIT_LINEAR_FALLBACK');
  assert.equal(bars.at(-1).buy,null);
  const frame=analyze(bars,{fast:true});
  assert.equal(frame.takerKline,null);
});


test('spot rate limit does not globally block futures requests',async()=>{
  const store=new Store();
  const calls=[];
  const fetcher=async url=>{
    calls.push(String(url));
    const u=new URL(url);
    if(u.hostname==='api.binance.com')return new Response('rate limited',{status:418,headers:{'retry-after':'60'}});
    if(u.hostname==='fapi.binance.com')return Response.json({serverTime:123});
    throw new Error('unexpected '+url);
  };
  const api=new Binance(store,fetcher,{spotBases:['https://api.binance.com'],futuresBases:['https://fapi.binance.com']});
  await assert.rejects(()=>api.get('/api/v3/klines',{symbol:'BTCUSDT',interval:'1h',limit:35},60000,true));
  const futures=await api.get('/fapi/v1/time',{},10000,false);
  assert.equal(futures.serverTime,123);
  assert.equal(await store.get('binance:blocked:futures'),null);
  assert.ok(await store.get('binance:blocked:spot'));
});

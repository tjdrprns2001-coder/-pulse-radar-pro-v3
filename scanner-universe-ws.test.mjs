import test from 'node:test';
import assert from 'node:assert/strict';
import {Binance} from './scanner/binance.mjs';

class Store{
  constructor(){this.cache=new Map();}
  async get(k){return this.cache.get(k)||null;}
  async put(k,v){this.cache.set(k,v);}
  async reserve(){return true;}
}
class FakeWebSocket{
  constructor(url){
    this.url=url;this.handlers=new Map();
    queueMicrotask(()=>{
      const fn=this.handlers.get('message');
      fn?.({data:JSON.stringify([
        {s:'AAAUSDT',c:'1.23',P:'4.5',q:'20000000',E:1234567890000},
        {s:'BBBUSDT',c:'2.34',P:'-1.2',q:'30000000',E:1234567890100}
      ])});
    });
  }
  addEventListener(name,fn){this.handlers.set(name,fn);}
  close(){}
}

test('universe uses futures websocket ticker snapshot instead of 24h ticker REST',async()=>{
  const prior=globalThis.WebSocket;
  globalThis.WebSocket=FakeWebSocket;
  const calls=[];
  try{
    const api=new Binance(new Store(),async url=>{
      calls.push(String(url));
      return Response.json({symbols:[
        {symbol:'AAAUSDT',baseAsset:'AAA',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'},
        {symbol:'BBBUSDT',baseAsset:'BBB',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'}
      ]});
    },{futuresBases:['https://fapi.binance.com']});
    const u=await api.universe();
    assert.equal(u.rows.length,2);
    assert.equal(u.asOf,1234567890100);
    assert.equal(u.rows[0].change,4.5);
    assert.equal(u.rows[1].quoteVolume,30000000);
    assert.equal(calls.length,1);
    assert.match(calls[0],/exchangeInfo/);
    assert.ok(!calls.some(x=>x.includes('ticker\/24hr')));
  }finally{
    if(prior===undefined)delete globalThis.WebSocket;else globalThis.WebSocket=prior;
  }
});

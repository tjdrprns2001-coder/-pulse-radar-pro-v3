'use strict';
const assert=require('assert');
const {createBinanceWsMultiplexer}=require('../lib/coin-scan/binance-ws-multiplexer.js');
let instance=null;
class FakeWS{
  constructor(url){this.url=url;this.sent=[];instance=this}
  send(v){this.sent.push(v)}
  close(){}
}
(async()=>{
  const events=[];
  const mux=createBinanceWsMultiplexer({WebSocketCtor:FakeWS,url:'wss://example/ws',onEvent:e=>events.push(e),maxStreams:5,now:()=>1000});
  mux.subscribe(['btcusdt@bookTicker']);mux.connect();instance.onopen();
  assert(instance.sent.some(x=>String(x).toLowerCase().includes('btcusdt@bookticker')),'subscription sent');
  await instance.onmessage({data:JSON.stringify({e:'bookTicker',E:999,s:'BTCUSDT',u:7,b:'1',a:'2'})});
  assert.equal(events.length,1);
  assert.equal(events[0].stream,'btcusdt@bookTicker');
  assert.equal(events[0].data.s,'BTCUSDT');
  console.log('binance ws raw public event PASS');
})().catch(e=>{console.error(e);process.exit(1)});

const assert=require('assert');
const {createBinanceWsMultiplexer}=require('../lib/coin-scan/binance-ws-multiplexer.js');
class FakeWS{constructor(url){this.url=url;FakeWS.last=this}send(v){this.sent=(this.sent||[]).concat(v)}close(){}open(){this.onopen&&this.onopen()}message(v){return this.onmessage&&this.onmessage({data:JSON.stringify(v)})}}
(async()=>{
 let snapCalls=0;
 const m=createBinanceWsMultiplexer({WebSocketCtor:FakeWS,now:()=>1000,restSnapshot:async()=>{snapCalls++;return{lastUpdateId:12,bids:[],asks:[]}}});
 m.subscribe(['btcusdt@depth']);m.connect();FakeWS.last.open();assert.equal(m.state,'LIVE');
 await m.onDepth('btcusdt@depth',{u:10,U:10,E:900});
 await m.onDepth('btcusdt@depth',{u:11,U:11,E:910});
 const gap=await m.onDepth('btcusdt@depth',{u:13,U:13,E:920});
 assert.equal(snapCalls,1);assert.equal(gap.lastUpdateId,13);assert.equal(m.state,'LIVE');
 assert.equal(m.heartbeat().streamCount,1);
 console.log('binance ws multiplexer PASS');
})().catch(e=>{console.error(e);process.exit(1)});

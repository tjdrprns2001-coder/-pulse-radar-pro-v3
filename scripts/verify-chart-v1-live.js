'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const T=require('../lib/chart-v1/telemetry.js');
const {createFileStore}=require('../lib/chart-v1/persistence.js');
const {createLiveHub}=require('../lib/chart-v1/live-hub.js');

class FakeWS{
  static instances=[];
  constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;this.handlers={};FakeWS.instances.push(this)}
  on(name,fn){(this.handlers[name]||(this.handlers[name]=[])).push(fn)}
  emit(name,payload){for(const fn of this.handlers[name]||[])fn(payload)}
  send(){}
  close(){this.readyState=3;this.emit('close')}
}
(async()=>{
  const trades=[];
  for(let i=0;i<200;i++)trades.push({trade_id:String(i),time:1000+i,price:100+(i%10)*.1,quantity:1+i%4,quote_value:(100+(i%10)*.1)*(1+i%4),side:i%2?'buy':'sell'});
  const vp=T.tradeVolumeProfile(trades,{bins:50,startTime:1000,endTime:1300});
  assert.equal(vp.available,true);assert.equal(vp.precision,'trade_exact_window');assert.equal(vp.nodes.length,50);assert(vp.poc&&vp.poc.price>0);assert(vp.vah>=vp.val);
  const book=T.depthStats([[100,10],[99.95,20],[99.5,30]],[[100.1,9],[100.2,18],[100.6,40]],2000);
  assert.equal(book.available,true);assert(book.spread_bps>0);assert(book.depth_usd.bid_0_5_pct>0);assert(book.depth_usd.ask_0_5_pct>0);
  let walls=T.updateWallState({},book,[]);const book2={...book,observed_at:8000,walls:[]};walls=T.updateWallState(walls,book2,[]);
  assert(walls.disappeared>=0);assert(Number.isFinite(walls.cancel_rate_estimated)||walls.cancel_rate_estimated===null);
  // Regression: a real wall disappears and must increment mutable counters without killing the process.
  const wallA={observed_at:2000,mid:100,walls:[{side:'bid',price:99.5,qty:10,quote_value:995}]};
  const wallB={observed_at:3000,mid:100,walls:[]};
  const before=T.updateWallState({},wallA,[]);
  const after=T.updateWallState(before,wallB,[]);
  assert.equal(after.disappeared,1);assert.equal(after.cancelled_likely,1);assert.equal(after.active_walls,0);
  const fulfilled=T.updateWallState(before,wallB,[{price:99.5,time:2999}]);
  assert.equal(fulfilled.disappeared,1);assert.equal(fulfilled.executed_likely,1);assert.equal(fulfilled.cancelled_likely,0);
  const longLiq=T.normalizeLiquidation({E:3000,o:{S:'SELL',ap:'100',z:'2'}},'TEST'),shortLiq=T.normalizeLiquidation({E:3100,o:{S:'BUY',ap:'101',z:'3'}},'TEST');
  assert.equal(longLiq.side,'long');assert.equal(shortLiq.side,'short');assert.equal(longLiq.notional_usd,200);

  const file=path.join(os.tmpdir(),'chart-v1-live-test-'+process.pid+'.json');try{fs.unlinkSync(file)}catch{}
  const store=createFileStore({file});await store.init();
  assert.equal(await store.appendEvent({event_id:'e1',event_type:'liquidation',symbol:'DOGEUSDT',event_time:3000,payload:{x:1}}),true);
  assert.equal(await store.appendEvent({event_id:'e1',event_type:'liquidation',symbol:'DOGEUSDT',event_time:3000,payload:{x:1}}),false);
  assert.equal((await store.listEvents({symbol:'DOGEUSDT'})).length,1);
  await store.putSnapshot('book:DOGEUSDT',{symbol:'DOGEUSDT',snapshot_type:'orderbook',observed_at:4000,value:1});assert.equal((await store.getSnapshot('book:DOGEUSDT')).value,1);
  assert.equal(await store.putAlert({alert_id:'a1',symbol:'DOGEUSDT',alert_type:'zone_approach',captured_at:5000}),true);assert.equal((await store.listAlerts({symbol:'DOGEUSDT'})).length,1);

  let now=10000;const hub=createLiveHub({WebSocketCtor:FakeWS,persistence:store,now:()=>now});
  let seen=[];hub.subscribe('DOGEUSDT',e=>seen.push(e));const ws=FakeWS.instances.at(-1);assert(ws.url.includes('dogeusdt@aggTrade'));assert(ws.url.includes('dogeusdt@forceOrder'));assert(ws.url.includes('dogeusdt@depth20@100ms'));assert(ws.url.includes('dogeusdt@kline_4h'));
  ws.readyState=1;ws.emit('open');
  ws.emit('message',JSON.stringify({stream:'dogeusdt@kline_4h',data:{e:'kline',E:10010,s:'DOGEUSDT',k:{t:0,T:14400000,o:'0.1',h:'0.2',l:'0.09',c:'0.15',v:'10',q:'1.5',x:false,i:'4h'}}}));
  ws.emit('message',JSON.stringify({stream:'dogeusdt@forceOrder',data:{e:'forceOrder',E:10020,o:{S:'SELL',ap:'0.15',z:'1000'}}}));
  ws.emit('message',JSON.stringify({stream:'dogeusdt@depth20@100ms',data:{bids:[['0.149','10000']],asks:[['0.151','9000']]}}));
  // Malformed stream messages must be isolated rather than throwing from the websocket handler.
  assert.doesNotThrow(()=>ws.emit('message',{data:{toString(){throw new Error('malformed market payload')}}}));
  const liveState=hub.stateFor('DOGEUSDT');
  liveState.trades=null;
  assert.doesNotThrow(()=>ws.emit('message',JSON.stringify({data:{e:'aggTrade',p:'0.15',q:'5',T:10030,m:false,a:5}})));
  assert(liveState.last_error?.includes('market event error'));
  assert.equal(liveState.status,'live');
  liveState.trades=[];
  const snap=hub.snapshot('DOGEUSDT',{profileBins:50});assert.equal(snap.status,'live');assert.equal(snap.klines['4h'].interval,'4h');assert.equal(snap.liquidations.series.length,1);assert.equal(snap.orderbook.available,true);assert(seen.some(x=>x.event==='candle.update'));assert(seen.some(x=>x.event==='liquidation'));
  try{fs.unlinkSync(file)}catch{}
  console.log('chart v1 live telemetry PASS');
})().catch(e=>{console.error(e);process.exit(1)});

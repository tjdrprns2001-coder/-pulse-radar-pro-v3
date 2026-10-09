'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../ui/realtime-patterns/core.js');
function row(i,{close=100,open=close-.2,high=Math.max(open,close)+1,low=Math.min(open,close)-1,volume=100}={}){
  const t=Date.UTC(2026,0,1)+i*900000;
  return{openTime:t,closeTime:t+899999,open,high,low,close,volume};
}
function history(n=95){return Array.from({length:n},(_,i)=>row(i,{close:100+Math.sin(i/4)*.75}))}
test('Historical rows require known close time, valid OHLC, are ordered and deduped',()=>{
  const a=[row(2),{...row(3),partial:true},row(1),row(2),{...row(4),high:0}];
  const result=Core.normalizeRows(a,'15m',Date.UTC(2026,0,2));
  assert.deepEqual(result.map(x=>x.openTime),[row(1).openTime,row(2).openTime]);
  assert.equal(result[1].close,100);
  assert.deepEqual(Core.normalizeRows([row(1)],'15m',row(1).closeTime),[]);
});
test('Open WebSocket klines never become confirmed events',()=>{
  const a=history(90),size=a.length,m={k:{x:false,t:row(90).openTime,T:row(90).closeTime,o:'99',h:'103',l:'98',c:'102',v:'300'}};
  assert.equal(Core.applyClosedKline(a,m,'15m').reason,'unclosed');
  assert.equal(a.length,size);
  m.k.x=true;
  assert.equal(Core.applyClosedKline(a,m,'15m').accepted,true);
  assert.equal(Core.applyClosedKline(a,m,'15m').reason,'duplicate');
  assert.equal(a.length,size+1);
  assert.equal(Core.applyClosedKline(a,{...m,k:{...m.k,t:row(88).openTime}},'15m').reason,'older');
});
test('Closed candle gaps are flagged, preventing false uninterrupted live confirmations',()=>{
  const a=history(90),m={k:{x:true,t:row(93).openTime,T:row(93).closeTime,o:'100',h:'105',l:'99',c:'102',v:'50'}};
  const r=Core.applyClosedKline(a,m,'15m');
  assert.equal(r.accepted,true);assert.equal(r.gap,true);
});
test('A confirmed breakout is detected only after confirmed closing price clears 20-bar range',()=>{
  const a=history();
  assert.ok(!Core.detect(a,{symbol:'BTCUSDT',timeframe:'15m'}).some(x=>x.type==='breakout'&&x.state==='확정'));
  const prev=a.at(-1),next=row(a.length,{open:prev.close,close:110,high:111,low:prev.close-.5,volume:700});
  const patterns=Core.detect([...a,next],{symbol:'BTCUSDT',timeframe:'15m'});
  const p=patterns.find(x=>x.type==='breakout'&&x.state==='확정');
  assert.ok(p);
  assert.equal(p.symbol,'BTCUSDT');
  assert.equal(p.rvol>1.5,true);
  assert.equal(p.candleAt,next.closeTime);
  assert.match(p.reason,/거래량 동반/);
  assert.ok(!Core.detect([...a,{...next,close:101.0,high:110}],{symbol:'BTCUSDT',timeframe:'15m'}).some(x=>x.type==='breakout'&&x.state==='확정'));
});
test('Confirmed pivots require 3 right-hand closed candles',()=>{
  const a=history(82);a[80].high=120;a[80].close=100;
  assert.ok(!Core.pivot(a,'H').some(p=>p.i===80));
  a.push(row(82),row(83),row(84));
  assert.ok(Core.pivot(a,'H').some(p=>p.i===80&&p.confirmedAt===83));
});
test('EMA compression appears only as forming without volume-confirmed range breakout',()=>{
  const a=Array.from({length:95},(_,i)=>row(i,{close:100,open:99.9,high:100.5,low:99.5,volume:100}));
  const p=Core.detect(a,{symbol:'ETHUSDT',timeframe:'15m'}).find(x=>x.type==='ema_squeeze');
  assert.ok(p);assert.equal(p.state,'형성 중');
});
test('Alerts are identified by symbol, timeframe, pattern, phase and the unique closed bar',()=>{
  const a={symbol:'BTCUSDT',timeframe:'4h',type:'bos_up',state:'확정',openTime:1234};
  assert.notEqual(Core.eventKey(a),Core.eventKey({...a,openTime:5678}));
  assert.notEqual(Core.eventKey(a),Core.eventKey({...a,timeframe:'1h'}));
});
test('The live HTML includes the engine before the app script',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../realtime-patterns.html'),'utf8');
  assert.ok(html.indexOf('/ui/realtime-patterns/core.js')<html.indexOf('/ui/realtime-patterns/app.js'));
  for(const id of['watchlist','chart','currentPatterns','eventFeed','start','stop'])assert.match(html,new RegExp('id="'+id+'"'));
});
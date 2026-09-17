'use strict';
const assert=require('assert');
const {retry,createCircuit}=require('../lib/signal-performance/resilience.js');
const {createScanService,DEEP_INTERVALS}=require('../lib/coin-scan/scan-service.js');
function frame(){return Array.from({length:60},(_,i)=>[Date.now()-60_000*(60-i),'1','1.1','.9','1',String(100+i),0,'100',10,'60','60',0])}
(async()=>{
  let attempts=0;const value=await retry(async()=>{attempts++;if(attempts<3)throw new Error('temporary');return 7},{attempts:3,baseDelayMs:1});assert.equal(value,7);assert.equal(attempts,3);
  attempts=0;const permanent=Object.assign(new Error('bad request'),{statusCode:400});await assert.rejects(()=>retry(async()=>{attempts++;throw permanent},{attempts:3,baseDelayMs:1}),/bad request/);assert.equal(attempts,1,'4xx must not retry');
  let now=1000,calls=0;const circuit=createCircuit({failureThreshold:2,cooldownMs:100,now:()=>now});
  for(let i=0;i<2;i++)await assert.rejects(()=>circuit.run(async()=>{calls++;throw new Error('down')}),/down/);
  await assert.rejects(()=>circuit.run(async()=>{calls++;return 1}),/circuit open/);assert.equal(calls,2);
  now+=101;assert.equal(await circuit.run(async()=>{calls++;return 9}),9);assert.equal(circuit.state().status,'closed');
  const exchangeInfo={symbols:[{symbol:'AAAUSDT',baseAsset:'AAA',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}]};
  const provider={async getUniverse(){return exchangeInfo},async getTickers(){return[{symbol:'AAAUSDT',lastPrice:'1',quoteVolume:'10000000',priceChangePercent:'1'}]},async scanDeepCandidates(symbols,intervals){return{results:{AAAUSDT:Object.fromEntries(intervals.map(tf=>[tf,frame()]))},errors:[],contexts:{}}}};
  let alertCalls=0,perfCalls=0;const svc=createScanService({provider,now:()=>123456,performanceRecorder:{async recordItems(){perfCalls++;throw new Error('blob down')}},alertRecorder:{async observe(){alertCalls++;throw new Error('alerts down')}}});
  const out=await svc.run({mode:'deep',symbols:['AAAUSDT'],limit:1});assert.equal(out.status,'ok');assert.equal(perfCalls,1);assert.equal(alertCalls,1,'alert recorder should be invoked once');assert(out.auxiliary&&Array.isArray(out.auxiliary.errors),'auxiliary failures should be surfaced without throwing');
  console.log('signal resilience contract PASS');
})().catch(e=>{console.error(e);process.exit(1)});

const assert=require('assert');
const {createBinanceResolver}=require('../lib/signal-performance/binance-resolver.js');

(async()=>{
  let calls=0;
  const pending=createBinanceResolver({fetchKlines:async()=>{calls++;return[]}});
  const p=await pending.resolve('ONEUSDT',2000,1999);
  assert.deepEqual(p,{status:'pending',targetTs:2000});
  assert.equal(calls,0,'must not fetch before horizon is due');

  const r=createBinanceResolver({fetchKlines:async()=>[
    [900,'9'],[1000,'10'],[1060,'11']
  ]});
  const hit=await r.resolve('ONEUSDT',1000,2000);
  assert.equal(hit.status,'evaluated');
  assert.equal(hit.marketTs,1000);
  assert.equal(hit.price,10);

  const noEarly=createBinanceResolver({fetchKlines:async()=>[[900,'9']]});
  const missing=await noEarly.resolve('ONEUSDT',1000,2000);
  assert.equal(missing.status,'unavailable');
  assert.equal(missing.targetTs,1000);
  console.log('signal performance resolver PASS');
})().catch(e=>{console.error(e);process.exit(1)});

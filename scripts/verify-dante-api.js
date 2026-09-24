'use strict';
const assert=require('assert');
const handler=require('../handlers/dante-backtest.js');
function call(query,ctx){return new Promise(resolve=>{let code=200,payload;const res={setHeader(){},status(n){code=n;return this},json(v){payload=v;resolve({code,payload});return v}};handler({method:'GET',query},res,ctx)})}
(async()=>{
  let args=null;
  const runtime={async run(x){args=x;return{ok:true,version:'DANTE_BACKTEST_RUNTIME_v1',symbol:x.symbol}}};
  let r=await call({symbol:'btcusdt',start:'2021-01-01',end:'2025-01-01',frictionPct:'0.3',sensitivity:'1'},{runtime});
  assert.equal(r.code,200);assert.equal(r.payload.status,'ok');assert.equal(args.symbol,'BTCUSDT');assert.equal(args.frictionPct,.3);assert.equal(args.sensitivity,true);
  const bad={async run(){throw new Error('boom')}};r=await call({}, {runtime:bad});assert.equal(r.code,503);assert.equal(r.payload.status,'error');
  console.log('dante api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
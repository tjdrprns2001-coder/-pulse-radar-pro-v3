'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// Mock external research storage and exchange access: no live calls or secrets.
const aiPath=require.resolve('../lib/learning/research-ai-v2.js');
const providerPath=require.resolve('../lib/coin-scan/binance-provider.js');
let hydrated=0,fetches=0,resolves=0;
const ai={
  async hydrateRemote(){hydrated++},
  exportState(){return {observations:[{symbol:'BTCUSDT',asOf:Date.now()}]}},
  resolveSymbol(){resolves++;return {changed:1,resolved:1}},
  status(){return {active:false}}
};
function stub(filename,exports){
  require.cache[filename]={id:filename,filename,loaded:true,exports};
}
stub(aiPath,{defaultResearchAIv2:()=>ai});
stub(providerPath,{createBinanceProvider:()=>({
  async getFuturesKlines(){fetches++;return []}
})});
const handler=require('../handlers/learning-ai.js');

function call(method,token){
  return new Promise((resolve,reject)=>{
    let status=200,done=false;
    const res={
      setHeader(){},
      status(n){status=n;return this},
      json(body){done=true;resolve({status,body});return this}
    };
    const headers=token===undefined?{}:{'x-learning-token':token};
    Promise.resolve(handler({method,query:{action:'resolve',limit:'1'},headers},res))
      .then(()=>{if(!done)reject(new Error('handler did not send JSON'))})
      .catch(reject);
  });
}
(async()=>{
  const previous=process.env.LEARNING_WRITE_TOKEN;
  try{
    delete process.env.LEARNING_WRITE_TOKEN;
    let r=await call('POST');
    assert.equal(r.status,403,'unconfigured token must fail closed');
    assert.equal(hydrated,0,'unauthorized POST must not hydrate research state');
    assert.equal(fetches,0,'unauthorized POST must not fetch exchange data');

    process.env.LEARNING_WRITE_TOKEN='unit-test-only-token';
    r=await call('POST');
    assert.equal(r.status,403,'missing token must be rejected');
    r=await call('POST','incorrect');
    assert.equal(r.status,403,'incorrect token must be rejected');
    assert.equal(hydrated,0,'all unauthorized POSTs must fail before hydrate');

    r=await call('GET','unit-test-only-token');
    assert.equal(r.status,405,'resolve must require POST');
    assert.equal(hydrated,0,'GET must not hydrate research state');
    assert.equal(fetches,0,'GET must not fetch exchange data');

    r=await call('POST','unit-test-only-token');
    assert.equal(r.status,200,'valid token must authorize resolve');
    assert.equal(r.body.processedSymbols,1);
    assert.equal(r.body.changed,1);
    assert.equal(fetches,1);
    assert.equal(resolves,1);

    const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/persist-research-ai-memory.yml'),'utf8');
    assert(workflow.includes('secrets.LEARNING_WRITE_TOKEN'),'scheduled resolve must read a GitHub secret');
    assert(workflow.includes('x-learning-token: ${LEARNING_WRITE_TOKEN}'),'scheduled resolve must send the auth header');
    assert(workflow.includes('LEARNING_WRITE_TOKEN must be configured'),'missing secret must fail closed');

    console.log('Research AI protected resolve auth PASS');
  }finally{
    if(previous===undefined)delete process.env.LEARNING_WRITE_TOKEN;
    else process.env.LEARNING_WRITE_TOKEN=previous;
  }
})().catch(e=>{console.error(e);process.exitCode=1});

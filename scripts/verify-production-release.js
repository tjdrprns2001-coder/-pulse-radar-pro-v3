'use strict';
const assert=require('node:assert/strict');
const {checkProduction}=require('./check-production-release.js');
const a='a'.repeat(40),b='b'.repeat(40);
function mockFetch({sha=a,storage='degraded',ai='ok',dependencySha=sha}={}){
  return async url=>({
    ok:true,status:200,
    async json(){
      if(url.endsWith('/health/live'))return{ok:true,status:'alive',release:sha};
      if(url.endsWith('/health/dependencies'))return{ok:true,release:dependencySha,chartStorage:{status:storage}};
      if(url.includes('/api/pulse-ai?mode=health'))return{status:ai,typeSafe:{available:false}};
      throw Error('unexpected url '+url);
    }
  })
}
(async()=>{
  const degraded=await checkProduction({fetchImpl:mockFetch(),expectedSha:a});
  assert.equal(degraded.releaseDrift,false);
  assert.equal(degraded.storage,'degraded','storage outage must be visible, not misreported healthy');
  assert.equal(degraded.decisionModel,'not-connected');
  const ready=await checkProduction({fetchImpl:mockFetch({storage:'ready'}),expectedSha:a});
  assert.equal(ready.storage,'ready');
  await assert.rejects(()=>checkProduction({fetchImpl:mockFetch(),expectedSha:b}),e=>e.message==='render-release-drift'&&e.report.releaseDrift===true);
  await assert.rejects(()=>checkProduction({fetchImpl:mockFetch({dependencySha:b}),expectedSha:a}),/health release mismatch/);
  await assert.rejects(()=>checkProduction({fetchImpl:mockFetch({ai:'error'}),expectedSha:a}),/Pulse AI degraded/);
  await assert.rejects(()=>checkProduction({fetchImpl:mockFetch({sha:'bad'}),expectedSha:a}),/liveness or release invalid/);
  console.log('Production canary contract PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

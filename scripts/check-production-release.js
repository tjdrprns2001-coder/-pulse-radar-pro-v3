'use strict';
// Read-only canary. A successful HTTP process is not proof of durable storage.
const ROOT='https://pulseradar-pro-unified-0926.onrender.com';
const SHA=/^[0-9a-f]{40}$/;
async function requestJson(path,{fetchImpl=global.fetch,timeoutMs=80000}={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const res=await fetchImpl(ROOT+path,{signal:ctrl.signal,headers:{accept:'application/json'},redirect:'error'});
    if(!res.ok)throw new Error(path+' HTTP '+res.status);
    const body=await res.json();
    if(!body||typeof body!=='object')throw new Error(path+' malformed JSON');
    return body;
  }finally{clearTimeout(timer)}
}
async function checkProduction({fetchImpl=global.fetch,expectedSha=null}={}){
  const live=await requestJson('/health/live',{fetchImpl});
  if(live.ok!==true||live.status!=='alive'||!SHA.test(String(live.release||'')))throw new Error('liveness or release invalid');
  const dependency=await requestJson('/health/dependencies',{fetchImpl});
  if(dependency.release!==live.release)throw new Error('health release mismatch');
  const pulse=await requestJson('/api/pulse-ai?mode=health',{fetchImpl});
  if(pulse.status!=='ok')throw new Error('Pulse AI degraded');
  const storage=dependency.chartStorage?.status||'unknown';
  const model=pulse.typeSafe?.available===true?'connected':'not-connected';
  const drift=Boolean(expectedSha&&expectedSha!==live.release);
  const report={release:live.release,expectedSha:expectedSha||null,releaseDrift:drift,
    http:'alive',pulseAi:'ok',storage,decisionModel:model};
  if(drift)throw Object.assign(new Error('render-release-drift'),{report});
  return report;
}
async function cli(){
  let result;
  try{result=await checkProduction({expectedSha:process.env.GITHUB_SHA||null});}
  catch(e){console.error('::error::'+String(e.message||e));if(e.report)console.error(JSON.stringify(e.report));process.exitCode=1;return}
  console.log('Production canary '+JSON.stringify(result));
  if(result.storage!=='ready')console.log('::warning::ChartBro persistent storage is not ready; process uptime is not durable readiness');
  if(result.decisionModel!=='connected')console.log('::warning::Laya decision model is not connected; research shadow remains inactive');
}
if(require.main===module)cli();
module.exports={ROOT,requestJson,checkProduction};

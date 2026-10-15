#!/usr/bin/env node
'use strict';
// Read-only production diagnostics. Never mutates production or makes orders.
const DEFAULT_BASE='https://pulseradar-pro-unified-0926.onrender.com';
const ROUTES={
  live:'/health/live',
  ready:'/health/ready',
  dna:'/api/astra-scan?stage=universe&method=dna&minQuoteVolume=0'
};
async function read(base,path,{fetchImpl=globalThis.fetch,timeoutMs=18000}={}){
  try{
    const url=new URL(path,base.endsWith('/')?base:base+'/');
    const response=await fetchImpl(url.toString(),{signal:AbortSignal.timeout(timeoutMs),headers:{accept:'application/json'}});
    const raw=await response.text();
    let body=null;
    try{body=JSON.parse(raw)}catch{}
    return {httpStatus:response.status,body,error:body===null?'NON_JSON_RESPONSE':null};
  }catch(e){return {httpStatus:null,body:null,error:String(e?.message||e)}}
}
async function probe({base=DEFAULT_BASE,fetchImpl=globalThis.fetch,expectedSha='',timeoutMs=18000}={}){
  const entries=await Promise.all(Object.entries(ROUTES).map(async([name,path])=>[name,await read(base,path,{fetchImpl,timeoutMs})]));
  const r=Object.fromEntries(entries),live=r.live.body||{},ready=r.ready.body||{},dna=r.dna.body||{};
  const release=live.release||ready.release||null;
  const marketSource=dna.sourceState?.marketSource||null;
  const drift=expectedSha?(!release||!expectedSha.startsWith(release)&&!release.startsWith(expectedSha)):null;
  const errors=[];
  for(const [name,value] of Object.entries(r))if(value.httpStatus!==200||value.error)errors.push(name+': '+(value.error||'HTTP '+value.httpStatus));
  if(live.ok!==true)errors.push('liveness payload not ok');
  if(ready.ok!==true||ready.storage_ready===false)errors.push('storage not ready');
  if(dna.status!=='ok'||dna.method!=='dna'||!marketSource)errors.push('DNA source or response invalid');
  if(drift===true)errors.push('running release differs from expected main SHA');
  return {
    ok:errors.length===0,checkedAt:new Date().toISOString(),
    http:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v.httpStatus])),
    readyReason:ready.reason||null,storage:ready.storage||null,
    release,expectedSha:expectedSha||null,releaseDrift:drift,
    marketSource,sourceFallback:!!dna.sourceState?.futuresFallbackUsed,
    lastFuturesError:dna.sourceState?.lastFuturesError||null,
    universeCount:dna.universeCount??null,errors
  };
}
async function main(){
  const report=await probe({base:process.env.PULSE_SITE_BASE||DEFAULT_BASE,expectedSha:process.env.PULSE_EXPECTED_SHA||''});
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(String(e));process.exitCode=1});
module.exports={read,probe,ROUTES};

'use strict';
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)))}
function defaultShouldRetry(error){const status=Number(error?.statusCode??error?.status);return !Number.isFinite(status)||status===408||status===429||status>=500}
async function retry(fn,{attempts=3,baseDelayMs=50,shouldRetry=defaultShouldRetry}={}){
  const max=Math.max(1,Math.min(10,Number(attempts)||3));let last;
  for(let i=0;i<max;i++){
    try{return await fn(i+1)}catch(e){last=e;if(i===max-1||!shouldRetry(e))throw e;await sleep((Number(baseDelayMs)||0)*Math.pow(2,i))}
  }
  throw last;
}
function createCircuit({failureThreshold=3,cooldownMs=60000,now=()=>Date.now()}={}){
  const threshold=Math.max(1,Number(failureThreshold)||3),cooldown=Math.max(1,Number(cooldownMs)||60000);let failures=0,openedAt=null,status='closed';
  async function run(fn){
    const ts=now();if(status==='open'){if(ts-openedAt<cooldown){const e=new Error('circuit open');e.code='CIRCUIT_OPEN';throw e}status='half-open'}
    try{const out=await fn();failures=0;openedAt=null;status='closed';return out}catch(e){failures++;if(failures>=threshold||status==='half-open'){status='open';openedAt=ts}throw e}
  }
  function state(){return{status,failures,openedAt,cooldownMs:cooldown,failureThreshold:threshold}}
  return{run,state};
}
module.exports={retry,createCircuit,defaultShouldRetry};

#!/usr/bin/env node
'use strict';
/**
 * Read-only production smoke check for PulseRadar.
 * Exit nonzero only for reproducible availability/schema failures.
 * No trading orders, no writes to customer data, no automatic deploys.
 */
const assert=require('node:assert/strict');
const BASE=String(process.env.PULSE_SITE_BASE||'https://pulseradar-pro-unified-0926.onrender.com').replace(/\/$/,'');
const checks=[
 {name:'main',path:'/',expected:'PulseRadar'},
 {name:'legacy scanner',path:'/astra-scan.html',expected:'Astra'},
 {name:'DNA v2',path:'/dna-scan.html',expected:'DNA v2'},
];
const timeout=Number(process.env.PULSE_HTTP_TIMEOUT_MS||18000);
const tries=Math.max(1,Math.min(4,Number(process.env.PULSE_HTTP_RETRIES||3)));
async function probe(c){
 let errors=[];
 for(let n=1;n<=tries;n++){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
   const res=await fetch(BASE+c.path,{signal:ctrl.signal,headers:{'cache-control':'no-cache'}});
   const body=await res.text();
   assert.equal(res.status,200,'HTTP '+res.status);
   assert(body.includes(c.expected),'missing expected marker '+c.expected);
   assert(/text\/html/i.test(res.headers.get('content-type')||''),'expected HTML content type');
   return{name:c.name,path:c.path,status:'PASS',http:res.status,attempts:n};
  }catch(e){errors.push('attempt '+n+': '+(e?.message||e))}
  finally{clearTimeout(timer)}
 }
 return{name:c.name,path:c.path,status:'FAIL',errors};
}
(async()=>{
 const reports=[];
 for(const c of checks)reports.push(await probe(c));
 const failures=reports.filter(x=>x.status!=='PASS');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),base:BASE,reports},null,2));
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});

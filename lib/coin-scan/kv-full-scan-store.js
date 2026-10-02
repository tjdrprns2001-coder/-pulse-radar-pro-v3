'use strict';

const {createRenderKvStateStore}=require('./render-kv-state-store.js');

const VERSION='KV_FULL_SCAN_STORE_v1';
const SHARDS=32;

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function shardFor(symbol){
  let h=2166136261;for(const ch of String(symbol||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return Math.abs(h>>>0)%SHARDS;
}
function createKvFullScanStore({url=process.env.CHARTBRO_KV_URL,prefix='pulseradar:full-scan-v2',kvStore=null}={}){
  const kv=kvStore||createRenderKvStateStore({url,prefix}),tails=new Map();
  const keyRun=id=>'run:'+String(id),keyBucket=b=>'bucket:'+String(b),keyShard=(id,n)=>'items:'+String(id)+':'+Number(n),LATEST='latest-done';
  async function locked(k,fn){const prev=tails.get(k)||Promise.resolve();let release;const next=new Promise(r=>release=r);tails.set(k,next);await prev;try{return await fn()}finally{release();if(tails.get(k)===next)tails.delete(k)}}
  async function createRun(run){await kv.putState(keyRun(run.id),clone(run));return clone(run)}
  async function claimAutoBucket(run){return locked(keyBucket(run.bucketKey),async()=>{const existingId=await kv.getState(keyBucket(run.bucketKey));if(existingId){const prior=await getRun(existingId);return{claimed:false,run:prior}}await kv.putState(keyBucket(run.bucketKey),run.id);await createRun(run);return{claimed:true,run:clone(run)}})}
  async function updateRun(id,patch){
    return locked(keyRun(id),async()=>{const cur=await getRun(id);if(!cur)throw new Error('full scan run not found');const next={...cur,...clone(patch),updatedAt:Date.now()};await kv.putState(keyRun(id),next);if(next.status==='DONE')await kv.putState(LATEST,id);return clone(next)})
  }
  async function putItem(id,item){
    const shard=shardFor(item?.symbol),k=keyShard(id,shard);
    return locked(k,async()=>{const rows=await kv.getState(k)||{},next={...rows,[item.symbol]:clone(item)};await kv.putState(k,next);return clone(item)})
  }
  async function getRun(id){return clone(await kv.getState(keyRun(id)))}
  async function getItems(id,{tiers=[],limit=1000}={}){
    const wanted=new Set((tiers||[]).filter(Boolean)),out=[];
    for(let i=0;i<SHARDS;i++){const rows=await kv.getState(keyShard(id,i))||{};for(const item of Object.values(rows)){if(wanted.size&&!wanted.has(item?.tier))continue;out.push(item)}}
    out.sort((a,b)=>(Number(b?.marketCapUsd)||-1)-(Number(a?.marketCapUsd)||-1)||String(a?.symbol||'').localeCompare(String(b?.symbol||'')));
    return clone(out.slice(0,Math.max(1,Math.min(2000,Number(limit)||1000))));
  }
  async function latest({tiers=[],limit=1000}={}){
    const id=await kv.getState(LATEST);if(!id)return null;const run=await getRun(id);if(!run)return null;return{...run,items:await getItems(id,{tiers,limit})}
  }
  async function ping(){return kv.ping()}
  return{VERSION,SHARDS,createRun,claimAutoBucket,updateRun,putItem,getRun,getItems,latest,ping,keyPrefix:kv.keyPrefix};
}
module.exports={VERSION,SHARDS,shardFor,createKvFullScanStore};
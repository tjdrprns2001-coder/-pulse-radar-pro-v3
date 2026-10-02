'use strict';

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function createMemoryFullScanStore(){
  const runs=new Map(),items=new Map(),buckets=new Map();
  function listFor(id){if(!items.has(id))items.set(id,new Map());return items.get(id)}
  async function createRun(run){runs.set(run.id,clone(run));if(run.bucketKey)buckets.set(run.bucketKey,run.id);return clone(run)}
  async function claimAutoBucket(run){
    const priorId=buckets.get(run.bucketKey);
    if(priorId)return{claimed:false,run:clone(runs.get(priorId))};
    await createRun(run);return{claimed:true,run:clone(run)}
  }
  async function updateRun(id,patch){const cur=runs.get(id);if(!cur)throw new Error('full scan run not found');const next={...cur,...clone(patch),updatedAt:Date.now()};runs.set(id,next);return clone(next)}
  async function putItem(id,item){listFor(id).set(item.symbol,clone(item));return clone(item)}
  async function getRun(id){return clone(runs.get(id)||null)}
  async function getItems(id,{tiers=[],limit=1000}={}){
    const wanted=new Set((tiers||[]).filter(Boolean));return [...(items.get(id)?.values()||[])].filter(x=>!wanted.size||wanted.has(x.tier)).sort((a,b)=>(Number(b.marketCapUsd)||-1)-(Number(a.marketCapUsd)||-1)||String(a.symbol).localeCompare(String(b.symbol))).slice(0,Math.max(1,Math.min(2000,Number(limit)||1000))).map(clone)
  }
  async function latest({tiers=[],limit=1000}={}){
    const done=[...runs.values()].filter(x=>x.status==='DONE').sort((a,b)=>Number(b.completedAt||b.createdAt||0)-Number(a.completedAt||a.createdAt||0))[0];
    return done?{...clone(done),items:await getItems(done.id,{tiers,limit})}:null
  }
  return{createRun,claimAutoBucket,updateRun,putItem,getRun,getItems,latest,_kind:'memory'};
}
function createResilientFullScanStore({primary,fallback=createMemoryFullScanStore(),cooldownMs=60000,onFallback=null}={}){
  if(!primary)throw new Error('primary required');let primaryBlockedUntil=0,lastError=null;
  const methods=['createRun','claimAutoBucket','updateRun','putItem','getRun','getItems','latest'];
  const out={_kind:'resilient',state:()=>({primaryAvailable:Date.now()>=primaryBlockedUntil,primaryBlockedUntil,lastError})};
  for(const name of methods)out[name]=async(...args)=>{
    if(Date.now()<primaryBlockedUntil)return fallback[name](...args);
    try{
      const r=await primary[name](...args);primaryBlockedUntil=0;lastError=null;
      // Mirror successful writes so a later DB outage can continue the same active run.
      if(['createRun','claimAutoBucket','updateRun','putItem'].includes(name)){
        try{await fallback[name](...args)}catch{}
      }
      return r
    }catch(e){
      lastError=String(e?.message||e);primaryBlockedUntil=Date.now()+Math.max(1000,Number(cooldownMs)||60000);
      try{onFallback?.({method:name,error:lastError,primaryBlockedUntil})}catch{}
      return fallback[name](...args)
    }
  };
  return out
}
module.exports={createMemoryFullScanStore,createResilientFullScanStore};

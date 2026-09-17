'use strict';
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function createMemoryStore(){
  const snapshots=new Map(),outcomes=new Map();
  return{
    async putSnapshot(snapshot){if(!snapshot?.id)throw new Error('snapshot id required');if(snapshots.has(snapshot.id))return false;snapshots.set(snapshot.id,clone(snapshot));return true},
    async getSnapshot(id){return clone(snapshots.get(String(id))??null)},
    async putOutcome(id,outcome){if(!id)throw new Error('outcome id required');outcomes.set(String(id),clone(outcome));return true},
    async getOutcome(id){return clone(outcomes.get(String(id))??null)},
    async listSnapshots(){return [...snapshots.values()].map(clone)},
    async listOutcomes(){return [...outcomes.values()].map(clone)}
  };
}
function defaultGetStore(){
  let mod;try{mod=require('@netlify/blobs')}catch(e){const err=new Error('@netlify/blobs is required in production');err.cause=e;throw err}
  return mod.getStore('pulse-signal-performance');
}
function createBlobStore({getStore=defaultGetStore}={}){
  const store=()=>getStore('pulse-signal-performance');
  const snapKey=id=>`signal-snapshots/${String(id)}.json`;
  const outKey=id=>`signal-outcomes/${String(id)}.json`;
  async function read(key){const v=await store().get(key,{type:'json'});if(v==null)return null;if(typeof v==='string'){try{return JSON.parse(v)}catch{return null}}return clone(v)}
  async function write(key,value){const s=store();if(typeof s.setJSON==='function')return s.setJSON(key,clone(value));return s.set(key,JSON.stringify(value),{contentType:'application/json'})}
  async function listPrefix(prefix){const s=store();const out=[];let cursor;do{const page=await s.list({prefix,cursor});for(const b of page?.blobs||[]){const v=await read(b.key);if(v!=null)out.push(v)}cursor=page?.next_cursor||page?.cursor||null}while(cursor);return out}
  return{
    async putSnapshot(snapshot){if(!snapshot?.id)throw new Error('snapshot id required');const key=snapKey(snapshot.id);if(await read(key))return false;await write(key,snapshot);return true},
    async getSnapshot(id){return read(snapKey(id))},
    async putOutcome(id,outcome){if(!id)throw new Error('outcome id required');await write(outKey(id),outcome);return true},
    async getOutcome(id){return read(outKey(id))},
    async listSnapshots(){return listPrefix('signal-snapshots/')},
    async listOutcomes(){return listPrefix('signal-outcomes/')}
  };
}
module.exports={createMemoryStore,createBlobStore};

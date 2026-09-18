'use strict';
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function createMemoryResearchStore(){
  const maps={events:new Map(),outcomes:new Map(),runs:new Map(),manifests:new Map(),universes:new Map(),stats:new Map(),checkpoints:new Map()};
  const immutablePut=(map,id,value)=>{const k=String(id);if(map.has(k))return false;map.set(k,clone(value));return true};
  return{
    async putEvent(v){if(!v?.eventId)throw new Error('eventId required');return immutablePut(maps.events,v.eventId,v)},
    async getEvent(id){return clone(maps.events.get(String(id))??null)},
    async listEvents(){return [...maps.events.values()].map(clone)},
    async putOutcome(id,v){if(!id)throw new Error('eventId required');maps.outcomes.set(String(id),clone(v));return true},
    async getOutcome(id){return clone(maps.outcomes.get(String(id))??null)},
    async listOutcomes(){return [...maps.outcomes.values()].map(clone)},
    async putRun(id,v){maps.runs.set(String(id),clone(v));return true},
    async getRun(id){return clone(maps.runs.get(String(id))??null)},
    async listRuns(){return [...maps.runs.values()].map(clone)},
    async putManifest(id,v){if(!id)throw new Error('manifest id required');return immutablePut(maps.manifests,id,v)},
    async getManifest(id){return clone(maps.manifests.get(String(id))??null)},
    async listManifests(){return [...maps.manifests.values()].map(clone)},
    async putUniverse(id,v){if(!id)throw new Error('universe id required');return immutablePut(maps.universes,id,v)},
    async getUniverse(id){return clone(maps.universes.get(String(id))??null)},
    async listUniverses(){return [...maps.universes.values()].map(clone)},
    async putStats(id,v){maps.stats.set(String(id),clone(v));return true},
    async getStats(id){return clone(maps.stats.get(String(id))??null)},
    async putCheckpoint(id,v){maps.checkpoints.set(String(id),clone(v));return true},
    async getCheckpoint(id){return clone(maps.checkpoints.get(String(id))??null)}
  };
}
function createBlobResearchStore({getStore}={}){
  if(typeof getStore!=='function')throw new Error('Netlify Blobs getStore adapter required');
  const bucket=()=>getStore('pulse-research-backtest-v2');
  const key=(kind,id)=>'research-v2/'+kind+'/'+String(id)+'.json';
  async function read(k){const v=await bucket().get(k,{type:'json'});if(v==null)return null;if(typeof v==='string'){try{return JSON.parse(v)}catch{return null}}return clone(v)}
  async function write(k,v){const s=bucket();if(typeof s.setJSON==='function')return s.setJSON(k,clone(v));return s.set(k,JSON.stringify(v),{contentType:'application/json'})}
  async function list(kind){const prefix='research-v2/'+kind+'/',out=[];let cursor;do{const page=await bucket().list({prefix,cursor});for(const b of page?.blobs||[]){if(!String(b?.key||'').startsWith(prefix))continue;const v=await read(b.key);if(v!=null)out.push(v)}cursor=page?.next_cursor||page?.cursor||null}while(cursor);return out}
  async function immutable(kind,id,v){const k=key(kind,id);if(await read(k))return false;await write(k,v);return true}
  return{
    async putEvent(v){if(!v?.eventId)throw new Error('eventId required');return immutable('events',v.eventId,v)},
    async getEvent(id){return read(key('events',id))},
    async listEvents(){return list('events')},
    async putOutcome(id,v){await write(key('outcomes',id),v);return true},
    async getOutcome(id){return read(key('outcomes',id))},
    async listOutcomes(){return list('outcomes')},
    async putRun(id,v){await write(key('runs',id),v);return true},
    async getRun(id){return read(key('runs',id))},
    async listRuns(){return list('runs')},
    async putManifest(id,v){return immutable('manifests',id,v)},
    async getManifest(id){return read(key('manifests',id))},
    async listManifests(){return list('manifests')},
    async putUniverse(id,v){return immutable('universes',id,v)},
    async getUniverse(id){return read(key('universes',id))},
    async listUniverses(){return list('universes')},
    async putStats(id,v){await write(key('stats',id),v);return true},
    async getStats(id){return read(key('stats',id))},
    async putCheckpoint(id,v){await write(key('checkpoints',id),v);return true},
    async getCheckpoint(id){return read(key('checkpoints',id))}
  };
}
module.exports={createMemoryResearchStore,createBlobResearchStore};

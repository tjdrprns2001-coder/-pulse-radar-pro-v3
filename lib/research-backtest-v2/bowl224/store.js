'use strict';
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function createMemoryBowl224Store(){
 const maps={runs:new Map(),events:new Map(),annotations:new Map(),outcomes:new Map(),baselines:new Map(),stats:new Map(),checkpoints:new Map()};
 const imm=(m,k,v)=>{k=String(k);if(m.has(k))return false;m.set(k,clone(v));return true};
 return{
  async putRun(id,v){maps.runs.set(String(id),clone(v));return true},async getRun(id){return clone(maps.runs.get(String(id))||null)},async listRuns(){return[...maps.runs.values()].map(clone)},
  async putEvent(v){if(!v?.eventId)throw new Error('eventId required');return imm(maps.events,v.eventId,v)},async getEvent(id){return clone(maps.events.get(String(id))||null)},async listEvents(){return[...maps.events.values()].map(clone)},
  async putAnnotation(id,v){maps.annotations.set(String(id),clone(v));return true},async getAnnotation(id){return clone(maps.annotations.get(String(id))||null)},async listAnnotations(){return[...maps.annotations.values()].map(clone)},
  async putOutcome(id,v){maps.outcomes.set(String(id),clone(v));return true},async getOutcome(id){return clone(maps.outcomes.get(String(id))||null)},async listOutcomes(){return[...maps.outcomes.values()].map(clone)},
  async putBaseline(id,v){return imm(maps.baselines,id,v)},async listBaselines(){return[...maps.baselines.values()].map(clone)},
  async putStats(id,v){maps.stats.set(String(id),clone(v));return true},async getStats(id){return clone(maps.stats.get(String(id))||null)},
  async putCheckpoint(id,v){maps.checkpoints.set(String(id),clone(v));return true},async getCheckpoint(id){return clone(maps.checkpoints.get(String(id))||null)}
 };
}
function createBlobBowl224Store({getStore}={}){
 if(typeof getStore!=='function')throw new Error('getStore required');const bucket=()=>getStore('pulse-research-backtest-v2');
 const key=(kind,id)=>'research-v2/bowl224/'+kind+'/'+String(id)+'.json';
 async function read(k){const v=await bucket().get(k,{type:'json'});if(v==null)return null;return typeof v==='string'?JSON.parse(v):clone(v)}
 async function write(k,v){const s=bucket();if(typeof s.setJSON==='function')await s.setJSON(k,clone(v));else await s.set(k,JSON.stringify(v),{contentType:'application/json'})}
 async function list(kind){const prefix='research-v2/bowl224/'+kind+'/',out=[];let cursor;do{const p=await bucket().list({prefix,cursor});for(const b of p?.blobs||[]){const v=await read(b.key);if(v!=null)out.push(v)}cursor=p?.next_cursor||p?.cursor||null}while(cursor);return out}
 async function imm(kind,id,v){const k=key(kind,id);if(await read(k))return false;await write(k,v);return true}
 return{
  async putRun(id,v){await write(key('runs',id),v);return true},async getRun(id){return read(key('runs',id))},async listRuns(){return list('runs')},
  async putEvent(v){return imm('events',v.eventId,v)},async getEvent(id){return read(key('events',id))},async listEvents(){return list('events')},
  async putAnnotation(id,v){await write(key('annotations',id),v);return true},async getAnnotation(id){return read(key('annotations',id))},async listAnnotations(){return list('annotations')},
  async putOutcome(id,v){await write(key('outcomes',id),v);return true},async getOutcome(id){return read(key('outcomes',id))},async listOutcomes(){return list('outcomes')},
  async putBaseline(id,v){return imm('baselines',id,v)},async listBaselines(){return list('baselines')},
  async putStats(id,v){await write(key('stats',id),v);return true},async getStats(id){return read(key('stats',id))},
  async putCheckpoint(id,v){await write(key('checkpoints',id),v);return true},async getCheckpoint(id){return read(key('checkpoints',id))}
 };
}
module.exports={createMemoryBowl224Store,createBlobBowl224Store};
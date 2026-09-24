'use strict';
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function createMemoryStore(){
  const snapshots=new Map(),outcomes=new Map(),checkpoints=new Map(),alerts=new Map(),evidence=new Map(),health=new Map(),states=new Map(),transitionSnapshots=new Map(),recommendations=new Map(),recommendationOutcomes=new Map();
  return{
    async putSnapshot(snapshot){if(!snapshot?.id)throw new Error('snapshot id required');if(snapshots.has(snapshot.id))return false;snapshots.set(snapshot.id,clone(snapshot));return true},
    async getSnapshot(id){return clone(snapshots.get(String(id))??null)},
    async putOutcome(id,outcome){if(!id)throw new Error('outcome id required');outcomes.set(String(id),clone(outcome));return true},
    async getOutcome(id){return clone(outcomes.get(String(id))??null)},
    async listSnapshots(){return [...snapshots.values()].map(clone)},
    async listOutcomes(){return [...outcomes.values()].map(clone)},
    async putCheckpoint(id,value){if(!id)throw new Error('checkpoint id required');checkpoints.set(String(id),clone(value));return true},
    async getCheckpoint(id){return clone(checkpoints.get(String(id))??null)},
    async putAlert(id,value){if(!id)throw new Error('alert id required');if(alerts.has(String(id)))return false;alerts.set(String(id),clone(value));return true},
    async listAlerts(){return [...alerts.values()].map(clone)},
    async putEvidence(id,value){if(!id)throw new Error('evidence id required');evidence.set(String(id),clone(value));return true},
    async listEvidence(){return [...evidence.values()].map(clone)},
    async putHealth(id,value){if(!id)throw new Error('health id required');health.set(String(id),clone(value));return true},
    async getHealth(id){return clone(health.get(String(id))??null)},
    async putState(id,value){if(!id)throw new Error('state id required');states.set(String(id),clone(value));return true},
    async getState(id){return clone(states.get(String(id))??null)},
    async putTransitionSnapshot(id,value){if(!id)throw new Error('transition snapshot id required');if(transitionSnapshots.has(String(id)))return false;transitionSnapshots.set(String(id),clone(value));return true},
    async getTransitionSnapshot(id){return clone(transitionSnapshots.get(String(id))??null)},
    async listTransitionSnapshots(){return [...transitionSnapshots.values()].map(clone)},
    async putRecommendation(id,value){if(!id)throw new Error('recommendation id required');if(recommendations.has(String(id)))return false;recommendations.set(String(id),clone(value));return true},
    async listRecommendations(){return [...recommendations.values()].map(clone)},
    async putRecommendationOutcome(id,value){if(!id)throw new Error('recommendation outcome id required');recommendationOutcomes.set(String(id),clone(value));return true},
    async getRecommendationOutcome(id){return clone(recommendationOutcomes.get(String(id))??null)},
    async listRecommendationOutcomes(){return [...recommendationOutcomes.values()].map(clone)}
  };
}
function createBlobStore({getStore}={}){
  if(typeof getStore!=='function')throw new Error('Netlify Blobs getStore adapter required');
  const store=()=>getStore('pulse-signal-performance');
  const key=(prefix,id)=>`${prefix}/${String(id)}.json`;
  const snapKey=id=>key('signal-snapshots',id),outKey=id=>key('signal-outcomes',id);
  async function read(k){const v=await store().get(k,{type:'json'});if(v==null)return null;if(typeof v==='string'){try{return JSON.parse(v)}catch{return null}}return clone(v)}
  async function write(k,value){const s=store();if(typeof s.setJSON==='function')return s.setJSON(k,clone(value));return s.set(k,JSON.stringify(value),{contentType:'application/json'})}
  async function listPrefix(prefix){const s=store();const out=[];let cursor;do{const page=await s.list({prefix,cursor});for(const b of page?.blobs||[]){if(!String(b?.key||'').startsWith(prefix))continue;const v=await read(b.key);if(v!=null)out.push(v)}cursor=page?.next_cursor||page?.cursor||null}while(cursor);return out}
  return{
    async putSnapshot(snapshot){if(!snapshot?.id)throw new Error('snapshot id required');const k=snapKey(snapshot.id);if(await read(k))return false;await write(k,snapshot);return true},
    async getSnapshot(id){return read(snapKey(id))},
    async putOutcome(id,outcome){if(!id)throw new Error('outcome id required');await write(outKey(id),outcome);return true},
    async getOutcome(id){return read(outKey(id))},
    async listSnapshots(){return listPrefix('signal-snapshots/')},
    async listOutcomes(){return listPrefix('signal-outcomes/')},
    async putCheckpoint(id,value){if(!id)throw new Error('checkpoint id required');await write(key('signal-checkpoints',id),value);return true},
    async getCheckpoint(id){return read(key('signal-checkpoints',id))},
    async putAlert(id,value){if(!id)throw new Error('alert id required');const k=key('signal-alerts',id);if(await read(k))return false;await write(k,value);return true},
    async listAlerts(){return listPrefix('signal-alerts/')},
    async putEvidence(id,value){if(!id)throw new Error('evidence id required');await write(key('signal-evidence',id),value);return true},
    async listEvidence(){return listPrefix('signal-evidence/')},
    async putHealth(id,value){if(!id)throw new Error('health id required');await write(key('signal-health',id),value);return true},
    async getHealth(id){return read(key('signal-health',id))},
    async putState(id,value){if(!id)throw new Error('state id required');await write(key('signal-states',id),value);return true},
    async getState(id){return read(key('signal-states',id))},
    async putTransitionSnapshot(id,value){if(!id)throw new Error('transition snapshot id required');const k=key('transition-snapshots',id);if(await read(k))return false;await write(k,value);return true},
    async getTransitionSnapshot(id){return read(key('transition-snapshots',id))},
    async listTransitionSnapshots(){return listPrefix('transition-snapshots/')},
    async putRecommendation(id,value){if(!id)throw new Error('recommendation id required');const k=key('auto-recommendations',id);if(await read(k))return false;await write(k,value);return true},
    async listRecommendations(){return listPrefix('auto-recommendations/')},
    async putRecommendationOutcome(id,value){if(!id)throw new Error('recommendation outcome id required');await write(key('auto-recommendation-outcomes',id),value);return true},
    async getRecommendationOutcome(id){return read(key('auto-recommendation-outcomes',id))},
    async listRecommendationOutcomes(){return listPrefix('auto-recommendation-outcomes/')}
  };
}
module.exports={createMemoryStore,createBlobStore};

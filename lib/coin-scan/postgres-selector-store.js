'use strict';
function createPostgresSelectorStore({query}={}){
  if(typeof query!=='function')throw new Error('query function required');
  const json=v=>JSON.stringify(v??null);
  async function immutable(table,idCol,id,value,extra=[]){
    const cols=[idCol,...extra.map(x=>x[0]),'payload'];
    const vals=[id,...extra.map(x=>x[1]),json(value)];
    const params=vals.map((_,i)=>'$'+(i+1));
    const r=await query(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${params.join(',')}) ON CONFLICT(${idCol}) DO NOTHING RETURNING ${idCol}`,vals);
    return Boolean(r?.rowCount);
  }
  async function putSelectorSnapshot(id,v){return immutable('selector_snapshots','snapshot_id',id,v,[['symbol',v?.symbol||null],['classification',v?.classification||null],['decision_time',v?.decision_time||null]])}
  async function getSelectorSnapshot(id){const r=await query('SELECT payload FROM selector_snapshots WHERE snapshot_id=$1',[id]);return r?.rows?.[0]?.payload||null}
  async function listSelectorSnapshots(){const r=await query('SELECT payload FROM selector_snapshots ORDER BY decision_time DESC LIMIT 5000');return (r?.rows||[]).map(x=>x.payload)}
  async function putSelectorRaw(id,v){return immutable('selector_raw','snapshot_id',id,v)}
  async function getSelectorRaw(id){const r=await query('SELECT payload FROM selector_raw WHERE snapshot_id=$1',[id]);return r?.rows?.[0]?.payload||null}
  async function putSelectorTransition(id,v){return immutable('selector_transitions','transition_id',id,v,[['symbol',v?.symbol||null],['decision_time',v?.decisionTime||null]])}
  async function listSelectorTransitions(){const r=await query('SELECT payload FROM selector_transitions ORDER BY decision_time DESC LIMIT 5000');return (r?.rows||[]).map(x=>x.payload)}
  async function putSelectorOutcome(id,v){await query('INSERT INTO selector_outcomes(snapshot_id,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(snapshot_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[id,json(v)]);return true}
  async function getSelectorOutcome(id){const r=await query('SELECT payload FROM selector_outcomes WHERE snapshot_id=$1',[id]);return r?.rows?.[0]?.payload||null}
  async function listSelectorOutcomes(){const r=await query('SELECT payload FROM selector_outcomes ORDER BY updated_at DESC LIMIT 5000');return (r?.rows||[]).map(x=>x.payload)}
  async function putSelectorStats(id,v){await query('INSERT INTO selector_stats(stats_id,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(stats_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[id,json(v)]);return true}
  async function getSelectorStats(id){const r=await query('SELECT payload FROM selector_stats WHERE stats_id=$1',[id]);return r?.rows?.[0]?.payload||null}
  async function putSelectorEvidence(id,v){return immutable('selector_evidence','evidence_id',id,v,[['symbol',v?.symbol||null],['recorded_at',v?.recordedAt?new Date(v.recordedAt).toISOString():null]])}
  async function getSelectorEvidence(id){const r=await query('SELECT payload FROM selector_evidence WHERE evidence_id=$1',[id]);return r?.rows?.[0]?.payload||null}
  async function listSelectorEvidence(){const r=await query('SELECT payload FROM selector_evidence ORDER BY recorded_at DESC NULLS LAST LIMIT 5000');return (r?.rows||[]).map(x=>x.payload)}
  async function putState(id,v){await query('INSERT INTO selector_state(state_key,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(state_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[id,json(v)]);return true}
  async function getState(id){const r=await query('SELECT payload FROM selector_state WHERE state_key=$1',[id]);return r?.rows?.[0]?.payload||null}
  return{putSelectorSnapshot,getSelectorSnapshot,listSelectorSnapshots,putSelectorRaw,getSelectorRaw,putSelectorTransition,listSelectorTransitions,putSelectorOutcome,getSelectorOutcome,listSelectorOutcomes,putSelectorStats,getSelectorStats,putSelectorEvidence,getSelectorEvidence,listSelectorEvidence,putState,getState};
}
module.exports={createPostgresSelectorStore};

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulseOutcomeRecorder=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
const KEY='pulse_signal_outcomes_v1';
const HORIZONS=Object.freeze([5,10,20,50]);
function safeParse(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function defaultStorage(){return typeof localStorage!=='undefined'?localStorage:null}
function makeId(s){const t=Number(s.asOfTime||s.createdAt||Date.now());return[s.symbol||'NA',s.tf||'NA',t,s.pattern||'none',s.bias||'neutral'].join(':')}
function read(storage=defaultStorage()){if(!storage)return[];return safeParse(storage.getItem(KEY))}
function write(rows,storage=defaultStorage()){if(storage)storage.setItem(KEY,JSON.stringify(rows.slice(-2000)));return rows}
function immutableSnapshot(snapshot){const frozen={...snapshot,id:snapshot.id||makeId(snapshot),createdAt:Number(snapshot.createdAt||Date.now())};if(snapshot.features&&typeof snapshot.features==='object')frozen.features={...snapshot.features};if(snapshot.provenance&&typeof snapshot.provenance==='object')frozen.provenance={...snapshot.provenance};if(snapshot.flow&&typeof snapshot.flow==='object')frozen.flow={...snapshot.flow};return frozen}
function recordSnapshot(snapshot,storage=defaultStorage()){const rows=read(storage),frozen=immutableSnapshot(snapshot);const existing=rows.find(x=>x.snapshot?.id===frozen.id);if(existing)return existing.snapshot;rows.push({snapshot:frozen,outcomes:{}});write(rows,storage);return frozen}
function attachOutcome(id,horizon,outcome,storage=defaultStorage()){const rows=read(storage),row=rows.find(x=>x.snapshot?.id===id);if(!row)return null;const key=String(horizon);if(row.outcomes?.[key])return row.outcomes[key];row.outcomes={...(row.outcomes||{}),[key]:{...outcome,resolvedAt:Number(outcome.resolvedAt||Date.now())}};write(rows,storage);return row.outcomes[key]}
function matchesSnapshot(s={},filters={}){for(const key of ['symbol','tf','pattern','regime','venue','bias']){if(filters[key]!=null&&s[key]!==filters[key])return false}return true}
function list(filters={},storage=defaultStorage()){return read(storage).filter(x=>matchesSnapshot(x.snapshot||{},filters))}
function resolvedSamples({horizon='20',symbol,tf,pattern,regime,venue,bias}={},storage=defaultStorage()){return list({symbol,tf,pattern,regime,venue,bias},storage).map(x=>{const o=x.outcomes?.[String(horizon)],score=Number(x.snapshot?.modelScore);if(!o||!Number.isFinite(score))return null;return{score,probability:Math.max(0,Math.min(1,score/100)),outcome:o.success?1:0,returnPct:Number(o.returnPct),id:x.snapshot?.id,atMs:Number(x.snapshot?.asOfTime||x.snapshot?.createdAt)||null,pattern:x.snapshot?.pattern||null,regime:x.snapshot?.regime||null,venue:x.snapshot?.venue||null,bias:x.snapshot?.bias||null,features:x.snapshot?.features||null};}).filter(Boolean)}
function unresolvedHorizons(row){return HORIZONS.filter(h=>!row?.outcomes?.[String(h)])}
function clear(storage=defaultStorage()){if(storage)storage.removeItem(KEY)}
return{KEY,HORIZONS,makeId,read,recordSnapshot,attachOutcome,list,resolvedSamples,unresolvedHorizons,clear};
});

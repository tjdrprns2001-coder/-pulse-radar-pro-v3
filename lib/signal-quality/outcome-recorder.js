(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulseOutcomeRecorder=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
const KEY='pulse_signal_outcomes_v1';
function safeParse(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function defaultStorage(){return typeof localStorage!=='undefined'?localStorage:null}
function makeId(s){const t=Number(s.asOfTime||s.createdAt||Date.now());return[s.symbol||'NA',s.tf||'NA',t,s.pattern||'none',s.bias||'neutral'].join(':')}
function read(storage=defaultStorage()){if(!storage)return[];return safeParse(storage.getItem(KEY))}
function write(rows,storage=defaultStorage()){if(storage)storage.setItem(KEY,JSON.stringify(rows.slice(-2000)));return rows}
function recordSnapshot(snapshot,storage=defaultStorage()){const rows=read(storage),frozen={...snapshot,id:snapshot.id||makeId(snapshot),createdAt:Number(snapshot.createdAt||Date.now())};const existing=rows.find(x=>x.snapshot?.id===frozen.id);if(existing)return existing.snapshot;rows.push({snapshot:frozen,outcomes:{}});write(rows,storage);return frozen}
function attachOutcome(id,horizon,outcome,storage=defaultStorage()){const rows=read(storage),row=rows.find(x=>x.snapshot?.id===id);if(!row)return null;const key=String(horizon);if(row.outcomes?.[key])return row.outcomes[key];row.outcomes={...(row.outcomes||{}),[key]:{...outcome,resolvedAt:Number(outcome.resolvedAt||Date.now())}};write(rows,storage);return row.outcomes[key]}
function list({symbol,tf}={},storage=defaultStorage()){return read(storage).filter(x=>(!symbol||x.snapshot?.symbol===symbol)&&(!tf||x.snapshot?.tf===tf))}
function resolvedSamples({horizon='20',symbol,tf}={},storage=defaultStorage()){return list({symbol,tf},storage).map(x=>{const o=x.outcomes?.[String(horizon)],score=Number(x.snapshot?.modelScore);if(!o||!Number.isFinite(score))return null;return{score,probability:Math.max(0,Math.min(1,score/100)),outcome:o.success?1:0,returnPct:Number(o.returnPct),id:x.snapshot?.id};}).filter(Boolean)}
function clear(storage=defaultStorage()){if(storage)storage.removeItem(KEY)}
return{KEY,makeId,read,recordSnapshot,attachOutcome,list,resolvedSamples,clear};
});

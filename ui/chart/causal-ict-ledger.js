(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseCausalIctLedger=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const VERSION='CAUSAL_ICT_LEDGER_v1',STORAGE_KEY='pulse_causal_ict_ledger_v1',MAX_RUNS=120,MAX_EVENTS=5000;
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
function emptyDb(){return{version:VERSION,updatedAt:null,runs:[],events:[]}}
function norm(db){const x=db&&typeof db==='object'?db:{};return{version:VERSION,updatedAt:Number(x.updatedAt)||null,runs:Array.isArray(x.runs)?x.runs:[],events:Array.isArray(x.events)?x.events:[]}}
function fingerprint(e){return[e?.event_type,e?.bar_index,JSON.stringify(e?.payload||{})].join('|')}
function createMemoryStore(initial=emptyDb()){let db=norm(initial);return{read(){return clone(db)},write(v){db=norm(v);return true},clear(){db=emptyDb()}}}
function createLocalStorageStore(storage,key=STORAGE_KEY){if(!storage)throw new Error('storage required');const read=()=>{try{return norm(JSON.parse(storage.getItem(key)||'null'))}catch{return emptyDb()}};return{read(){return clone(read())},write(v){storage.setItem(key,JSON.stringify(norm(v)));return true},clear(){storage.removeItem(key)}}}
function record({store,symbol,timeframe='4h',result,now=Date.now()}={}){
 if(!store||!result)throw new Error('store and result required');const db=store.read(),sym=String(symbol||'').toUpperCase(),tf=String(timeframe||'4h'),prior=db.runs.filter(x=>x.symbol===sym&&x.timeframe===tf&&x.specHash===result.spec_hash).sort((a,b)=>b.recordedAt-a.recordedAt)[0]||null;
 const currentEvents=(result.events||[]).map(e=>({...clone(e),fingerprint:fingerprint(e),symbol:sym,timeframe:tf,specHash:result.spec_hash}));
 let prefixInvariant=true,firstDivergence=null;
 if(prior){const priorEvents=db.events.filter(e=>e.runId===prior.id),limit=Math.min(prior.bars,result.bars)-1;const a=priorEvents.filter(e=>e.bar_index<=limit).map(e=>e.fingerprint),b=currentEvents.filter(e=>e.bar_index<=limit).map(e=>e.fingerprint),len=Math.max(a.length,b.length);for(let i=0;i<len;i++)if(a[i]!==b[i]){prefixInvariant=false;firstDivergence={index:i,prior:a[i]||null,current:b[i]||null};break}}
 const id=[sym,tf,result.spec_hash,result.bars,now].join(':');
 const run={id,symbol:sym,timeframe:tf,specHash:result.spec_hash,engineVersion:result.engine_version,bars:result.bars,recordedAt:now,prefixInvariant,firstDivergence,contractPass:result.contract?.pass!==false,sequence:clone(result.sequence)};
 const runs=[run,...db.runs].slice(0,MAX_RUNS),keep=new Set(runs.map(x=>x.id)),events=[...currentEvents.map(e=>({...e,runId:id})),...db.events.filter(e=>keep.has(e.runId))].slice(0,MAX_EVENTS);
 store.write({version:VERSION,updatedAt:now,runs,events});return run;
}
function latest({store,symbol,timeframe='4h'}={}){const db=store.read(),sym=String(symbol||'').toUpperCase();return db.runs.filter(x=>x.symbol===sym&&x.timeframe===timeframe).sort((a,b)=>b.recordedAt-a.recordedAt)[0]||null}
return{VERSION,STORAGE_KEY,emptyDb,createMemoryStore,createLocalStorageStore,record,latest,fingerprint};
});
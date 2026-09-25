(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseSnapshotStructureCache=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const VERSION='snapshot-structure-cache.v1',TTL_MS=75000,MAX_MEMORY=16,MAX_SESSION=10,SESSION_PREFIX='pulse.snapshot.structure.v1:',SESSION_INDEX='pulse.snapshot.structure.index.v1';
  function hostWindow(){try{if(root?.top&&root?.location&&root.top.location.origin===root.location.origin)return root.top}catch{}return root}
  const host=hostWindow()||root||{};
  const registry=host.__pulseSnapshotStructureRegistryV1||(host.__pulseSnapshotStructureRegistryV1={memory:new Map(),inflight:new Map(),hits:0,misses:0,network:0});
  const memory=registry.memory,inflight=registry.inflight;
  const now=()=>Date.now();
  const cleanSymbol=v=>String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')||'BTCUSDT';
  const cleanTf=v=>String(v||'4h').trim().toLowerCase();
  const cleanLimit=v=>Math.max(80,Math.min(1000,Number(v)||600));
  function keyFor({symbol,interval,limit=600}={}){return cleanSymbol(symbol)+':'+cleanTf(interval)+':'+cleanLimit(limit)}
  function storage(){try{return root?.sessionStorage||null}catch{return null}}
  function valid(row,ttl=TTL_MS){return !!row&&row.data&&now()-Number(row.ts||0)<ttl}
  function touchMemory(key,row){memory.delete(key);memory.set(key,row);while(memory.size>MAX_MEMORY)memory.delete(memory.keys().next().value)}
  function readSession(key,ttl=TTL_MS){const s=storage();if(!s)return null;try{const raw=s.getItem(SESSION_PREFIX+key);if(!raw)return null;const row=JSON.parse(raw);if(valid(row,ttl))return row;s.removeItem(SESSION_PREFIX+key)}catch{}return null}
  function readIndex(){const s=storage();if(!s)return[];try{const x=JSON.parse(s.getItem(SESSION_INDEX)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
  function writeSession(key,row){const s=storage();if(!s)return;try{s.setItem(SESSION_PREFIX+key,JSON.stringify(row));const index=readIndex().filter(x=>x&&x.key!==key);index.unshift({key,ts:row.ts});for(const old of index.slice(MAX_SESSION))try{s.removeItem(SESSION_PREFIX+old.key)}catch{}s.setItem(SESSION_INDEX,JSON.stringify(index.slice(0,MAX_SESSION)))}catch{}}
  function peek(opts={},ttl=TTL_MS){const key=keyFor(opts),mem=memory.get(key);if(valid(mem,ttl)){registry.hits++;touchMemory(key,mem);return mem.data}if(mem)memory.delete(key);const row=readSession(key,ttl);if(row){registry.hits++;touchMemory(key,row);return row.data}registry.misses++;return null}
  async function fetchStructure({symbol,interval,limit=600,force=false,ttl=TTL_MS,fetchImpl}={}){
    const opts={symbol:cleanSymbol(symbol),interval:cleanTf(interval),limit:cleanLimit(limit)},key=keyFor(opts);
    if(!force){const cached=peek(opts,ttl);if(cached)return cached;if(inflight.has(key))return inflight.get(key)}
    const f=fetchImpl||(typeof root?.fetch==='function'?root.fetch.bind(root):typeof fetch==='function'?fetch:null);if(!f)throw new Error('fetch unavailable');
    const task=(async()=>{registry.network++;const u='/api/structure?symbol='+encodeURIComponent(opts.symbol)+'&interval='+encodeURIComponent(opts.interval)+'&limit='+opts.limit;const res=await f(u,{cache:'no-store'});let data;try{data=await res.json()}catch{throw new Error('Structure response parse failed')}if(!res.ok||!data?.ok)throw new Error(data?.error||('Structure HTTP '+res.status));const row={ts:now(),data,version:VERSION};touchMemory(key,row);writeSession(key,row);return data})().finally(()=>{if(inflight.get(key)===task)inflight.delete(key)});
    inflight.set(key,task);return task
  }
  function clearSymbol(symbol){const s=cleanSymbol(symbol),prefix=s+':';for(const key of [...memory.keys()])if(key.startsWith(prefix))memory.delete(key);for(const key of [...inflight.keys()])if(key.startsWith(prefix))inflight.delete(key);const st=storage();if(st){try{const keep=[];for(const row of readIndex()){if(row?.key?.startsWith(prefix))st.removeItem(SESSION_PREFIX+row.key);else keep.push(row)}st.setItem(SESSION_INDEX,JSON.stringify(keep))}catch{}}}
  function clearAll(){memory.clear();inflight.clear();const st=storage();if(st){try{for(const row of readIndex())if(row?.key)st.removeItem(SESSION_PREFIX+row.key);st.removeItem(SESSION_INDEX)}catch{}}}
  function stats(){return{version:VERSION,ttlMs:TTL_MS,memoryEntries:memory.size,inflight:inflight.size,hits:registry.hits,misses:registry.misses,network:registry.network}}
  function resetForTests(){clearAll();registry.hits=0;registry.misses=0;registry.network=0}
  return{VERSION,TTL_MS,keyFor,peek,fetchStructure,clearSymbol,clearAll,stats,_resetForTests:resetForTests};
});
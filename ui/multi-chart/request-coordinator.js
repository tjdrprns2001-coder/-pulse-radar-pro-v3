(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseRequestCoordinator=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function createRequestCoordinator({fetcher,ttlMs=15000}={}){
    if(typeof fetcher!=='function')throw new Error('fetcher required');
    const cache=new Map(),pending=new Map();
    const key=(s,t)=>`${String(s||'').toUpperCase()}|${String(t||'')}`;
    async function load(symbol,timeframe){const k=key(symbol,timeframe),now=Date.now(),hit=cache.get(k);if(hit&&now-hit.at<ttlMs)return hit.value;if(pending.has(k))return pending.get(k);const p=Promise.resolve().then(()=>fetcher(symbol,timeframe)).then(v=>{cache.set(k,{at:Date.now(),value:v});pending.delete(k);return v},e=>{pending.delete(k);cache.delete(k);throw e});pending.set(k,p);return p}
    function clear(){cache.clear();pending.clear()}
    function invalidate(symbol,timeframe){const k=key(symbol,timeframe);cache.delete(k);pending.delete(k)}
    return{load,clear,invalidate};
  }
  return{createRequestCoordinator};
});
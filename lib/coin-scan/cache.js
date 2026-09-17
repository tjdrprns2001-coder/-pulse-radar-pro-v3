'use strict';
function createTtlCache({now=()=>Date.now()}={}){
  const store=new Map();
  return{
    get(key){const hit=store.get(key);if(!hit)return null;if(hit.expiresAt<=now()){store.delete(key);return null}return hit.value},
    set(key,value,ttlMs){store.set(key,{value,expiresAt:now()+Math.max(0,Number(ttlMs)||0)});return value},
    delete(key){return store.delete(key)},
    clear(){store.clear()}
  };
}
module.exports={createTtlCache};

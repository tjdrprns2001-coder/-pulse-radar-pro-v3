'use strict';
function createTtlCache({now=Date.now}={}){
  const m=new Map();
  return{
    get(k){const e=m.get(k);if(!e)return undefined;if(e.expiresAt<=now()){m.delete(k);return undefined}return e.value},
    set(k,value,ttlMs){m.set(k,{value,expiresAt:now()+Math.max(0,Number(ttlMs)||0)});return value},
    delete:k=>m.delete(k),clear:()=>m.clear()
  };
}
module.exports={createTtlCache};

(function(root,factory){
  const Contract=typeof module==='object'&&module.exports?require('./contract.js'):root?.PulseBookAiContract;
  const api=factory(Contract);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Contract){'use strict';
if(!Contract)throw new Error('PulseBookAiContract required');
const VERSION='BOOK_AI_STORAGE_v1';
const KEY='pulse_book_ai_lifecycle_v1';
const MAX_SYMBOLS=100;
Contract.assertBookStorageKey(KEY);
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function empty(){return{version:VERSION,items:{}}}
function create(storage,key=KEY){
  Contract.assertBookStorageKey(key);
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error('storage adapter required');
  function read(){try{const x=JSON.parse(storage.getItem(key)||'null');return x&&x.version===VERSION&&x.items&&typeof x.items==='object'?x:empty()}catch{return empty()}}
  function write(db){storage.setItem(key,JSON.stringify(db));return true}
  function get(symbol){const s=String(symbol||'').toUpperCase();return clone(read().items[s]||null)}
  function set(symbol,lifecycle){
    const s=String(symbol||'').toUpperCase();if(!s)throw new Error('symbol required');
    const db=read();db.items[s]={lifecycle:clone(lifecycle),updatedAt:Number(lifecycle?.analysisAsOf)||Date.now()};
    const rows=Object.entries(db.items).sort((a,b)=>Number(b[1]?.updatedAt||0)-Number(a[1]?.updatedAt||0)).slice(0,MAX_SYMBOLS);
    db.items=Object.fromEntries(rows);write(db);return get(s);
  }
  function clear(symbol){const s=String(symbol||'').toUpperCase(),db=read();delete db.items[s];write(db);return true}
  return{read,get,set,clear,key};
}
return{VERSION,KEY,MAX_SYMBOLS,create};
});
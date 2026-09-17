'use strict';
const VALID=new Set(['ok','degraded','down']);
function createHealthTracker({now=()=>Date.now(),initial={}}={}){
  const modules={};
  for(const [name,value] of Object.entries(initial||{})){const status=VALID.has(value?.status)?value.status:'ok';modules[name]={status,detail:value?.detail??null,updatedAt:Number(value?.updatedAt)||now()}}
  function mark(module,status,detail=null){const name=String(module||'').trim();if(!name)throw new Error('module required');if(!VALID.has(status))throw new Error('invalid health status');modules[name]={status,detail:detail==null?null:String(detail),updatedAt:now()};return modules[name]}
  function snapshot(){const list=Object.values(modules);const status=list.some(x=>x.status==='down')?'down':list.some(x=>x.status==='degraded')?'degraded':'ok';return{status,updatedAt:now(),modules:JSON.parse(JSON.stringify(modules))}}
  return{mark,snapshot};
}
module.exports={VALID,createHealthTracker};

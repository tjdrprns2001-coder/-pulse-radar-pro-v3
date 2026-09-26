'use strict';

const VERSION='RESEARCH_MODEL_REGISTRY_v2';
const STATES=Object.freeze(['SHADOW','CANDIDATE','VALIDATED','PROMOTED']);

function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function createRegistry(){
  return{version:VERSION,models:[],activeModelId:null,updatedAt:Date.now()};
}
function createEntry({id,type,createdAt=Date.now(),state='SHADOW',metadata={}}={}){
  if(!id||!type)throw new Error('id and type required');
  if(!STATES.includes(state))throw new Error('invalid model state');
  return{id:String(id),type:String(type),state,createdAt,updatedAt:createdAt,metrics:{},metadata:{...metadata},history:[{at:createdAt,state,reason:'created'}]};
}
function metricPass(metrics={},gate={}){
  const checks=[];
  const add=(key,ok,actual,required)=>checks.push({key,ok,actual,required});
  if(n(gate.minLabels)!=null)add('labels',n(metrics.labels)>=n(gate.minLabels),n(metrics.labels),n(gate.minLabels));
  if(n(gate.minPrecision)!=null)add('precision',n(metrics.precision)>=n(gate.minPrecision),n(metrics.precision),n(gate.minPrecision));
  if(n(gate.minRecall)!=null)add('recall',n(metrics.recall)>=n(gate.minRecall),n(metrics.recall),n(gate.minRecall));
  if(n(gate.maxFalsePositiveRate)!=null)add('falsePositiveRate',n(metrics.falsePositiveRate)<=n(gate.maxFalsePositiveRate),n(metrics.falsePositiveRate),n(gate.maxFalsePositiveRate));
  if(n(gate.minMfePct)!=null)add('mfePct',n(metrics.mfePct)>=n(gate.minMfePct),n(metrics.mfePct),n(gate.minMfePct));
  if(n(gate.maxMaePct)!=null)add('maePct',n(metrics.maePct)>=n(gate.maxMaePct),n(metrics.maePct),n(gate.maxMaePct));
  if(n(gate.maxCalibrationError)!=null)add('calibrationError',n(metrics.calibrationError)<=n(gate.maxCalibrationError),n(metrics.calibrationError),n(gate.maxCalibrationError));
  return{ok:checks.every(x=>x.ok),checks};
}
function allowedTransition(from,to){
  const order={SHADOW:0,CANDIDATE:1,VALIDATED:2,PROMOTED:3};
  if(!(from in order)||!(to in order))return false;
  return order[to]===order[from]+1;
}
function promote(entry,to,{metrics={},gate={},reason='gate passed',at=Date.now()}={}){
  if(!allowedTransition(entry.state,to))return{ok:false,error:'INVALID_TRANSITION',entry};
  const check=metricPass(metrics,gate);
  if(!check.ok)return{ok:false,error:'GATE_FAILED',check,entry};
  const next={...entry,state:to,updatedAt:at,metrics:{...entry.metrics,...metrics},history:[...(entry.history||[]),{at,state:to,reason}]};
  return{ok:true,check,entry:next};
}
function upsert(registry,entry){
  const next={...registry,models:[...(registry.models||[])],updatedAt:Date.now()};
  const i=next.models.findIndex(x=>x.id===entry.id);
  if(i>=0)next.models[i]=entry;else next.models.push(entry);
  if(entry.state==='PROMOTED')next.activeModelId=entry.id;
  return next;
}

module.exports={VERSION,STATES,createRegistry,createEntry,metricPass,allowedTransition,promote,upsert};

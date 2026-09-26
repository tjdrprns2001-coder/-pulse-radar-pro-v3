'use strict';

const VERSION='RESEARCH_DATASET_SPLIT_v2';

function ts(row){const v=Number(row?.asOf??row?.capturedAt??row?.labeledAt);return Number.isFinite(v)?v:null}
function chronological(rows=[],{trainRatio=.6,validationRatio=.2,lockedOosStart=null}={}){
  const sorted=rows.filter(r=>ts(r)!=null).slice().sort((a,b)=>ts(a)-ts(b));
  if(!sorted.length)return{version:VERSION,train:[],validation:[],lockedOos:[],boundaries:null};
  if(Number.isFinite(Number(lockedOosStart))){
    const freeze=Number(lockedOosStart),pre=sorted.filter(r=>ts(r)<freeze),oos=sorted.filter(r=>ts(r)>=freeze);
    const cut=Math.max(0,Math.min(pre.length,Math.floor(pre.length*trainRatio/(trainRatio+validationRatio||1))));
    const train=pre.slice(0,cut),validation=pre.slice(cut);
    return{version:VERSION,train,validation,lockedOos:oos,boundaries:{trainEnd:train.length?ts(train.at(-1)):null,validationEnd:validation.length?ts(validation.at(-1)):null,lockedOosStart:freeze}};
  }
  const trainEnd=Math.floor(sorted.length*trainRatio),valEnd=Math.floor(sorted.length*(trainRatio+validationRatio));
  const train=sorted.slice(0,trainEnd),validation=sorted.slice(trainEnd,valEnd),lockedOos=sorted.slice(valEnd);
  return{version:VERSION,train,validation,lockedOos,boundaries:{trainEnd:train.length?ts(train.at(-1)):null,validationEnd:validation.length?ts(validation.at(-1)):null,lockedOosStart:lockedOos.length?ts(lockedOos[0]):null}};
}
function assertNoLeakage(split){
  const max=(rows)=>rows.length?Math.max(...rows.map(ts).filter(Number.isFinite)):null;
  const min=(rows)=>rows.length?Math.min(...rows.map(ts).filter(Number.isFinite)):null;
  const trMax=max(split.train||[]),vaMin=min(split.validation||[]),vaMax=max(split.validation||[]),ooMin=min(split.lockedOos||[]);
  const errors=[];
  if(trMax!=null&&vaMin!=null&&trMax>vaMin)errors.push('TRAIN_AFTER_VALIDATION');
  if(vaMax!=null&&ooMin!=null&&vaMax>ooMin)errors.push('VALIDATION_AFTER_LOCKED_OOS');
  if(trMax!=null&&ooMin!=null&&trMax>ooMin)errors.push('TRAIN_AFTER_LOCKED_OOS');
  return{ok:errors.length===0,errors};
}
function freezeRows(rows=[],freezeAt){
  const freeze=Number(freezeAt);
  if(!Number.isFinite(freeze))throw new Error('freezeAt required');
  return rows.filter(r=>ts(r)!=null&&ts(r)<freeze);
}

module.exports={VERSION,ts,chronological,assertNoLeakage,freezeRows};

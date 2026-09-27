'use strict';

const VERSION='RESEARCH_DATASET_SPLIT_v2';

function ts(row){const raw=row?.asOf??row?.capturedAt??row?.labeledAt;if(raw===null||raw===undefined||raw==='')return null;const v=Number(raw);return Number.isFinite(v)?v:null}
function chronological(rows=[],{trainRatio=.6,validationRatio=.2,lockedOosStart=null}={}){
  const sorted=rows.filter(r=>ts(r)!=null).slice().sort((a,b)=>ts(a)-ts(b));
  if(!sorted.length)return{version:VERSION,train:[],validation:[],lockedOos:[],boundaries:null};
  if(lockedOosStart!==null&&lockedOosStart!==undefined&&lockedOosStart!==''&&Number.isFinite(Number(lockedOosStart))){
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

function labelEnd(row,hours=72){const t=ts(row);return t==null?null:t+hours*3600000}
function purgeBoundary(left=[],right=[],{purgeHours=72,embargoHours=24}={}){
  if(!left.length||!right.length)return{left:left.slice(),right:right.slice(),purged:0,embargoed:0};
  const rightStart=Math.min(...right.map(ts).filter(Number.isFinite));
  const purgeMs=purgeHours*3600000,embargoMs=embargoHours*3600000;
  const keptLeft=left.filter(r=>{const end=labelEnd(r,purgeHours);return end==null||end<rightStart});
  const afterPurge=right.filter(r=>ts(r)>=rightStart+embargoMs);
  return{left:keptLeft,right:afterPurge,purged:left.length-keptLeft.length,embargoed:right.length-afterPurge.length};
}
function purgedChronological(rows=[],opts={}){
  const base=chronological(rows,opts),pHours=Number(opts.purgeHours??72),eHours=Number(opts.embargoHours??24);
  let train=base.train.slice(),validation=base.validation.slice(),lockedOos=base.lockedOos.slice(),purged=0,embargoed=0;
  if(validation.length){const p=purgeBoundary(train,validation,{purgeHours:pHours,embargoHours:eHours});train=p.left;validation=p.right;purged+=p.purged;embargoed+=p.embargoed}
  if(lockedOos.length){const p=purgeBoundary(validation,lockedOos,{purgeHours:pHours,embargoHours:eHours});validation=p.left;lockedOos=p.right;purged+=p.purged;embargoed+=p.embargoed}
  const out={version:'RESEARCH_DATASET_SPLIT_v3',train,validation,lockedOos,boundaries:base.boundaries,purge:{purgeHours:pHours,embargoHours:eHours,purged,embargoed}};
  out.leakage=assertNoLeakage(out);return out;
}

function freezeRows(rows=[],freezeAt){
  if(freezeAt===null||freezeAt===undefined||freezeAt==='')throw new Error('freezeAt required');
  const freeze=Number(freezeAt);
  if(!Number.isFinite(freeze))throw new Error('freezeAt required');
  return rows.filter(r=>ts(r)!=null&&ts(r)<freeze);
}

module.exports={VERSION,ts,chronological,purgedChronological,purgeBoundary,assertNoLeakage,freezeRows,labelEnd};

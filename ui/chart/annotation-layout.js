(function(root,factory){if(typeof module==='object'&&module.exports){module.exports=factory();}else{root.PulseAnnotationLayout=factory();}})(typeof self!=='undefined'?self:this,function(){'use strict';

const MODE_ORDER={
  ict:['SEQUENCE','GRAB','SWEEP','MSS','HTF_TARGET','OTE','FVG','OB','EQH','EQL','CHOCH','BOS','SWING'],
  smc:['MSS','CHOCH','OB','FVG','GRAB','SWEEP','BOS','EQH','EQL','SWING'],
  liquidity:['GRAB','SWEEP','PDH','PDL','HTF_LIQUIDITY','EQH','EQL','SESSION_HIGH','SESSION_LOW','PWH','PWL','VOID','IND','SWING']
};

const VIEWPORT_BUDGETS={
  normal:{structure:999,smc:999,liquidity:999,ict:999,sweepGrab:999,eq:999,pd:999,pw:999,void:999,inducement:999,ictSequence:999},
  focused:{structure:6,smc:5,liquidity:6,ict:4,sweepGrab:4,eq:3,pd:2,pw:2,void:2,inducement:1,ictSequence:1},
  compact:{structure:4,smc:3,liquidity:4,ict:3,sweepGrab:3,eq:2,pd:2,pw:2,void:2,inducement:1,ictSequence:1},
  '4-chart':{structure:3,smc:2,liquidity:3,ict:2,sweepGrab:2,eq:1,pd:2,pw:1,void:1,inducement:1,ictSequence:1}
};

function typeRank(type,mode){const order=MODE_ORDER[mode]||[];const idx=order.indexOf(String(type||'').toUpperCase());return idx<0?0:(order.length-idx)*1000;}
function effectivePriority(candidate,mode){return typeRank(candidate.type,mode)+(Number(candidate.priority)||0);}

function makeBox(c,x,y,offset){const w=Math.max(1,Number(c.width)||1),h=Math.max(1,Number(c.height)||1);const side=c.side||'above';let left=x-w/2,top=y-h-6+(offset||0);if(side==='below')top=y+6+(offset||0);else if(side==='left'){left=x-w-6+(offset||0);top=y-h/2;}else if(side==='right'){left=x+6+(offset||0);top=y-h/2;}else if(side==='band'){left=x-w/2;top=y-h/2+(offset||0);}return{left,right:left+w,top,bottom:top+h,width:w,height:h};}
function intersects(a,b){return !(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);}
function shouldCollide(a,b){if(a.collisionGroup===b.collisionGroup)return true;return Boolean((a.metadata&&a.metadata.crossGroupCollision)||(b.metadata&&b.metadata.crossGroupCollision));}

function capKey(c){const t=String(c.type||'').toUpperCase();if(t==='GRAB'||t==='SWEEP')return'sweepGrab';if(t==='EQH'||t==='EQL')return'eq';if(t==='PDH'||t==='PDL')return'pd';if(t==='PWH'||t==='PWL')return'pw';if(t==='VOID')return'void';if(t==='IND')return'inducement';if(t==='SEQUENCE')return'ictSequence';return c.category||'structure';}

function offsetsFor(c){if(!c.allowOffset)return[0];const max=Math.max(0,Number(c.maxOffset)||0);const out=[0];for(let d=8;d<=max;d+=8){out.push(-d,d);}return out;}

function layoutAnnotations(candidates,context){const ctx=context||{};const mode=ctx.mode||'structure';const viewport=ctx.viewportLevel||'normal';const budget=Object.assign({},VIEWPORT_BUDGETS[viewport]||VIEWPORT_BUDGETS.normal);const xForBar=typeof ctx.xForBar==='function'?ctx.xForBar:(v=>v);const yForPrice=typeof ctx.yForPrice==='function'?ctx.yForPrice:(v=>v);const width=Number(ctx.width)||Infinity,height=Number(ctx.height)||Infinity;
  const ordered=(candidates||[]).map((c,index)=>({c,index,effectivePriority:effectivePriority(c,mode)})).sort((a,b)=>b.effectivePriority-a.effectivePriority||a.index-b.index||String(a.c.id).localeCompare(String(b.c.id)));
  const accepted=[];const visibleIds=[];const hiddenIds=[];const offsets={};const boundingBoxes={};const priorityDecisions=[];const counts={};const visible=[];
  for(const item of ordered){const c=item.c;priorityDecisions.push({id:c.id,type:c.type,category:c.category,effectivePriority:item.effectivePriority});const key=capKey(c);const limit=budget[key]===undefined?(budget[c.category]===undefined?999:budget[c.category]):budget[key];if((counts[key]||0)>=limit){hiddenIds.push(c.id);continue;}const x=Number(xForBar(c.barIndex)),y=Number(yForPrice(c.price));let chosen=null,chosenOffset=0;for(const off of offsetsFor(c)){const box=makeBox(c,x,y,off);if(box.right<0||box.left>width||box.bottom<0||box.top>height)continue;let blocked=false;for(const other of accepted){if(shouldCollide(c,other.c)&&intersects(box,other.box)){blocked=true;break;}}if(!blocked){chosen=box;chosenOffset=off;break;}}
    if(!chosen){hiddenIds.push(c.id);continue;}counts[key]=(counts[key]||0)+1;accepted.push({c,box:chosen});visibleIds.push(c.id);offsets[c.id]=chosenOffset;boundingBoxes[c.id]=chosen;visible.push(Object.assign({},c,{offset:chosenOffset,bounds:chosen}));
  }
  return{visibleIds,hiddenIds,offsets,boundingBoxes,priorityDecisions,viewportBudget:budget,visible};
}

return{layoutAnnotations,intersects,effectivePriority,getViewportBudget:(level)=>Object.assign({},VIEWPORT_BUDGETS[level]||VIEWPORT_BUDGETS.normal)};
});
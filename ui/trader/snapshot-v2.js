(()=>{'use strict';
const STORE='pulse.snapshot.v2.records',REV='pulse.snapshot.v2.revisions';
const $=id=>document.getElementById(id);
const C=()=>window.PulseSnapshotBoardV2Context;
let tool='select',drawings=[],undo=[],redo=[],liveLayer=false,selected=null,start=null,lastKey='';
const canvas=()=>C()?.getCanvas?.(),overlay=()=>$('snapshotOverlay');
function record(){return C()?.getCurrentRecord?.()||null}
function candles(){return record()?.candles||[]}
function bounds(){const rows=candles();if(!rows.length)return null;const lo=Math.min(...rows.map(x=>Number(x.low))),hi=Math.max(...rows.map(x=>Number(x.high))),t0=Number(rows[0].time),t1=Number(rows.at(-1).time);return{lo,hi,t0,t1}}
function toChart(px,py){const cv=overlay(),b=bounds();if(!cv||!b)return null;const r=cv.getBoundingClientRect(),x=(px-r.left)/r.width,y=(py-r.top)/r.height;return{time:b.t0+(b.t1-b.t0)*x,price:b.hi-(b.hi-b.lo)*y}}
function toPixel(p){const cv=overlay(),b=bounds();if(!cv||!b)return null;return{x:(Number(p.time)-b.t0)/(b.t1-b.t0||1)*cv.width,y:(b.hi-Number(p.price))/(b.hi-b.lo||1)*cv.height}}
function snap(){undo.push(JSON.stringify(drawings));if(undo.length>50)undo.shift();redo=[]}
function storageKey(){const rec=record();return STORE+':'+(rec?.symbol||C()?.getSymbol?.()||'NA')+':'+(rec?.timeframe||C()?.getCurrentTf?.()||'NA')}
function revisionKey(){const rec=record();return REV+':'+(rec?.symbol||'NA')+':'+(rec?.timeframe||'NA')}
function saveLocal(){try{localStorage.setItem(storageKey(),JSON.stringify(drawings))}catch{}}
function loadLocal(){try{drawings=JSON.parse(localStorage.getItem(storageKey())||'[]');if(!Array.isArray(drawings))drawings=[]}catch{drawings=[]}undo=[];redo=[];selected=null;lastKey=storageKey()}
function newId(){return 'd_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
function render(){
 const cv=overlay();if(!cv)return;const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);
 for(const d of drawings){if(d.hidden)continue;ctx.save();ctx.lineWidth=d.style?.lineWidth||2;ctx.strokeStyle=d.style?.color||'#5aa2ff';ctx.fillStyle=d.style?.fillColor||'rgba(90,162,255,.12)';if(d.locked)ctx.setLineDash([8,6]);
  if(d.type==='horizontal'){const a=toPixel({time:bounds()?.t0,price:d.price}),b=toPixel({time:bounds()?.t1,price:d.price});if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
  if(d.type==='trendline'||d.type==='arrow'){const a=toPixel(d.points?.[0]),b=toPixel(d.points?.[1]);if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();if(d.type==='arrow'){const ang=Math.atan2(b.y-a.y,b.x-a.x),len=14;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(ang-.45),b.y-len*Math.sin(ang-.45));ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(ang+.45),b.y-len*Math.sin(ang+.45));ctx.stroke()}}}
  if(d.type==='rectangle'){const a=toPixel(d.points?.[0]),b=toPixel(d.points?.[1]);if(a&&b){ctx.globalAlpha=.18;ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));ctx.globalAlpha=1;ctx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y))}}
  if(d.type==='text'){const p=toPixel(d.point);if(p){ctx.font='600 18px system-ui';ctx.fillStyle=d.style?.color||'#e8f1fb';ctx.fillText(d.text||'메모',p.x,p.y)}}
  if(d.id===selected){ctx.strokeStyle='#ffd166';ctx.lineWidth=2;const pts=d.points||[d.point].filter(Boolean);for(const p of pts){const q=toPixel(p);if(q){ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.stroke()}}}
  ctx.restore();
 }
 $('drawingCount').textContent=String(drawings.length);$('snapshotV2State').textContent=liveLayer?'🟢 실시간 레이어 표시':'🧊 원본 분석 고정';
}
function commit(d){snap();drawings.push(d);selected=d.id;saveLocal();render()}
function nearest(px,py){let best=null,dist=20;for(const d of drawings){if(d.hidden)continue;const pts=d.type==='horizontal'?[{time:bounds()?.t0,price:d.price},{time:bounds()?.t1,price:d.price}]:(d.points||[d.point].filter(Boolean));for(const p of pts){const q=toPixel(p);if(!q)continue;const dd=Math.hypot(q.x-px,q.y-py);if(dd<dist){dist=dd;best=d}}}return best}
function pointer(e){
 const cv=overlay(),r=cv.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*cv.width,py=(e.clientY-r.top)/r.height*cv.height,p=toChart(e.clientX,e.clientY);if(!p)return;
 if(e.type==='pointerdown'){
   if(tool==='select'){const hit=nearest(px,py);selected=hit?.id||null;render();return}
   if(tool==='horizontal'){commit({id:newId(),type:'horizontal',price:p.price,createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#5aa2ff',lineWidth:2}});return}
   if(tool==='text'){const text=prompt('차트 메모','메모');if(text)commit({id:newId(),type:'text',point:p,text,createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#e8f1fb'}});return}
   start=p;cv.setPointerCapture?.(e.pointerId);
 }
 if(e.type==='pointerup'&&start){const end=p;if(tool==='trendline'||tool==='arrow')commit({id:newId(),type:tool,points:[start,end],createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#5aa2ff',lineWidth:2}});if(tool==='rectangle')commit({id:newId(),type:'rectangle',points:[start,end],role:'analysis-zone',createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#5aa2ff',fillColor:'#5aa2ff',lineWidth:2}});start=null}
}
function undoFn(){if(!undo.length)return;redo.push(JSON.stringify(drawings));drawings=JSON.parse(undo.pop());saveLocal();render()}
function redoFn(){if(!redo.length)return;undo.push(JSON.stringify(drawings));drawings=JSON.parse(redo.pop());saveLocal();render()}
function del(){if(!selected)return;snap();drawings=drawings.filter(x=>x.id!==selected);selected=null;saveLocal();render()}
function lock(){const d=drawings.find(x=>x.id===selected);if(!d)return;snap();d.locked=!d.locked;saveLocal();render()}
function hide(){const d=drawings.find(x=>x.id===selected);if(!d)return;snap();d.hidden=!d.hidden;saveLocal();render()}
function snapshotPayload(){
 const rec=record();if(!rec)return null;return{schemaVersion:2,id:'snap_'+Date.now(),createdAt:new Date().toISOString(),capturedAt:rec.confirmedBarTime,market:{venue:'binance',symbol:rec.symbol,marketType:'perpetual',timeframe:rec.timeframe},lastCandleClosed:true,source:{provider:'binance',dataVersion:rec.engineVersion||null,fetchedAt:new Date().toISOString()},candles:rec.candles,indicators:[],drawings:JSON.parse(JSON.stringify(drawings)),markers:[],note:$('snapshotNote')?.value||'',liveLayerEnabled:liveLayer,originalSnapshotId:rec.snapshotId};
}
function exportJson(){const p=snapshotPayload();if(!p)return;const a=document.createElement('a'),u=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}));a.href=u;a.download=p.market.symbol+'-'+p.market.timeframe+'-snapshot-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
function saveRevision(){const p=snapshotPayload();if(!p)return;let arr=[];try{arr=JSON.parse(localStorage.getItem(revisionKey())||'[]')}catch{};arr.unshift({...p,revision:(arr[0]?.revision||0)+1});arr=arr.slice(0,30);localStorage.setItem(revisionKey(),JSON.stringify(arr));$('snapshotV2State').textContent='✅ 수정본 '+arr[0].revision+' 저장'}
async function exportPng(){const base=canvas(),ov=overlay();if(!base||!ov)return;const out=document.createElement('canvas');out.width=base.width;out.height=base.height;const ctx=out.getContext('2d');ctx.drawImage(base,0,0);ctx.drawImage(ov,0,0,out.width,out.height);out.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=(C()?.getSymbol?.()||'snapshot')+'-'+(C()?.getCurrentTf?.()||'tf')+'-annotated.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),500)},'image/png')}
function bind(){
 const base=canvas(),ov=overlay();if(!base||!ov)return false;ov.width=base.width;ov.height=base.height;['pointerdown','pointerup'].forEach(ev=>ov.addEventListener(ev,pointer));
 document.querySelectorAll('[data-draw-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.drawTool;document.querySelectorAll('[data-draw-tool]').forEach(x=>x.classList.toggle('active',x===b))});
 $('drawUndo').onclick=undoFn;$('drawRedo').onclick=redoFn;$('drawDelete').onclick=del;$('drawLock').onclick=lock;$('drawHide').onclick=hide;
 $('saveSnapshotJson').onclick=exportJson;$('saveSnapshotRevision').onclick=saveRevision;$('saveAnnotatedPng').onclick=exportPng;$('toggleLiveLayer').onclick=()=>{liveLayer=!liveLayer;render()};
 loadLocal();render();window.addEventListener('resize',render);const title=$('chartTitle');if(title)new MutationObserver(()=>{const k=storageKey();if(k!==lastKey){loadLocal();render()}}).observe(title,{childList:true,subtree:true,characterData:true});return true
}
function boot(){if(bind())return;setTimeout(boot,300)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
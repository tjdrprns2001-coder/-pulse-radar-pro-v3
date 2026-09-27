(()=>{'use strict';
const STORE='pulse.snapshot.v2.records',REV='pulse.snapshot.v2.revisions',PAD=58,VISIBLE=140;
const $=id=>document.getElementById(id),C=()=>window.PulseSnapshotBoardV2Context;
let tool='select',drawings=[],undo=[],redo=[],liveLayer=false,selected=null,start=null,lastKey='',drag=null,restored=null;
const canvas=()=>C()?.getCanvas?.(),overlay=()=>$('snapshotOverlay'),record=()=>C()?.getCurrentRecord?.()||null;
function visibleCandles(){const rows=(restored?.candles||record()?.candles||[]);return rows.slice(-VISIBLE)}
function bounds(){const rows=visibleCandles();if(!rows.length)return null;const lo=Math.min(...rows.map(x=>Number(x.low))),hi=Math.max(...rows.map(x=>Number(x.high))),t0=Number(rows[0].time),t1=Number(rows.at(-1).time);return{lo,hi,t0,t1}}
function toChart(px,py){const cv=overlay(),b=bounds();if(!cv||!b)return null;const r=cv.getBoundingClientRect(),cx=(px-r.left)/r.width*cv.width,cy=(py-r.top)/r.height*cv.height,x=Math.max(PAD,Math.min(cv.width-PAD,cx)),y=Math.max(PAD,Math.min(cv.height-PAD,cy));return{time:b.t0+(b.t1-b.t0)*((x-PAD)/(cv.width-PAD*2)),price:b.hi-(b.hi-b.lo)*((y-PAD)/(cv.height-PAD*2))}}
function toPixel(p){const cv=overlay(),b=bounds();if(!cv||!b)return null;return{x:PAD+(Number(p.time)-b.t0)/(b.t1-b.t0||1)*(cv.width-PAD*2),y:PAD+(b.hi-Number(p.price))/(b.hi-b.lo||1)*(cv.height-PAD*2)}}
function deep(v){return JSON.parse(JSON.stringify(v))}
function snap(){undo.push(JSON.stringify(drawings));if(undo.length>60)undo.shift();redo=[]}
function storageKey(){const rec=record();return STORE+':'+(rec?.symbol||C()?.getSymbol?.()||'NA')+':'+(rec?.timeframe||C()?.getCurrentTf?.()||'NA')}
function revisionKey(){const rec=record();return REV+':'+(rec?.symbol||C()?.getSymbol?.()||'NA')+':'+(rec?.timeframe||C()?.getCurrentTf?.()||'NA')}
function saveLocal(){try{localStorage.setItem(storageKey(),JSON.stringify(drawings))}catch{}}
function loadLocal(){try{drawings=JSON.parse(localStorage.getItem(storageKey())||'[]');if(!Array.isArray(drawings))drawings=[]}catch{drawings=[]}undo=[];redo=[];selected=null;lastKey=storageKey();restored=null;refreshRevisions()}
function newId(){return 'd_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
function pts(d){if(d.type==='horizontal')return[{time:bounds()?.t0,price:d.price},{time:bounds()?.t1,price:d.price}];if(d.type==='vertical')return[{time:d.time,price:bounds()?.lo},{time:d.time,price:bounds()?.hi}];return d.points||[d.point].filter(Boolean)}
function drawOne(ctx,d){
 ctx.save();ctx.lineWidth=d.style?.lineWidth||2;ctx.strokeStyle=d.style?.color||'#5aa2ff';ctx.fillStyle=d.style?.fillColor||'rgba(90,162,255,.12)';if(d.locked)ctx.setLineDash([8,6]);
 if(d.type==='horizontal'){const a=toPixel({time:bounds()?.t0,price:d.price}),b=toPixel({time:bounds()?.t1,price:d.price});if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
 if(d.type==='vertical'){const a=toPixel({time:d.time,price:bounds()?.lo}),b=toPixel({time:d.time,price:bounds()?.hi});if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
 if(d.type==='trendline'||d.type==='arrow'){const a=toPixel(d.points?.[0]),b=toPixel(d.points?.[1]);if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();if(d.type==='arrow'){const ang=Math.atan2(b.y-a.y,b.x-a.x),len=14;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(ang-.45),b.y-len*Math.sin(ang-.45));ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(ang+.45),b.y-len*Math.sin(ang+.45));ctx.stroke()}}}
 if(d.type==='rectangle'){const a=toPixel(d.points?.[0]),b=toPixel(d.points?.[1]);if(a&&b){ctx.globalAlpha=.16;ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));ctx.globalAlpha=1;ctx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y))}}
 if(d.type==='text'){const p=toPixel(d.point);if(p){ctx.font='600 18px system-ui';ctx.fillStyle=d.style?.color||'#e8f1fb';ctx.fillText(d.text||'메모',p.x,p.y)}}
 if(d.id===selected){ctx.strokeStyle='#ffd166';ctx.lineWidth=2;for(const p of pts(d)){const q=toPixel(p);if(q){ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.stroke()}}}
 ctx.restore();
}
function render(){
 const cv=overlay();if(!cv)return;const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);
 if(liveLayer){const cap=Number(restored?.capturedAt||0);if(cap){const q=toPixel({time:cap,price:bounds()?.hi});if(q){ctx.save();ctx.strokeStyle='#39d6a3';ctx.setLineDash([8,5]);ctx.beginPath();ctx.moveTo(q.x,PAD);ctx.lineTo(q.x,cv.height-PAD);ctx.stroke();ctx.fillStyle='#7ee2b8';ctx.font='bold 14px system-ui';ctx.fillText('분석 기준 시각 | 이후 실시간 영역',Math.max(PAD,q.x-160),PAD+18);ctx.restore()}}}
 for(const d of drawings)if(!d.hidden)drawOne(ctx,d);
 $('drawingCount').textContent=String(drawings.length);$('snapshotV2State').textContent=restored?'🧊 저장본 복원 중':liveLayer?'🟢 실시간 레이어 표시':'🧊 원본 분석 고정';renderMeta()
}
function distSeg(px,py,a,b){const vx=b.x-a.x,vy=b.y-a.y,l=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((px-a.x)*vx+(py-a.y)*vy)/l)),x=a.x+t*vx,y=a.y+t*vy;return Math.hypot(px-x,py-y)}
function hit(px,py){let best=null,dist=18,handle=-1;for(const d of drawings){if(d.hidden)continue;const pp=pts(d).map(toPixel).filter(Boolean);pp.forEach((q,i)=>{const z=Math.hypot(px-q.x,py-q.y);if(z<dist){dist=z;best=d;handle=i}});if(d.type==='rectangle'&&pp.length===2){const [a,b]=pp,inside=px>=Math.min(a.x,b.x)&&px<=Math.max(a.x,b.x)&&py>=Math.min(a.y,b.y)&&py<=Math.max(a.y,b.y);if(inside&&dist>10){best=d;handle=-1;dist=10}}else if(pp.length>=2){const z=distSeg(px,py,pp[0],pp[1]);if(z<dist){dist=z;best=d;handle=-1}}}return best?{d:best,handle}:null}
function shiftPoint(p,dt,dp){return{time:Number(p.time)+dt,price:Number(p.price)+dp}}
function pointer(e){const cv=overlay(),r=cv.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*cv.width,py=(e.clientY-r.top)/r.height*cv.height,p=toChart(e.clientX,e.clientY);if(!p)return;
 if(e.type==='pointerdown'){
  if(tool==='select'){const h=hit(px,py);selected=h?.d?.id||null;if(h?.d&&!h.d.locked){snap();drag={id:h.d.id,handle:h.handle,start:p,original:deep(h.d)}}render();return}
  if(tool==='horizontal'){commit({id:newId(),type:'horizontal',price:p.price,createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#5aa2ff',lineWidth:2}});return}
  if(tool==='vertical'){commit({id:newId(),type:'vertical',time:p.time,createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#9b7cf5',lineWidth:2}});return}
  if(tool==='text'){const text=prompt('차트 메모','메모');if(text)commit({id:newId(),type:'text',point:p,text,createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#e8f1fb'}});return}
  start=p;cv.setPointerCapture?.(e.pointerId)
 }
 if(e.type==='pointermove'&&drag){const d=drawings.find(x=>x.id===drag.id);if(!d)return;const dt=p.time-drag.start.time,dp=p.price-drag.start.price,o=drag.original;if(drag.handle>=0&&o.points?.[drag.handle])d.points[drag.handle]=p;else if(drag.handle>=0&&o.type==='text')d.point=p;else if(o.type==='horizontal')d.price=o.price+dp;else if(o.type==='vertical')d.time=o.time+dt;else if(o.type==='text')d.point=shiftPoint(o.point,dt,dp);else if(o.points)d.points=o.points.map(q=>shiftPoint(q,dt,dp));saveLocal();render();return}
 if(e.type==='pointerup'){
  if(drag){drag=null;saveLocal();render();return}
  if(start){const end=p;if(tool==='trendline'||tool==='arrow')commit({id:newId(),type:tool,points:[start,end],createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#5aa2ff',lineWidth:2}});if(tool==='rectangle')commit({id:newId(),type:'rectangle',points:[start,end],role:'analysis-zone',createdAt:new Date().toISOString(),locked:false,hidden:false,style:{color:'#5aa2ff',fillColor:'#5aa2ff',lineWidth:2}});start=null}
 }
}
function commit(d){snap();drawings.push(d);selected=d.id;saveLocal();render()}
function undoFn(){if(!undo.length)return;redo.push(JSON.stringify(drawings));drawings=JSON.parse(undo.pop());saveLocal();render()}
function redoFn(){if(!redo.length)return;undo.push(JSON.stringify(drawings));drawings=JSON.parse(redo.pop());saveLocal();render()}
function selectedDrawing(){return drawings.find(x=>x.id===selected)}
function del(){if(!selected)return;snap();drawings=drawings.filter(x=>x.id!==selected);selected=null;saveLocal();render()}
function lock(){const d=selectedDrawing();if(!d)return;snap();d.locked=!d.locked;saveLocal();render()}
function hide(){const d=selectedDrawing();if(!d)return;snap();d.hidden=!d.hidden;saveLocal();render()}
function snapshotPayload(){const rec=record();if(!rec)return null;return{schemaVersion:2,id:'chart_'+String(rec.snapshotId||('snap_'+rec.confirmedBarTime)).replace(/[^A-Za-z0-9_.:-]/g,'_'),createdAt:new Date().toISOString(),capturedAt:rec.confirmedBarTime,market:{venue:'binance',symbol:rec.symbol,marketType:'perpetual',timeframe:rec.timeframe},lastCandleClosed:true,priceScale:{mode:'linear',autoScale:true},viewport:{visibleCandleCount:Math.min(VISIBLE,rec.candles?.length||0),rendererPad:PAD},source:{provider:'binance',dataVersion:rec.engineVersion||null,fetchedAt:new Date().toISOString()},candles:rec.candles,boardRecord:rec,indicators:[],drawings:deep(drawings),markers:[],note:$('snapshotNote')?.value||'',liveLayerEnabled:liveLayer,originalSnapshotId:rec.snapshotId}}
function download(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
function exportJson(){const p=snapshotPayload();if(!p)return;download(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),p.market.symbol+'-'+p.market.timeframe+'-snapshot-v2.json')}
async function serverApi(action,{method='GET',body=null,params={}}={}){
 const q=new URLSearchParams({action,...Object.fromEntries(Object.entries(params).filter(([,v])=>v!=null&&v!==''))});
 const opt={method,headers:{accept:'application/json'},cache:'no-store'};
 if(body!=null){opt.headers['content-type']='application/json';opt.body=JSON.stringify(body)}
 const r=await fetch('/api/chart-snapshots?'+q.toString(),opt),j=await r.json().catch(()=>({status:'error',error:'서버 응답 오류'}));
 if(!r.ok||j.status!=='ok')throw new Error(j.error||('HTTP '+r.status));return j;
}
async function ensureServerOriginal(){
 const p=snapshotPayload();if(!p)throw new Error('저장할 스냅샷 없음');
 const j=await serverApi('create',{method:'POST',body:{payload:p}});
 $('snapshotServerState').textContent=j.inserted?'☁️ 서버 원본 저장 완료':'☁️ 서버 원본 이미 보존됨';
 return p;
}
async function saveServerOriginal(){try{await ensureServerOriginal();await loadServerRevisions()}catch(e){$('snapshotServerState').textContent='⚠️ 서버 저장 실패 · 로컬은 유지 · '+(e.message||e)}}
async function saveServerRevision(){
 try{const p=await ensureServerOriginal();const j=await serverApi('revision',{method:'POST',body:{snapshotId:p.id,payload:p}});$('snapshotServerState').textContent='☁️ 서버 수정본 v'+j.revision+' 저장';await loadServerRevisions()}
 catch(e){$('snapshotServerState').textContent='⚠️ 서버 수정본 실패 · 로컬은 유지 · '+(e.message||e)}
}
async function loadServerRevisions(){
 const p=snapshotPayload();if(!p)return;try{
   const j=await serverApi('revisions',{params:{id:p.id}}),s=$('serverRevisionSelect');if(!s)return;
   s.innerHTML='<option value="">서버 수정본 선택</option>'+j.items.map((x,i)=>'<option value="'+i+'">v'+x.revision+' · '+String(x.createdAt||'').slice(0,16).replace('T',' ')+'</option>').join('');
   s.dataset.items=JSON.stringify(j.items);
 }catch(e){$('snapshotServerState').textContent='⚠️ 서버 수정본 조회 실패 · '+(e.message||e)}
}
function restoreServerRevision(){const s=$('serverRevisionSelect'),i=Number(s?.value);if(!Number.isInteger(i))return;try{const items=JSON.parse(s.dataset.items||'[]'),x=items[i];if(x?.payload)restorePayload(x.payload)}catch(e){$('snapshotServerState').textContent='⛔ 서버 수정본 복원 실패'}}
async function saveOutcome(){
 try{
   const p=await ensureServerOriginal(),outcome=String($('outcomeType')?.value||'open'),price=Number($('outcomePrice')?.value),r=Number($('outcomeR')?.value);
   const body={snapshotId:p.id,outcome,eventTime:Date.now(),price:Number.isFinite(price)?price:null,rMultiple:Number.isFinite(r)?r:null,source:'manual'};
   const j=await serverApi('outcome',{method:'POST',body});$('snapshotServerState').textContent='📌 결과 기록 완료 · '+outcome;
 }catch(e){$('snapshotServerState').textContent='⚠️ 결과 기록 실패 · '+(e.message||e)}
}
function revisions(){try{return JSON.parse(localStorage.getItem(revisionKey())||'[]')}catch{return[]}}
function refreshRevisions(){const s=$('revisionSelect');if(!s)return;const arr=revisions();s.innerHTML='<option value="">수정본 선택</option>'+arr.map((x,i)=>'<option value="'+i+'">v'+x.revision+' · '+String(x.createdAt||'').slice(0,16).replace('T',' ')+'</option>').join('')}
function saveRevision(){const p=snapshotPayload();if(!p)return;const arr=revisions();arr.unshift({...p,revision:(arr[0]?.revision||0)+1});localStorage.setItem(revisionKey(),JSON.stringify(arr.slice(0,50)));refreshRevisions();$('snapshotV2State').textContent='✅ 로컬 수정본 '+arr[0].revision+' 저장';saveServerRevision()}
function restorePayload(p){if(!p||!Array.isArray(p.drawings))throw new Error('지원하지 않는 스냅샷 JSON');restored=p;drawings=deep(p.drawings);selected=null;undo=[];redo=[];$('snapshotNote').value=p.note||'';if(p.boardRecord)C()?.restorePayload?.(p);render()}
function restoreRevision(){const i=Number($('revisionSelect')?.value);if(!Number.isInteger(i))return;const p=revisions()[i];if(p)restorePayload(p)}
function importJson(file){const r=new FileReader();r.onload=()=>{try{restorePayload(JSON.parse(r.result));$('snapshotV2State').textContent='✅ JSON 저장본 복원 완료'}catch(e){$('snapshotV2State').textContent='⛔ 복원 실패 · '+(e.message||e)}};r.readAsText(file)}
function backLive(){restored=null;loadLocal();C()?.refresh?.();render()}
async function exportPng(){const base=canvas(),ov=overlay();if(!base||!ov)return;const out=document.createElement('canvas');out.width=base.width;out.height=base.height;const ctx=out.getContext('2d');ctx.drawImage(base,0,0);ctx.drawImage(ov,0,0,out.width,out.height);ctx.fillStyle='rgba(7,17,29,.82)';ctx.fillRect(8,out.height-36,out.width-16,28);ctx.fillStyle='#dcecff';ctx.font='13px system-ui';const rec=record();ctx.fillText((rec?.symbol||'SNAPSHOT')+' · '+String(rec?.timeframe||'').toUpperCase()+' · '+new Date(restored?.capturedAt||rec?.confirmedBarTime||Date.now()).toISOString()+' · 확정봉 기준',16,out.height-17);out.toBlob(b=>b&&download(b,(C()?.getSymbol?.()||'snapshot')+'-'+(C()?.getCurrentTf?.()||'tf')+'-annotated.png'),'image/png')}
function exportSvg(){const base=canvas();if(!base)return;const img=base.toDataURL('image/png'),w=base.width,h=base.height,esc=s=>String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));let body='<image href="'+img+'" width="'+w+'" height="'+h+'"/>';for(const d of drawings){if(d.hidden)continue;const p=pts(d).map(toPixel).filter(Boolean),stroke=esc(d.style?.color||'#5aa2ff');if(d.type==='horizontal'&&p.length>=2)body+='<line x1="'+p[0].x+'" y1="'+p[0].y+'" x2="'+p[1].x+'" y2="'+p[1].y+'" stroke="'+stroke+'" stroke-width="2"/>';else if(d.type==='vertical'&&p.length>=2)body+='<line x1="'+p[0].x+'" y1="'+p[0].y+'" x2="'+p[1].x+'" y2="'+p[1].y+'" stroke="'+stroke+'" stroke-width="2"/>';else if((d.type==='trendline'||d.type==='arrow')&&p.length>=2)body+='<line x1="'+p[0].x+'" y1="'+p[0].y+'" x2="'+p[1].x+'" y2="'+p[1].y+'" stroke="'+stroke+'" stroke-width="2"/>';else if(d.type==='rectangle'&&p.length>=2)body+='<rect x="'+Math.min(p[0].x,p[1].x)+'" y="'+Math.min(p[0].y,p[1].y)+'" width="'+Math.abs(p[1].x-p[0].x)+'" height="'+Math.abs(p[1].y-p[0].y)+'" fill="none" stroke="'+stroke+'" stroke-width="2"/>';else if(d.type==='text'&&p[0])body+='<text x="'+p[0].x+'" y="'+p[0].y+'" fill="'+stroke+'" font-size="18">'+esc(d.text||'메모')+'</text>'}download(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+body+'</svg>'],{type:'image/svg+xml'}),(C()?.getSymbol?.()||'snapshot')+'-'+(C()?.getCurrentTf?.()||'tf')+'.svg')}
function renderMeta(){const rec=record(),m=$('snapshotV2Meta');if(!m)return;const cap=restored?.capturedAt||rec?.confirmedBarTime;m.innerHTML='<span>📌 '+(restored?'저장본':'현재 분석')+'</span><span>🕒 '+(cap?new Date(Number(cap)).toISOString().replace('T',' ').slice(0,19)+' UTC':'-')+'</span><span>✅ 확정봉 '+(restored?.lastCandleClosed===false?'아니오':'예')+'</span><span>🧭 좌표: 시간·가격</span><span>📐 렌더 여백 '+PAD+'px</span>'}
function bind(){const base=canvas(),ov=overlay();if(!base||!ov)return false;ov.width=base.width;ov.height=base.height;['pointerdown','pointermove','pointerup','pointercancel'].forEach(ev=>ov.addEventListener(ev,pointer));document.querySelectorAll('[data-draw-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.drawTool;document.querySelectorAll('[data-draw-tool]').forEach(x=>x.classList.toggle('active',x===b))});$('drawUndo').onclick=undoFn;$('drawRedo').onclick=redoFn;$('drawDelete').onclick=del;$('drawLock').onclick=lock;$('drawHide').onclick=hide;$('saveSnapshotJson').onclick=exportJson;$('saveSnapshotRevision').onclick=saveRevision;$('saveServerOriginal').onclick=saveServerOriginal;$('saveAnnotatedPng').onclick=exportPng;$('saveSnapshotSvg').onclick=exportSvg;$('restoreRevision').onclick=restoreRevision;$('restoreServerRevision').onclick=restoreServerRevision;$('saveOutcome').onclick=saveOutcome;$('returnLiveChart').onclick=backLive;$('importSnapshotJson').onchange=e=>e.target.files?.[0]&&importJson(e.target.files[0]);$('toggleLiveLayer').onclick=()=>{liveLayer=!liveLayer;render()};loadLocal();render();loadServerRevisions().catch(()=>{});window.addEventListener('resize',render);const title=$('chartTitle');if(title)new MutationObserver(()=>{const k=storageKey();if(k!==lastKey){loadLocal();render();loadServerRevisions().catch(()=>{})}}).observe(title,{childList:true,subtree:true,characterData:true});return true}
function boot(){if(bind())return;setTimeout(boot,300)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
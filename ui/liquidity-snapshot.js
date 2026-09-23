(()=>{'use strict';
const M=window.PulseLiquidityMapEngine;
const PRIMARY_TF=M?.TF_ORDER||['1w','1d','4h','1h','15m'];
const EXTRA_TF=M?.EXTRA_TF_ORDER||['3d','12h','5m'];
const ALL_TF=[...new Set([...PRIMARY_TF,...EXTRA_TF])];
const LABEL={'1w':'1W','3d':'3D','1d':'1D','12h':'12H','4h':'4H','1h':'1H','15m':'15m','5m':'5m'};
const HTF={'1w':'1w','3d':'1w','1d':'1w','12h':'1d','4h':'1d','1h':'4h','15m':'1h','5m':'15m'};
const $=id=>document.getElementById(id);
let currentTf='1h',model=null,raw=null,htfRaw=null,seq=0,showAllLiquidity=false,showAllPd=false,renderGeo=null,pseudoFull=false;

function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function finite(v){return Number.isFinite(Number(v))}
function fmt(v,d=2){return finite(v)?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d}):'N/A'}
function price(v){if(!finite(v))return'N/A';const x=Math.abs(Number(v)),d=x>=1000?2:x>=1?4:6;return Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d})}
function biasKo(v){return v==='up'?'상승':v==='down'?'하락':'중립/혼조'}
function positionKo(v){return v==='premium'?'Premium':v==='discount'?'Discount':'Equilibrium'}
function layer(name){return !!document.querySelector('[data-layer="'+name+'"]')?.checked}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function htfBias(data){const events=Array.isArray(data?.events)?data.events:[],last=events.at(-1);if(last?.dir)return last.dir;const label=String(data?.bias?.label||data?.bias||'');if(/up|bull|상승/i.test(label))return'up';if(/down|bear|하락/i.test(label))return'down';return'neutral'}
function toneForPhase(s){if(model?.referenceOnly)return'tone-na';if(s?.phase==='POST_SWEEP_DRAW')return'tone-confirm';if(s?.phase==='SWEEP_WAIT_RECLAIM')return'tone-wait';return'tone-info'}
function setTone(el,tone){if(!el)return;el.classList.remove('tone-confirm','tone-wait','tone-risk','tone-info','tone-na');el.classList.add(tone)}
async function structure(symbol,tf){const u='/api/structure?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(tf)+'&limit=600';const r=await fetch(u,{cache:'no-store'}),d=await r.json();if(!r.ok||!d?.ok)throw new Error(d?.error||('구조 데이터 HTTP '+r.status));return d}
function syncSymbol(s){try{parent.postMessage({type:'pulse-symbol-sync',symbol:s},'*')}catch{}}

function phaseShort(s){if(model?.referenceOnly)return'5m 참고 전용';if(s.phase==='POST_SWEEP_DRAW')return'Sweep+Reclaim 확인';if(s.phase==='SWEEP_WAIT_RECLAIM')return'Sweep · Reclaim 대기';return'스윕 전'}
function htfAlignText(s){const tf=LABEL[HTF[currentTf]]||HTF[currentTf],a=s.localBias,b=s.htfBias;if(b==='neutral')return tf+' · HTF 중립';if(a==='neutral')return tf+' '+biasKo(b)+' · LTF 미확정';return tf+' '+biasKo(b)+' · '+(a===b?'일치':'불일치')}
function triggerText(s){if(model?.referenceOnly)return'참고 전용 · 승격 금지';if(s.phase==='POST_SWEEP_DRAW')return'Reclaim + 구조 확인';if(s.phase==='SWEEP_WAIT_RECLAIM')return'Reclaim / MSS 미확인';return (s.direction==='up'?'상방':'하방')+' Displacement 확인'}
function scenarioRows(s){
  if(model?.referenceOnly)return[
    ['관찰 방향',s.target?(s.target.label+' '+price(s.target.price)):'N/A','info'],
    ['확인 조건','상위 TF(15m+)에서 Sweep/Reclaim·MSS 확인','wait'],
    ['대기 조건','5m 단독 신호는 방향 판정에 사용하지 않음','wait'],
    ['무효화',price(s.invalidation),'risk']
  ];
  const sweepSide=s.sweep?.dir==='down'?'SSL':s.sweep?.dir==='up'?'BSL':'유동성';
  const mssDir=s.sweep?.dir==='down'?'UP':s.sweep?.dir==='up'?'DOWN':(s.direction==='up'?'UP':'DOWN');
  let confirm,waiting;
  if(s.phase==='POST_SWEEP_DRAW'){confirm='Reclaim + MSS/Displacement 확인됨';waiting=s.reactionZone?('PD Array 재테스트 · '+s.reactionZone.kind):'구조 유지 확인'}
  else if(s.phase==='SWEEP_WAIT_RECLAIM'){confirm=sweepSide+' Reclaim + MSS '+mssDir;waiting='MSS/Displacement 미확인'}
  else{confirm='구조 유지 + Displacement '+(s.direction==='up'?'UP':'DOWN');waiting='우선 유동성 Sweep 미발생'}
  return[
    ['관찰 방향',s.target?((s.target.side==='buy'?'상단 ':'하단 ')+s.target.label+' '+price(s.target.price)):'N/A','info'],
    ['확인 조건',confirm,s.phase==='POST_SWEEP_DRAW'?'confirm':'wait'],
    ['대기 조건',waiting,'wait'],
    ['무효화',price(s.invalidation),'risk']
  ];
}
function rowHtml(x,targetPrice){
  const isTarget=finite(targetPrice)&&Math.abs(Number(x.price)-Number(targetPrice))<1e-12;
  const cluster=nz(x.clusterCount,1),title=cluster>1?(x.label+' 클러스터 · '+cluster+'개'):x.label;
  const badges=['<span class="miniBadge '+(x.external?'external':'internal')+'">'+(x.external?'외부':'내부')+'</span>'];
  if(cluster>1)badges.push('<span class="miniBadge cluster">'+cluster+'개 병합</span>');
  const dist=finite(x.distancePct)?((x.distancePct>=0?'+':'')+fmt(x.distancePct,2)+'%'):'N/A';
  return '<div class="dataRow '+(isTarget?'target':'')+'"><div class="dataMain"><b>'+escapeHtml(title)+'</b><div class="rowMeta">'+badges.join('')+'</div></div><div class="dataValue">'+escapeHtml(price(x.price))+'<br>거리 '+escapeHtml(dist)+' · 근거 '+escapeHtml(fmt(x.score,0))+'</div></div>'
}
function nz(v,d){return finite(v)?Number(v):d}
function pdRowHtml(x){return '<div class="dataRow"><div class="dataMain"><b>'+escapeHtml(x.kind+' · '+String(x.dir||'').toUpperCase())+'</b><div class="rowMeta"><span class="miniBadge">'+escapeHtml(String(x.state||'active'))+'</span></div></div><div class="dataValue">'+escapeHtml(price(x.low))+' ~ '+escapeHtml(price(x.high))+'<br>근거 '+escapeHtml(fmt(x.score,0))+'</div></div>'}

function renderLiquidityList(){
  const rows=model?.levels||[],visible=showAllLiquidity?rows.slice(0,10):rows.slice(0,3),btn=$('liqMore');
  $('liquidityList').innerHTML=visible.length?visible.map(x=>rowHtml(x,model?.scenario?.target?.price)).join(''):'<div class="dataRow"><b>유동성</b><div class="dataValue">N/A</div></div>';
  const hidden=Math.max(0,Math.min(rows.length,10)-3);btn.hidden=hidden<=0;btn.textContent=showAllLiquidity?'접기':hidden+'개 더 보기';
}
function renderPdList(){
  const rows=model?.pdArrays||[],visible=showAllPd?rows.slice(0,8):rows.slice(0,3),btn=$('pdMore');
  $('pdList').innerHTML=visible.length?visible.map(pdRowHtml).join(''):'<div class="dataRow"><b>PD Array</b><div class="dataValue">N/A</div></div>';
  const hidden=Math.max(0,Math.min(rows.length,8)-3);btn.hidden=hidden<=0;btn.textContent=showAllPd?'접기':hidden+'개 더 보기';
}
function renderCards(){
  if(!model?.ok)return;
  const s=model.scenario,summary=model.summary,range=model.range||{},pct=summary.rangePositionPct;
  $('sumBias').textContent=biasKo(s.bias);
  $('sumHtf').textContent=htfAlignText(s);
  $('sumStage').textContent=phaseShort(s);
  $('sumRange').textContent=(finite(pct)?(positionKo(summary.position)+' · '+fmt(pct,0)+'%'):positionKo(summary.position))+(finite(range.low)&&finite(range.high)?(' · '+price(range.low)+'~'+price(range.high)):'');
  $('sumTarget').textContent=s.target?(s.target.label+' '+price(s.target.price)):'N/A';
  $('sumTrigger').textContent=triggerText(s);
  $('sumInvalid').textContent=price(s.invalidation);
  $('scenarioCompact').innerHTML=scenarioRows(s).map(x=>'<div class="scenarioRow '+x[2]+'"><span>'+escapeHtml(x[0])+'</span><b>'+escapeHtml(x[1])+'</b></div>').join('');
  const sw=s.sweep||{},mss=model.smc?.mss?.at(-1),disp=model.smc?.displacements?.at(-1);
  const evidence=[
    ['최근 Sweep',sw.last?(sw.confirmed?'Reclaim/구조 확인':'Reclaim 대기')+' · '+String(sw.dir||'neutral').toUpperCase():'없음'],
    ['최근 MSS',mss?String(mss.dir||'').toUpperCase()+' · '+(finite(mss.level)?price(mss.level):'레벨 N/A'):'없음'],
    ['Displacement',disp?String(disp.dir||'').toUpperCase()+' · 품질 '+fmt(disp.quality,0):'없음']
  ];
  $('evidenceList').innerHTML=evidence.map(x=>'<div class="dataRow"><div class="dataMain"><b>'+escapeHtml(x[0])+'</b></div><div class="dataValue">'+escapeHtml(x[1])+'</div></div>').join('');
  $('confirmedMeta').textContent='확정봉 '+model.candles.length+'개 · 진행봉 제외';
  renderLiquidityList();renderPdList();
}

function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h)}
function tag(ctx,text,x,y,{fill='#07131f',stroke='#29445d',color='#e8f1fb',font='bold 17px system-ui'}={}){ctx.save();ctx.font=font;const w=Math.ceil(ctx.measureText(text).width)+18,h=28;ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1;roundedRect(ctx,x,y,w,h,7);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,x+9,y+h/2+1);ctx.restore();return w}
function line(ctx,x1,y1,x2,y2,color,width=1,dash=[]){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore()}
function arrow(ctx,x1,y1,x2,y2,color,dash=[]){ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);const a=Math.atan2(y2-y1,x2-x1),len=14;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-len*Math.cos(a-.45),y2-len*Math.sin(a-.45));ctx.lineTo(x2-len*Math.cos(a+.45),y2-len*Math.sin(a+.45));ctx.closePath();ctx.fill();ctx.restore()}
function labelLayout(items,top,bottom,gap=30){const a=[...items].sort((x,y)=>x.y-y.y);let cursor=top;for(const x of a){x.ly=Math.max(x.y,cursor);cursor=x.ly+gap}if(a.length&&a.at(-1).ly>bottom){let shift=a.at(-1).ly-bottom;for(let i=a.length-1;i>=0;i--){a[i].ly-=shift;if(i>0&&a[i].ly-a[i-1].ly<gap)a[i-1].ly=a[i].ly-gap}if(a[0].ly<top){shift=top-a[0].ly;for(const x of a)x.ly+=shift}}return a}
function timeText(t){const ms=Number(t)>1e12?Number(t):Number(t)*1000,d=new Date(ms);if(!Number.isFinite(d.getTime()))return'';const md=String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');if(['5m','15m','1h','4h','12h'].includes(currentTf))return md+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');return String(d.getFullYear()).slice(-2)+'.'+md}
function draw(){
  const cv=$('snapshot');if(!model?.ok||!cv)return;const ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#050d16';ctx.fillRect(0,0,W,H);
  const L=92,R=285,T=75,B=82,plotRight=W-R,plotW=plotRight-L,plotH=H-T-B,c=model.candles.slice(-140),offset=model.candles.length-c.length;
  const extras=[];for(const q of model.overlays){if(finite(q.price))extras.push(Number(q.price));if(finite(q.low))extras.push(Number(q.low));if(finite(q.high))extras.push(Number(q.high))}
  const rawLow=Math.min(...c.map(x=>x.low),...extras),rawHigh=Math.max(...c.map(x=>x.high),...extras),span=Math.max(rawHigh-rawLow,Math.abs(model.current)*.002,1e-9),lo=rawLow-span*.045,hi=rawHigh+span*.045;
  const y=p=>T+(hi-Number(p))/(hi-lo)*plotH,x=i=>L+(i+.5)*(plotW/Math.max(1,c.length));
  const clickTargets=[];
  ctx.fillStyle='#071522';ctx.fillRect(plotRight,T,R-34,plotH);
  ctx.font='bold 24px system-ui';ctx.fillStyle='#e8f1fb';ctx.fillText(clean($('symbol').value)+' · '+LABEL[currentTf]+' 유동성 지도',L,38);
  ctx.font='14px system-ui';ctx.fillStyle='#7891a8';ctx.fillText(model.referenceOnly?'5m 참고 전용 · 방향 판정 승격 금지':'확정봉 기반 · 우측 음영은 조건부 미래 경로 영역',L,61);
  for(let i=0;i<=6;i++){const py=T+plotH*i/6,p=hi-(hi-lo)*i/6;line(ctx,L,py,plotRight,py,'#122639',1,[3,7]);ctx.fillStyle='#6f879d';ctx.font='13px ui-monospace,monospace';ctx.textAlign='right';ctx.fillText(price(p),L-10,py+4)}
  for(let i=0;i<=8;i++){const px=L+plotW*i/8;line(ctx,px,T,px,H-B,'#0d2030',1,[2,9])}
  const step=plotW/Math.max(1,c.length),bw=Math.max(2,Math.min(11,step*.62));
  for(let i=0;i<c.length;i++){const k=c[i],up=k.close>=k.open,col=up?'#35d69a':'#ff6577',px=x(i);line(ctx,px,y(k.high),px,y(k.low),col,1.4);ctx.fillStyle=col;const yo=y(k.open),yc=y(k.close);ctx.fillRect(px-bw/2,Math.min(yo,yc),bw,Math.max(2,Math.abs(yo-yc)))}
  ctx.textAlign='center';ctx.fillStyle='#647c92';ctx.font='11px system-ui';for(let i=0;i<=5;i++){const idx=Math.min(c.length-1,Math.round((c.length-1)*i/5)),px=x(idx);ctx.fillText(timeText(c[idx]?.time),px,H-B+25)}
  ctx.textAlign='left';
  if(layer('pd'))for(const z of model.pdArrays.slice(0,5)){const top=Math.min(y(z.high),y(z.low)),bottom=Math.max(y(z.high),y(z.low)),hh=Math.max(3,bottom-top),col=String(z.dir).includes('down')?'#ff6577':z.kind==='BREAKER'?'#a58cff':'#35d69a';ctx.save();ctx.globalAlpha=.1;ctx.fillStyle=col;ctx.fillRect(L+plotW*.38,top,plotW*.62,hh);ctx.globalAlpha=.65;ctx.strokeStyle=col;ctx.strokeRect(L+plotW*.38,top,plotW*.62,hh);ctx.restore();tag(ctx,z.kind,L+plotW*.39,top+4,{stroke:col,color:col,font:'bold 13px system-ui'});clickTargets.push({kind:'pd',top:top-8,bottom:bottom+8,data:z})}
  if(finite(model.range?.mid)){line(ctx,L,y(model.range.mid),plotRight,y(model.range.mid),'#52697c',1,[3,6]);tag(ctx,'EQ 50%',L+8,y(model.range.mid)-30,{stroke:'#52697c',color:'#90a5b8',font:'bold 12px system-ui'})}
  const labels=[];
  if(layer('liquidity'))for(const q of model.levels.slice(0,8)){const py=y(q.price),col=q.side==='buy'?'#6aa8ff':'#f5c96b',dash=q.external?[9,5]:[4,6],cluster=nz(q.clusterCount,1),label=q.label+(cluster>1?'×'+cluster:'');line(ctx,L,py,plotRight,py,col,q.external?2:1.2,dash);labels.push({text:label+(q.external?' EXT':'')+' '+price(q.price)+' · '+fmt(q.score,0),y:py,color:col,priority:q.score});clickTargets.push({kind:'level',y:py,data:q})}
  if(layer('structure')){
    const sw=model.scenario?.sweep?.last;if(sw&&finite(sw.level??sw.price)){const py=y(sw.level??sw.price),idx=Math.max(0,Math.min(c.length-1,(Number(sw.index??sw.sweepIndex??c.length-1)-offset))),px=x(idx);ctx.fillStyle=model.scenario.sweep.confirmed?'#35d69a':'#f5c96b';ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fill();tag(ctx,model.scenario.sweep.confirmed?'SWEEP + RECLAIM':'SWEEP 확인대기',Math.min(px+10,plotRight-200),Math.max(T,py-42),{stroke:ctx.fillStyle,color:ctx.fillStyle,font:'bold 13px system-ui'});clickTargets.push({kind:'sweep',y:py,data:model.scenario.sweep})}
    for(const m of (model.smc?.mss||[]).slice(-2)){if(!finite(m.level))continue;const py=y(m.level),col=String(m.dir).includes('down')?'#ff6577':'#35d69a';line(ctx,L,py,plotRight,py,col,1,[8,8]);tag(ctx,'MSS '+String(m.dir||'').toUpperCase(),L+12,py-31,{stroke:col,color:col,font:'bold 12px system-ui'})}
  }
  const lab=labelLayout(labels,T+8,H-B-20,31);for(const z of lab){line(ctx,plotRight-12,z.y,plotRight+10,z.ly+14,z.color,1);tag(ctx,z.text,plotRight+12,z.ly,{stroke:z.color,color:z.color,font:'bold 12px system-ui'})}
  line(ctx,L,y(model.current),plotRight,y(model.current),'#e9f1f8',1.3,[2,4]);tag(ctx,'현재 '+price(model.current),plotRight-145,y(model.current)-32,{stroke:'#60798f',color:'#e9f1f8',font:'bold 12px system-ui'});
  if(finite(model.scenario?.invalidation)){const py=y(model.scenario.invalidation);line(ctx,L,py,plotRight,py,'#ff6577',1.4,[12,6]);tag(ctx,'반증 '+price(model.scenario.invalidation),L+8,py+7,{stroke:'#ff6577',color:'#ff8e9b',font:'bold 12px system-ui'});clickTargets.push({kind:'invalidation',y:py,data:{price:model.scenario.invalidation}})}
  if(layer('scenario')&&model.scenario?.target&&!model.referenceOnly){const lastX=x(c.length-1),cy=y(model.current),ty=y(model.scenario.target.price),futureX=plotRight+90,col=model.scenario.direction==='up'?'#6aa8ff':'#f5c96b';if(model.scenario.phase==='SWEEP_WAIT_RECLAIM'){arrow(ctx,lastX,cy,futureX,ty,'#7f93a6',[8,7]);tag(ctx,'조건부 · Reclaim 확인 전',plotRight+20,Math.max(T+8,Math.min(H-B-35,(cy+ty)/2-16)),{stroke:'#7f93a6',color:'#a6b6c4',font:'bold 12px system-ui'})}else{arrow(ctx,lastX,cy,futureX,ty,col);tag(ctx,'DOL → '+model.scenario.target.label,plotRight+20,Math.max(T+8,Math.min(H-B-35,ty-34)),{stroke:col,color:col,font:'bold 13px system-ui'})}}
  ctx.fillStyle='#758da3';ctx.font='13px system-ui';ctx.textAlign='left';ctx.fillText(model.referenceOnly?'5m은 참고 전용 · 15m 이상에서 구조 확인':'레벨 도달만으로 방향 확정 금지 · Reclaim + MSS/Displacement 확인',L,H-23);
  renderGeo={W,H,L,T,B,plotRight,lo,hi,plotH,clickTargets};
}
function inspectCanvas(e){
  if(!renderGeo||!model)return;const cv=$('snapshot'),r=cv.getBoundingClientRect(),py=(e.clientY-r.top)*(cv.height/r.height),targets=[];
  for(const t of renderGeo.clickTargets){if(t.kind==='pd'){if(py>=t.top&&py<=t.bottom)targets.push({...t,d:0})}else if(finite(t.y)){const d=Math.abs(py-t.y);if(d<=24)targets.push({...t,d})}}
  targets.sort((a,b)=>a.d-b.d);const hit=targets[0],box=$('levelDetail');if(!hit){box.hidden=true;return}
  if(hit.kind==='level'){const x=hit.data,cluster=nz(x.clusterCount,1),dist=finite(x.distancePct)?((x.distancePct>=0?'+':'')+fmt(x.distancePct,2)+'%'):'N/A';box.innerHTML='<b>'+escapeHtml(x.label+(cluster>1?' 클러스터 ×'+cluster:''))+'</b> · '+escapeHtml(x.external?'외부 유동성':'내부 유동성')+'<br>가격 '+escapeHtml(price(x.price))+' · 거리 '+escapeHtml(dist)+' · 근거 '+escapeHtml(fmt(x.score,0))+'<br>상태 '+escapeHtml(String(x.state||'active'))}
  else if(hit.kind==='pd'){const x=hit.data;box.innerHTML='<b>'+escapeHtml(x.kind)+'</b> · '+escapeHtml(String(x.dir||'').toUpperCase())+'<br>'+escapeHtml(price(x.low))+' ~ '+escapeHtml(price(x.high))+' · 상태 '+escapeHtml(String(x.state||'active'))+' · 근거 '+escapeHtml(fmt(x.score,0))}
  else if(hit.kind==='sweep'){box.innerHTML='<b>Sweep</b><br>'+escapeHtml(model.scenario.sweep.confirmed?'Reclaim/구조 확인됨':'Reclaim/MSS 확인 대기')}
  else{box.innerHTML='<b>Invalidation</b><br>'+escapeHtml(price(hit.data.price))+' 종가 이탈 시 현재 시나리오 재평가'}
  box.hidden=false;
}
function updateFullscreenUi(){const active=!!document.fullscreenElement||pseudoFull;$('expandChart').textContent=active?'축소 ✕':'차트 확대 ⛶';setTimeout(draw,60)}
async function toggleFullscreen(){
  const card=$('chartCard');
  if(document.fullscreenElement){try{await document.exitFullscreen()}catch{}return}
  if(pseudoFull){pseudoFull=false;card.classList.remove('pseudoFullscreen');document.body.classList.remove('chartLocked');updateFullscreenUi();return}
  try{if(card.requestFullscreen){await card.requestFullscreen();return}throw new Error('fullscreen unsupported')}catch{pseudoFull=true;card.classList.add('pseudoFullscreen');document.body.classList.add('chartLocked');updateFullscreenUi()}
}
function savePng(){const cv=$('snapshot');if(!model||!cv)return;cv.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=clean($('symbol').value)+'-'+currentTf+'-liquidity-map.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1200)},'image/png')}
function updateUrl(){const u=new URL(location.href);u.searchParams.set('symbol',clean($('symbol').value));u.searchParams.set('tf',currentTf);history.replaceState(null,'',u)}
function selectTf(t){if(!ALL_TF.includes(t))return;currentTf=t;document.querySelectorAll('#tfTabs button,#extraTfTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tf===t));$('extraTfTabs').hidden=true;$('moreTfBtn').setAttribute('aria-expanded','false');showAllLiquidity=false;showAllPd=false;updateUrl();run()}
function addTfButtons(){for(const t of PRIMARY_TF){const b=document.createElement('button');b.textContent=LABEL[t];b.dataset.tf=t;b.classList.toggle('active',t===currentTf);b.onclick=()=>selectTf(t);$('tfTabs').append(b)}for(const t of EXTRA_TF){const b=document.createElement('button');b.textContent=LABEL[t]+(t==='5m'?' · 참고':'');b.dataset.tf=t;b.classList.toggle('active',t===currentTf);b.onclick=()=>selectTf(t);$('extraTfTabs').append(b)}}
async function run(){
  if(!M){$('status').textContent='엔진 로드 실패';setTone($('status'),'tone-risk');return}
  const token=++seq,symbol=clean($('symbol').value);$('symbol').value=symbol;$('status').textContent='분석 중';setTone($('status'),'tone-info');$('levelDetail').hidden=true;
  try{
    const htf=HTF[currentTf],[a,b]=await Promise.all([structure(symbol,currentTf),htf===currentTf?Promise.resolve(null):structure(symbol,htf)]);
    if(token!==seq)return;raw=a;htfRaw=b||a;const hb=htfBias(htfRaw);
    model=M.buildLiquidityMap({candles:raw.candles,canonicalSwings:raw.canonicalSwings,canonicalEvents:raw.events,timeframe:currentTf,htfBias:hb});
    if(!model.ok)throw new Error(model.error||'유동성 분석 실패');
    $('chartTitle').textContent=symbol+' · '+LABEL[currentTf]+(model.referenceOnly?' · 참고':'');
    $('chartMeta').textContent='HTF '+LABEL[htf]+' · '+biasKo(hb)+' · 확정봉 '+model.candles.length+'개 · 진행봉 제외';
    renderCards();draw();syncSymbol(symbol);updateUrl();$('status').textContent='완료';setTone($('status'),toneForPhase(model.scenario));
  }catch(e){if(token!==seq)return;$('status').textContent='분석 실패';setTone($('status'),'tone-risk');$('scenarioCompact').innerHTML='<div class="scenarioRow risk"><span>오류</span><b>'+escapeHtml(e.message||String(e))+'</b></div>'}
}
function init(){
  const q=new URLSearchParams(location.search),symbol=clean(q.get('symbol')||'BTCUSDT'),tf=String(q.get('tf')||'1h');$('symbol').value=symbol;if(ALL_TF.includes(tf))currentTf=tf;addTfButtons();
  $('run').onclick=run;$('savePng').onclick=savePng;$('expandChart').onclick=toggleFullscreen;$('snapshot').onclick=inspectCanvas;$('snapshot').ondblclick=toggleFullscreen;
  $('symbol').onkeydown=e=>{if(e.key==='Enter')run()};document.querySelectorAll('[data-layer]').forEach(x=>x.onchange=draw);
  $('liqMore').onclick=()=>{showAllLiquidity=!showAllLiquidity;renderLiquidityList()};$('pdMore').onclick=()=>{showAllPd=!showAllPd;renderPdList()};
  $('scoreHelp').onclick=()=>{$('scoreHelpPanel').hidden=!$('scoreHelpPanel').hidden};
  $('moreTfBtn').onclick=()=>{const p=$('extraTfTabs'),next=p.hidden;p.hidden=!next;$('moreTfBtn').setAttribute('aria-expanded',String(next))};
  document.addEventListener('fullscreenchange',updateFullscreenUi);window.addEventListener('resize',()=>{if(model)setTimeout(draw,40)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pseudoFull){pseudoFull=false;$('chartCard').classList.remove('pseudoFullscreen');document.body.classList.remove('chartLocked');updateFullscreenUi()}});
  run();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
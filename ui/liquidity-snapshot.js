(()=>{'use strict';
const TF=['1w','1d','4h','1h','15m'],LABEL={'1w':'1W','1d':'1D','4h':'4H','1h':'1H','15m':'15m'},HTF={'1w':'1w','1d':'1w','4h':'1d','1h':'4h','15m':'1h'};
const $=id=>document.getElementById(id),M=window.PulseLiquidityMapEngine;
let currentTf='1h',model=null,raw=null,htfRaw=null,seq=0;
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function finite(v){return Number.isFinite(Number(v))}
function fmt(v,d=2){return finite(v)?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d}):'N/A'}
function price(v){if(!finite(v))return'N/A';const x=Math.abs(Number(v)),d=x>=1000?2:x>=1?4:6;return Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d})}
function biasKo(v){return v==='up'?'상방':v==='down'?'하방':'중립/혼조'}
function positionKo(v){return v==='premium'?'Premium':v==='discount'?'Discount':'Equilibrium'}
function layer(name){return !!document.querySelector('[data-layer="'+name+'"]')?.checked}
function htfBias(data){const events=Array.isArray(data?.events)?data.events:[],last=events.at(-1);if(last?.dir)return last.dir;const label=String(data?.bias?.label||data?.bias||'');if(/up|bull|상승/i.test(label))return'up';if(/down|bear|하락/i.test(label))return'down';return'neutral'}
async function structure(symbol,tf){
  const u='/api/structure?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(tf)+'&limit=600';
  const r=await fetch(u,{cache:'no-store'}),d=await r.json();if(!r.ok||!d?.ok)throw new Error(d?.error||('구조 데이터 HTTP '+r.status));return d;
}
function syncSymbol(s){try{parent.postMessage({type:'pulse-symbol-sync',symbol:s},'*')}catch{}}
function rowHtml(name,value,cls){return '<div class="dataRow '+(cls||'')+'"><b>'+escapeHtml(name)+'</b><span>'+escapeHtml(value)+'</span></div>'}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderCards(){
  if(!model?.ok)return;
  const s=model.scenario,summary=model.summary;
  $('sumPhase').textContent=s.phaseLabel;
  $('sumBias').textContent=biasKo(s.bias)+' · HTF '+biasKo(s.htfBias);
  $('sumPosition').textContent=positionKo(summary.position);
  $('sumTarget').textContent=s.target?(s.target.label+' '+price(s.target.price)+' · 점수 '+fmt(s.target.score,0)):'N/A';
  $('sumInvalid').textContent=price(s.invalidation);
  $('targetBadge').textContent=s.target?('우선 '+s.target.label+' · '+price(s.target.price)):'타겟 N/A';
  $('scenarioText').textContent=s.narrative;
  const steps=[];
  if(s.phase==='PRE_SWEEP'){steps.push('우선 유동성 타겟 접근 여부 확인','wick이 레벨을 실제로 침투하는지 확인','종가가 레벨 안쪽으로 리클레임되는지 확인','MSS/CHoCH 또는 Displacement 동반 확인');}
  else if(s.phase==='SWEEP_WAIT_RECLAIM'){steps.push('스윕 자체는 확인됨','종가 리클레임 전에는 방향 확정 금지','MSS/Displacement가 스윕 반대 방향으로 나오는지 확인','확인 전 추격 대신 반응 대기');}
  else{steps.push('Sweep + Reclaim/구조 확인 신호 존재','가까운 PD Array 재테스트 여부 확인','반대편 Draw on Liquidity 타겟까지 구조 유지 관찰','반증선 이탈 시 시나리오 폐기');}
  if(s.reactionZone)steps.push('반응 후보 '+s.reactionZone.kind+' · '+price(s.reactionZone.low)+' ~ '+price(s.reactionZone.high));
  $('scenarioSteps').innerHTML=steps.map(x=>'<li>'+escapeHtml(x)+'</li>').join('');
  const buys=model.levels.filter(x=>x.side==='buy').slice(0,4),sells=model.levels.filter(x=>x.side==='sell').slice(0,4);
  const liqRows=[...buys,...sells].sort((a,b)=>Math.abs(a.price-model.current)-Math.abs(b.price-model.current)).slice(0,7);
  $('liquidityList').innerHTML=liqRows.length?liqRows.map(x=>rowHtml(x.label+' · '+(x.external?'외부':'내부'),price(x.price)+' · '+fmt(x.distancePct,2)+'% · 점수 '+fmt(x.score,0),s.target&&Math.abs(x.price-s.target.price)<1e-12?'target':'')).join(''):rowHtml('유동성','N/A');
  $('pdList').innerHTML=model.pdArrays.length?model.pdArrays.slice(0,5).map(x=>rowHtml(x.kind+' · '+String(x.dir||'').toUpperCase(),price(x.low)+' ~ '+price(x.high)+' · '+String(x.state||'active'))).join(''):rowHtml('PD Array','N/A');
  const sw=s.sweep||{},mss=model.smc?.mss?.at(-1),disp=model.smc?.displacements?.at(-1);
  const evidence=[
    ['최근 Sweep',sw.last?(sw.confirmed?'리클레임/구조 확인':'확인 대기')+' · '+String(sw.dir||'neutral').toUpperCase():'없음'],
    ['최근 MSS',mss?String(mss.dir||'').toUpperCase()+' · '+(finite(mss.level)?price(mss.level):'레벨 N/A'):'없음'],
    ['Displacement',disp?String(disp.dir||'').toUpperCase()+' · 품질 '+fmt(disp.quality,0):'없음'],
    ['HTF 컨텍스트',LABEL[HTF[currentTf]]+' · '+biasKo(s.htfBias)],
    ['확정봉',String(model.candles.length)+'개 · 진행봉 제외']
  ];
  $('evidenceList').innerHTML=evidence.map(x=>rowHtml(x[0],x[1])).join('');
}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h)}
function tag(ctx,text,x,y,{fill='#07131f',stroke='#29445d',color='#e8f1fb',font='bold 17px system-ui'}={}){
  ctx.save();ctx.font=font;const w=Math.ceil(ctx.measureText(text).width)+18,h=28;ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1;roundedRect(ctx,x,y,w,h,7);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,x+9,y+h/2+1);ctx.restore();return w;
}
function line(ctx,x1,y1,x2,y2,color,width=1,dash=[]){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore()}
function arrow(ctx,x1,y1,x2,y2,color,dash=[]){
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);const a=Math.atan2(y2-y1,x2-x1),len=14;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-len*Math.cos(a-.45),y2-len*Math.sin(a-.45));ctx.lineTo(x2-len*Math.cos(a+.45),y2-len*Math.sin(a+.45));ctx.closePath();ctx.fill();ctx.restore();
}
function labelLayout(items,top,bottom,gap=30){
  const a=[...items].sort((x,y)=>x.y-y.y);let cursor=top;for(const x of a){x.ly=Math.max(x.y,cursor);cursor=x.ly+gap}if(a.length&&a.at(-1).ly>bottom){let shift=a.at(-1).ly-bottom;for(let i=a.length-1;i>=0;i--){a[i].ly-=shift;if(i>0&&a[i].ly-a[i-1].ly<gap)a[i-1].ly=a[i].ly-gap}if(a[0].ly<top){shift=top-a[0].ly;for(const x of a)x.ly+=shift}}return a
}
function draw(){
  const cv=$('snapshot');if(!model?.ok||!cv)return;const ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#050d16';ctx.fillRect(0,0,W,H);
  const L=92,R=285,T=75,B=72,plotRight=W-R,plotW=plotRight-L,plotH=H-T-B,c=model.candles.slice(-140);
  const extras=[];for(const x of model.overlays){if(finite(x.price))extras.push(Number(x.price));if(finite(x.low))extras.push(Number(x.low));if(finite(x.high))extras.push(Number(x.high))}
  const rawLow=Math.min(...c.map(x=>x.low),...extras),rawHigh=Math.max(...c.map(x=>x.high),...extras),range=Math.max(rawHigh-rawLow,Math.abs(model.current)*.002,1e-9),lo=rawLow-range*.045,hi=rawHigh+range*.045;
  const y=p=>T+(hi-Number(p))/(hi-lo)*plotH,x=i=>L+(i+.5)*(plotW/Math.max(1,c.length));
  ctx.fillStyle='#071522';ctx.fillRect(plotRight,T,R-34,plotH);
  ctx.font='bold 24px system-ui';ctx.fillStyle='#e8f1fb';ctx.fillText(clean($('symbol').value)+' · '+LABEL[currentTf]+' 유동성 지도',L,38);
  ctx.font='14px system-ui';ctx.fillStyle='#7891a8';ctx.fillText('확정봉 기반 · 우측 음영은 조건부 미래 경로 영역',L,61);
  for(let i=0;i<=6;i++){const py=T+plotH*i/6,p=hi-(hi-lo)*i/6;line(ctx,L,py,plotRight,py,'#122639',1,[3,7]);ctx.fillStyle='#6f879d';ctx.font='13px ui-monospace,monospace';ctx.textAlign='right';ctx.fillText(price(p),L-10,py+4)}
  for(let i=0;i<=8;i++){const px=L+plotW*i/8;line(ctx,px,T,px,H-B,'#0d2030',1,[2,9])}
  const step=plotW/Math.max(1,c.length),bw=Math.max(2,Math.min(11,step*.62));
  for(let i=0;i<c.length;i++){const k=c[i],up=k.close>=k.open,col=up?'#35d69a':'#ff6577',px=x(i);line(ctx,px,y(k.high),px,y(k.low),col,1.4);ctx.fillStyle=col;const yo=y(k.open),yc=y(k.close);ctx.fillRect(px-bw/2,Math.min(yo,yc),bw,Math.max(2,Math.abs(yo-yc)))}
  ctx.textAlign='left';
  if(layer('pd'))for(const z of model.pdArrays.slice(0,5)){const top=Math.min(y(z.high),y(z.low)),hh=Math.max(3,Math.abs(y(z.high)-y(z.low))),col=String(z.dir).includes('down')?'#ff6577':z.kind==='BREAKER'?'#a58cff':'#35d69a';ctx.save();ctx.globalAlpha=.1;ctx.fillStyle=col;ctx.fillRect(L+plotW*.38,top,plotW*.62,hh);ctx.globalAlpha=.65;ctx.strokeStyle=col;ctx.strokeRect(L+plotW*.38,top,plotW*.62,hh);ctx.restore();tag(ctx,z.kind,L+plotW*.39,top+4,{stroke:col,color:col,font:'bold 13px system-ui'})}
  if(finite(model.range?.mid)){line(ctx,L,y(model.range.mid),plotRight,y(model.range.mid),'#52697c',1,[3,6]);tag(ctx,'EQ 50%',L+8,y(model.range.mid)-30,{stroke:'#52697c',color:'#90a5b8',font:'bold 12px system-ui'})}
  const labels=[];
  if(layer('liquidity'))for(const q of model.levels.slice(0,10)){const py=y(q.price),col=q.side==='buy'?'#6aa8ff':'#f5c96b',dash=q.external?[9,5]:[4,6];line(ctx,L,py,plotRight,py,col,q.external?2:1.2,dash);labels.push({text:q.label+(q.external?' EXT':'')+' '+price(q.price)+' · '+fmt(q.score,0),y:py,color:col,priority:q.score})}
  if(layer('structure')){
    const sw=model.scenario?.sweep?.last;if(sw&&finite(sw.level??sw.price)){const py=y(sw.level??sw.price),idx=Math.max(0,Math.min(c.length-1,(Number(sw.index??sw.sweepIndex??c.length-1)-(model.candles.length-c.length))));const px=x(idx);ctx.fillStyle=model.scenario.sweep.confirmed?'#35d69a':'#f5c96b';ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fill();tag(ctx,model.scenario.sweep.confirmed?'SWEEP + RECLAIM':'SWEEP 확인대기',Math.min(px+10,plotRight-200),Math.max(T,py-42),{stroke:ctx.fillStyle,color:ctx.fillStyle,font:'bold 13px system-ui'})}
    for(const m of (model.smc?.mss||[]).slice(-2)){if(!finite(m.level))continue;const py=y(m.level),col=String(m.dir).includes('down')?'#ff6577':'#35d69a';line(ctx,L,py,plotRight,py,col,1,[8,8]);tag(ctx,'MSS '+String(m.dir||'').toUpperCase(),L+12,py-31,{stroke:col,color:col,font:'bold 12px system-ui'})}
  }
  const lab=labelLayout(labels,T+8,H-B-20,31);for(const z of lab){line(ctx,plotRight-12,z.y,plotRight+10,z.ly+14,z.color,1);tag(ctx,z.text,plotRight+12,z.ly,{stroke:z.color,color:z.color,font:'bold 12px system-ui'})}
  line(ctx,L,y(model.current),plotRight,y(model.current),'#e9f1f8',1.3,[2,4]);tag(ctx,'현재 '+price(model.current),plotRight-145,y(model.current)-32,{stroke:'#60798f',color:'#e9f1f8',font:'bold 12px system-ui'});
  if(finite(model.scenario?.invalidation)){const py=y(model.scenario.invalidation);line(ctx,L,py,plotRight,py,'#ff6577',1.4,[12,6]);tag(ctx,'반증 '+price(model.scenario.invalidation),L+8,py+7,{stroke:'#ff6577',color:'#ff8e9b',font:'bold 12px system-ui'})}
  if(layer('scenario')&&model.scenario?.target){
    const lastX=x(c.length-1),cy=y(model.current),ty=y(model.scenario.target.price),futureX=plotRight+90,col=model.scenario.direction==='up'?'#6aa8ff':'#f5c96b';
    if(model.scenario.phase==='SWEEP_WAIT_RECLAIM'){arrow(ctx,lastX,cy,futureX,ty,'#7f93a6',[8,7]);tag(ctx,'조건부 · 리클레임 확인 전',plotRight+20,Math.max(T+8,Math.min(H-B-35,(cy+ty)/2-16)),{stroke:'#7f93a6',color:'#a6b6c4',font:'bold 12px system-ui'})}
    else{arrow(ctx,lastX,cy,futureX,ty,col);tag(ctx,'Draw → '+model.scenario.target.label,plotRight+20,Math.max(T+8,Math.min(H-B-35,ty-34)),{stroke:col,color:col,font:'bold 13px system-ui'});if(model.scenario.phase==='PRE_SWEEP'&&model.scenario.reactionZone){const ry=y(model.scenario.reactionZone.mid);arrow(ctx,futureX,ty,plotRight+165,ry,'#a58cff',[7,6]);tag(ctx,'IF Sweep+Reclaim → '+model.scenario.reactionZone.kind,plotRight+25,Math.max(T+8,Math.min(H-B-35,ry+9)),{stroke:'#a58cff',color:'#bdaaff',font:'bold 11px system-ui'})}}
  }
  ctx.fillStyle='#758da3';ctx.font='13px system-ui';ctx.textAlign='left';ctx.fillText('가격이 유동성 레벨을 찍는 것만으로 방향 확정하지 않음 · Reclaim + MSS/Displacement 확인',L,H-25);
}
async function run(force=true){
  if(!M){$('status').textContent='유동성 맵 엔진 로드 실패';return}
  const token=++seq,symbol=clean($('symbol').value);$('symbol').value=symbol;$('status').textContent='분석 중 · '+LABEL[currentTf];
  try{
    const htf=HTF[currentTf],[a,b]=await Promise.all([structure(symbol,currentTf),htf===currentTf?Promise.resolve(null):structure(symbol,htf)]);
    if(token!==seq)return;raw=a;htfRaw=b||a;const hb=htfBias(htfRaw);
    model=M.buildLiquidityMap({candles:raw.candles,canonicalSwings:raw.canonicalSwings,canonicalEvents:raw.events,timeframe:currentTf,htfBias:hb});
    if(!model.ok)throw new Error(model.error||'유동성 분석 실패');
    $('chartTitle').textContent=symbol+' · '+LABEL[currentTf];$('chartMeta').textContent='HTF '+LABEL[htf]+' · '+biasKo(hb)+' · 확정봉 '+model.candles.length+'개 · 진행봉 제외';
    renderCards();draw();syncSymbol(symbol);$('status').textContent='완료 · '+model.scenario.phaseLabel;
  }catch(e){if(token!==seq)return;$('status').textContent='분석 실패';$('scenarioText').textContent=e.message||String(e)}
}
function savePng(){const cv=$('snapshot');if(!model||!cv)return;cv.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=clean($('symbol').value)+'-'+currentTf+'-liquidity-map.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1200)},'image/png')}
function init(){
  const q=new URLSearchParams(location.search),symbol=clean(q.get('symbol')||'BTCUSDT'),tf=String(q.get('tf')||'1h');$('symbol').value=symbol;if(TF.includes(tf))currentTf=tf;
  for(const t of TF){const b=document.createElement('button');b.textContent=LABEL[t];b.dataset.tf=t;b.classList.toggle('active',t===currentTf);b.onclick=()=>{currentTf=t;document.querySelectorAll('#tfTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tf===t));run()};$('tfTabs').append(b)}
  $('run').onclick=()=>run();$('savePng').onclick=savePng;$('symbol').onkeydown=e=>{if(e.key==='Enter')run()};document.querySelectorAll('[data-layer]').forEach(x=>x.onchange=draw);run();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
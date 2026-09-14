(()=>{
  if(window.__pulseMtfSnapshotsV1)return;window.__pulseMtfSnapshotsV1=true;
  const TFS=['15m','1h','4h','1d'];
  const COLORS={bg:'#07111b',grid:'#1a2a3d',up:'#35d69a',down:'#ff6b7a',text:'#dce8f7',muted:'#8096af',support:'#55dfb4',resist:'#ff7480',fvg:'rgba(159,122,234,.14)',ob:'rgba(255,190,80,.13)',liq:'rgba(64,178,255,.13)',cloudUp:'rgba(53,214,154,.09)',cloudDn:'rgba(255,107,122,.08)'};
  const $=id=>document.getElementById(id);
  const num=v=>{v=Number(v);return Number.isFinite(v)?v:null};
  function symbol(){return (($('symbol')?.value)||window.symbol||new URLSearchParams(location.search).get('symbol')||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'')}
  async function jget(u){const r=await fetch(u,{cache:'no-store',headers:{Accept:'application/json'}}),t=await r.text();let j;try{j=JSON.parse(t)}catch{throw Error('응답 형식 오류')}if(!r.ok||!j?.ok)throw Error(j?.error||`HTTP ${r.status}`);return j}
  function ensureUI(){
    if($('mtfSnapshotV1'))return true;
    const host=document.querySelector('main,.wrap,.workspace,.container,.app')||document.body;
    if(!host)return false;
    const sec=document.createElement('section');sec.id='mtfSnapshotV1';sec.innerHTML=`<div class="mtfs-head"><div><b>MTF 분석 스냅샷</b><small>15m · 1h · 4h · 1d 고정 캔들 이미지</small></div><button id="mtfsRefresh">분석 갱신</button></div><div id="mtfsStatus">대기</div><div class="mtfs-grid">${TFS.map(tf=>`<article class="mtfs-card"><div class="mtfs-title"><b>${tf}</b><span id="mtfsMeta-${tf}">-</span></div><canvas id="mtfs-${tf}" width="900" height="520"></canvas></article>`).join('')}</div>`;
    const firstChart=document.querySelector('#chartBox,.chart-card,.chartPanel,.price-panel,.chart-wrap,canvas');
    const anchor=firstChart?.closest?.('section,.card,.panel,.box,div');
    if(anchor?.parentNode)anchor.parentNode.insertBefore(sec,anchor.nextSibling);else host.appendChild(sec);
    const st=document.createElement('style');st.id='mtfSnapshotV1Style';st.textContent=`#mtfSnapshotV1{margin:12px 0;padding:12px;border:1px solid #24364d;border-radius:16px;background:#09131f;color:#e8f0fb}.mtfs-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.mtfs-head b{font-size:18px}.mtfs-head small{display:block;color:#8296ad;font-size:11px;margin-top:3px}#mtfsRefresh{background:#0d5fc9;color:white;border:1px solid #3b82f6;border-radius:10px;padding:9px 13px;font-weight:700}#mtfsStatus{font-size:11px;color:#8296ad;margin:7px 0}.mtfs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mtfs-card{border:1px solid #22364d;border-radius:13px;background:#07111b;overflow:hidden}.mtfs-title{display:flex;justify-content:space-between;align-items:center;padding:9px 10px;color:#e7eef8}.mtfs-title span{font-size:10px;color:#8296ad}.mtfs-card canvas{display:block;width:100%;height:auto;background:#07111b}@media(max-width:760px){.mtfs-grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}.mtfs-card{min-width:92%;scroll-snap-align:start}.mtfs-head b{font-size:16px}}`;document.head.appendChild(st);
    $('mtfsRefresh').onclick=()=>refresh(true);
    return true;
  }
  function ichimoku(c){
    const mid=(arr,i,n)=>{if(i<n-1)return null;let hi=-Infinity,lo=Infinity;for(let k=i-n+1;k<=i;k++){hi=Math.max(hi,+arr[k].high);lo=Math.min(lo,+arr[k].low)}return(hi+lo)/2};
    return c.map((_,i)=>{const ten=mid(c,i,9),kij=mid(c,i,26),a=ten!=null&&kij!=null?(ten+kij)/2:null,b=mid(c,i,52);return{a,b}})
  }
  function draw(tf,d){
    const cv=$(`mtfs-${tf}`);if(!cv)return;const ctx=cv.getContext('2d'),W=cv.width,H=cv.height,p={l:48,r:64,t:28,b:28};
    const full=d.candles||[],c=full.slice(-140),off=full.length-c.length;if(!c.length)return;
    let min=Math.min(...c.map(x=>+x.low)),max=Math.max(...c.map(x=>+x.high));const zones=d.zones||[];for(const z of zones){if(num(z.low)!=null)min=Math.min(min,+z.low);if(num(z.high)!=null)max=Math.max(max,+z.high)}const span=Math.max(1e-9,max-min);min-=span*.05;max+=span*.05;
    const x=i=>p.l+i*(W-p.l-p.r)/Math.max(1,c.length-1),y=v=>p.t+(max-v)/(max-min)*(H-p.t-p.b);
    ctx.clearRect(0,0,W,H);ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1;for(let g=0;g<5;g++){const yy=p.t+g*(H-p.t-p.b)/4;ctx.beginPath();ctx.moveTo(p.l,yy);ctx.lineTo(W-p.r,yy);ctx.stroke();const pr=max-g*(max-min)/4;ctx.fillStyle=COLORS.muted;ctx.font='11px system-ui';ctx.fillText(pr>=100?pr.toFixed(0):pr.toPrecision(5),W-p.r+5,yy+4)}
    const ichi=ichimoku(c);for(let i=1;i<c.length;i++){const q=ichi[i-1],r=ichi[i];if(q.a==null||q.b==null||r.a==null||r.b==null)continue;ctx.fillStyle=((q.a+q.b+r.a+r.b)/4 >= (c[i].close+c[i-1].close)/2)?COLORS.cloudDn:COLORS.cloudUp;ctx.beginPath();ctx.moveTo(x(i-1),y(q.a));ctx.lineTo(x(i),y(r.a));ctx.lineTo(x(i),y(r.b));ctx.lineTo(x(i-1),y(q.b));ctx.closePath();ctx.fill()}
    for(const z of zones.slice(0,8)){const lo=num(z.low),hi=num(z.high);if(lo==null||hi==null)continue;ctx.fillStyle=z.type==='support'?COLORS.liq:'rgba(255,107,122,.08)';ctx.fillRect(p.l,y(hi),W-p.l-p.r,Math.max(2,y(lo)-y(hi)))}
    for(let i=0;i<c.length;i++){const k=c[i],xx=x(i),up=+k.close>=+k.open;ctx.strokeStyle=ctx.fillStyle=up?COLORS.up:COLORS.down;ctx.beginPath();ctx.moveTo(xx,y(+k.low));ctx.lineTo(xx,y(+k.high));ctx.stroke();const yo=y(Math.max(+k.open,+k.close)),yc=y(Math.min(+k.open,+k.close));ctx.fillRect(xx-2.2,yo,4.4,Math.max(1,yc-yo))}
    function line(L,color){if(!L)return;const raw=Array.isArray(L.touchPoints)?L.touchPoints:[];const pts=raw.map(q=>({i:Number(q.barIndex),p:num(q.price)})).filter(q=>Number.isFinite(q.i)&&q.p!=null&&q.i>=off&&q.i<full.length);if(pts.length<2)return;const a=pts[0],b=pts.at(-1),ia=a.i-off,ib=b.i-off;if(ib<=ia)return;ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x(ia),y(a.p));ctx.lineTo(x(ib),y(b.p));ctx.stroke();for(const q of pts){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(q.i-off),y(q.p),3.5,0,Math.PI*2);ctx.fill()}}
    line(d.trendlines?.support,COLORS.support);line(d.trendlines?.resistance,COLORS.resist);
    for(const e of (d.events||[]).slice(-14)){const gi=Number(e.i),lvl=num(e.level);if(!Number.isFinite(gi)||lvl==null||gi<off||gi>=full.length)continue;ctx.fillStyle=e.dir==='up'?COLORS.up:COLORS.down;ctx.font='bold 11px system-ui';ctx.fillText(e.type,x(gi-off)+3,y(lvl)+(e.dir==='up'?-7:14))}
    ctx.fillStyle=COLORS.text;ctx.font='bold 15px system-ui';ctx.fillText(`${d.symbol||symbol()} · ${tf}`,p.l,18);
    ctx.fillStyle=COLORS.muted;ctx.font='10px system-ui';ctx.fillText('고정 140봉 · 추세선은 실제 touch swing 사이만 표시',p.l,H-8);
  }
  let busy=false,lastSym='';
  async function refresh(force=false){if(busy||!ensureUI())return;const s=symbol();if(!force&&s===lastSym)return;busy=true;$('mtfsStatus').textContent=`${s} 스냅샷 생성 중...`;try{const out=await Promise.allSettled(TFS.map(tf=>jget(`/api/structure?symbol=${encodeURIComponent(s)}&interval=${tf}&limit=500&_=${Date.now()}`)));out.forEach((r,i)=>{const tf=TFS[i],m=$(`mtfsMeta-${tf}`);if(r.status==='fulfilled'){draw(tf,r.value);if(m)m.textContent=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' 생성'}else{if(m)m.textContent='오류';const cv=$(`mtfs-${tf}`);if(cv){const x=cv.getContext('2d');x.fillStyle=COLORS.bg;x.fillRect(0,0,cv.width,cv.height);x.fillStyle=COLORS.down;x.font='16px system-ui';x.fillText('스냅샷 생성 실패',40,60)}}});lastSym=s;$('mtfsStatus').textContent=`${s} · MTF 4개 스냅샷 완료`}finally{busy=false}}
  function install(){if(!ensureUI())return false;setTimeout(()=>refresh(false),350);return true}
  let n=0,t=setInterval(()=>{if(install()&&++n>12)clearInterval(t);else if(++n>80)clearInterval(t)},300);
  document.addEventListener('change',e=>{if(e.target?.id==='symbol')setTimeout(()=>refresh(true),500)});
})();
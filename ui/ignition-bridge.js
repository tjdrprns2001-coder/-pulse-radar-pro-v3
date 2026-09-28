(()=>{'use strict';
const $=id=>document.getElementById(id);
const CACHE_KEY='pulse.ignition.last-good.v1';
const VOLUME_KEY='pulse.ignition.volume-filter.v1';
let payload=null,timer=null,volumeMin=0;
try{volumeMin=Math.max(0,Number(localStorage.getItem(VOLUME_KEY)||0)||0)}catch{}
function saveLastGood(v){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),payload:v}))}catch{}}
function readLastGood(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!x?.payload)return null;const age=Date.now()-Number(x.savedAt||0);return age<=24*3600000?{...x,age}:null}catch{return null}}

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function num(v,d=2){const n=Number(v);return Number.isFinite(n)?n.toFixed(d):'N/A'}
function money(v){const n=Number(v);if(!Number.isFinite(n))return'N/A';if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';return n.toLocaleString('ko-KR')}
function age(ms){const n=Number(ms);if(!Number.isFinite(n))return'알 수 없음';if(n<60000)return Math.round(n/1000)+'초';if(n<3600000)return Math.round(n/60000)+'분';return(n/3600000).toFixed(1)+'시간'}
function date(v){const n=Number(v);return Number.isFinite(n)?new Date(n).toLocaleString('ko-KR'):'-'}
function modeLabel(mode){return mode==='binance-primary'?'🟢 Binance 원본':mode==='bybit-fallback'?'🟡 Bybit 대체 데이터':mode==='mixed-fallback'||mode==='mixed'?'🧩 혼합 · 대체 데이터':'⚪ 확인 필요'}
function modeClass(mode){return mode==='binance-primary'?'sourcePrimary':mode==='bybit-fallback'?'sourceFallback':mode==='mixed-fallback'||mode==='mixed'?'sourceMixed':'sourceNA'}
function src(v){return v==='BINANCE'?'Binance':v==='BYBIT'?'Bybit':v==='UNAVAILABLE'?'N/A':(v||'N/A')}
function volumeLabel(v){const n=Math.max(0,Number(v)||0);if(!n)return'OFF';if(n>=100000000)return'1억+';if(n>=10000000)return(n/10000000).toLocaleString('ko-KR',{maximumFractionDigits:1})+'천만+';return Math.round(n/1000000).toLocaleString('ko-KR')+'백만+'}
function updateVolumeScope(){
 const el=$('volumeScope');if(!el)return;
 const base=Math.max(0,Number(payload?.config?.minVolume)||0);
 el.textContent='거래대금 '+volumeLabel(volumeMin)+' · 스캔 수집 하한 '+(base?money(base):'없음');
}


function renderCounts(counts={}){
 const keys=[['universe','전체'],['filtered','1차'],['oi','OI'],['prescan','프리스캔'],['candidates','후보'],['deep','정밀']];
 $('counts').innerHTML=keys.map(([k,l])=>'<div class="count"><span>'+l+'</span><b>'+esc(counts[k]??'-')+'</b></div>').join('');
}

function candidateCard(x){
 const ready=x.usable===true;
 const taker=x.taker?.ratio;
 const funding=x.funding?.rate;
 const p=x.provenance||{};
 const frameSource=(p.frames||[]).length===1?src(p.frames[0]):(p.frames||[]).length>1?'혼합':'N/A';
 const takerText=Number.isFinite(Number(taker))?num(taker,2):'N/A';
 const profile=x.scanProfile||{},vol=profile.volume||{},der=profile.derivatives||{},gallery=profile.galleryValidation||{};
 const profileTags=[
   profile.stage?'<span class="tag">'+esc(profile.stage)+'</span>':'',
   Number.isFinite(Number(vol.rvol))?'<span class="tag">RVOL '+num(vol.rvol,2)+'x</span>':'',
   Number.isFinite(Number(vol.cmf))?'<span class="tag">CMF '+num(vol.cmf,2)+'</span>':'',
   Number.isFinite(Number(vol.mfi))?'<span class="tag">MFI '+num(vol.mfi,0)+'</span>':'',
   Number.isFinite(Number(der.oi4h))?'<span class="tag">OI4H '+num(der.oi4h,2)+'%</span>':'',
   Number.isFinite(Number(gallery.score))?'<span class="tag">갤러리 '+num(gallery.score,0)+'/100</span>':''
 ].filter(Boolean).join('');
 return '<article class="card">'+
   '<div class="cardHead"><div><div class="symbol">'+esc(x.symbol)+'</div><div class="meta">'+esc(({'준비중':'🌱 준비중','관심구간':'👀 관심구간','점화대기':'🔥 점화대기','점화초기':'🚀 점화초기','재축적':'🔄 재축적','과열':'⚠️ 과열','이미 진행':'📉 이미 진행','리테스트':'🧪 리테스트','제외':'⛔ 제외'}[x.status]||x.status||'👀 관찰'))+' · 📚 데이터 '+esc(x.coverage??'N/A')+'/10</div></div>'+
   '<div class="score '+(ready?'ready':'partial')+'">'+num(x.score,0)+'</div></div>'+
   '<div class="tags"><span class="tag">24H '+num(x.change,2)+'%</span><span class="tag">가격 '+num(x.price,6)+'</span><span class="tag">거래대금 '+money(x.quoteVolume)+'</span><span class="tag">⚖️ 체결비 '+takerText+'</span><span class="tag">💰 펀딩비 '+(Number.isFinite(Number(funding))?num(Number(funding)*100,4)+'%':'N/A')+'</span><span class="tag '+(ready?'ready':'partial')+'">'+(ready?'✅ 정밀 완료':'⏳ 분석 중')+'</span></div>'+
   '<div class="tags"><span class="tag '+modeClass(p.mode)+'">'+modeLabel(p.mode)+'</span><span class="tag">📦 미결제약정 '+src(p.oi)+'</span><span class="tag">📈 차트 '+frameSource+'</span><span class="tag '+(p.taker==='UNAVAILABLE'?'sourceNA':'')+'">Taker '+src(p.taker)+'</span><span class="tag">💰 펀딩비 '+src(p.funding)+'</span></div>'+
   (profileTags?'<div class="tags">'+profileTags+'</div>':'')+
   (x.reasons?.length?'<div class="reason">'+x.reasons.slice(0,3).map(esc).join(' · ')+'</div>':'')+
 '</article>';
}

function render(){
 if(!payload)return;
 const q=$('symbolSearch').value.trim().toUpperCase(),f=$('filter').value;
 let rows=Array.isArray(payload.candidates)?payload.candidates:[];
 rows=rows.filter(x=>(!q||x.symbol.includes(q))&&(f==='all'||(f==='ready'&&x.usable)||(f==='partial'&&!x.usable))&&(volumeMin<=0||Number(x.quoteVolume)>=volumeMin));
 $('results').innerHTML=rows.length?rows.map(candidateCard).join(''):'<div class="empty">조건에 맞는 후보가 없습니다.</div>';
}

async function load(){
 clearTimeout(timer);
 $('connection').textContent='조회 중';
 try{
   const r=await fetch('/api/ignition-results',{cache:'no-store'});
   const j=await r.json().catch(()=>({status:'degraded',error:'invalid_response'}));
   payload=j;
   if(!r.ok||j.status!=='ok'){
     const cached=readLastGood();
     if(cached){
       payload={...cached.payload,state:'fallback',sourceStatus:j.error||('HTTP '+r.status),bridgeCached:true,fetchedAt:Date.now()};
       $('connection').textContent='이전 정상 결과';$('connection').className='delayed';
       $('notice').textContent='IGNITION 연결이 일시적으로 불안정해 마지막 정상 결과를 표시합니다 · 캐시 '+age(cached.age)+' 전';
       $('scanStatus').textContent='재연결 중';
       $('candidateCount').textContent=String(payload.candidateCount??payload.candidates?.length??0);
       $('usableCount').textContent=String(payload.usableCount??0);
       $('freshness').textContent=age((payload.freshnessMs||0)+cached.age);
       $('freshness').className='delayed';
       $('stage').textContent=payload.stage||'-';
       $('dataMode').textContent=modeLabel(payload.dataMode);
       $('dataMode').className=modeClass(payload.dataMode);
       $('updatedAt').textContent='마지막 정상 '+date(payload.updatedAt||cached.savedAt);
       renderCounts(payload.counts||{});
       updateVolumeScope();
       render();
       timer=setTimeout(load,12000);return;
     }
     $('connection').textContent='재연결 중';$('connection').className='degraded';
     $('notice').textContent='IGNITION 상류 서비스 재연결 중 · '+(j.error||('HTTP '+r.status));
     $('results').innerHTML='<div class="empty">잠시 후 자동으로 다시 연결합니다. Pulse Radar의 다른 기능은 계속 사용할 수 있습니다.</div>';
     timer=setTimeout(load,12000);return;
   }
   if(j.state==='stale-active'||j.staleActive){
     const cached=readLastGood();
     if(cached&&cached.payload?.state!=='partial'&&cached.payload?.state!=='stale-active'){
       payload={...cached.payload,state:'fallback',sourceStatus:'stale_active_discarded',bridgeCached:true,fetchedAt:Date.now()};
       $('connection').textContent='이전 정상 결과';$('connection').className='delayed';
       $('scanStatus').textContent='오래된 작업 폐기';
       $('candidateCount').textContent=String(payload.candidateCount??payload.candidates?.length??0);
       $('usableCount').textContent=String(payload.usableCount??0);
       $('freshness').textContent=age((payload.freshnessMs||0)+cached.age);$('freshness').className='delayed';
       $('stage').textContent=payload.stage||'-';
       $('dataMode').textContent=modeLabel(payload.dataMode);$('dataMode').className=modeClass(payload.dataMode);
       $('updatedAt').textContent='마지막 정상 '+date(payload.updatedAt||cached.savedAt);
       $('notice').textContent='오래된 활성 검색을 폐기하고 마지막 정상 완료 결과를 표시합니다 · 상류 단계 '+(j.stage||'-')+' · 신선도 '+age(j.freshnessMs);
       renderCounts(payload.counts||{});updateVolumeScope();render();
       timer=setTimeout(load,15000);return;
     }
     payload=j;
     $('connection').textContent='오래된 작업';$('connection').className='degraded';
     $('scanStatus').textContent='작업 폐기 대기';
     $('candidateCount').textContent=String(j.candidateCount??0);$('usableCount').textContent=String(j.usableCount??0);
     $('freshness').textContent=age(j.freshnessMs);$('freshness').className='stale';
     $('stage').textContent=j.stage||'-';$('dataMode').textContent=modeLabel(j.dataMode);$('dataMode').className=modeClass(j.dataMode);
     $('updatedAt').textContent='마지막 갱신 '+date(j.updatedAt||j.fetchedAt);
     $('notice').textContent='IGNITION 검색 작업이 장시간 진행되지 않아 폐기 대상으로 분류했습니다. 새 작업 재시작을 기다리는 중입니다.';
     renderCounts(j.counts||{});updateVolumeScope();render();
     timer=setTimeout(load,15000);return;
   }
   if(j.state==='ready'||(j.state==='fallback'&&(j.candidateCount||0)>0))saveLastGood(j);
   $('connection').textContent=j.state==='fallback'?'이전 완료본':'연결됨';$('connection').className=j.state==='fallback'?'delayed':'live';
   $('scanStatus').textContent=j.sourceStatus&&j.sourceStatus!==j.scanStatus?(j.scanStatus+' / '+j.sourceStatus):(j.scanStatus||j.state||'-');
   $('candidateCount').textContent=String(j.candidateCount??0);
   $('usableCount').textContent=String(j.usableCount??0);
   $('freshness').textContent=age(j.freshnessMs);
   $('freshness').className=j.freshnessState||'';
   $('stage').textContent=j.stage||'-';
   $('dataMode').textContent=modeLabel(j.dataMode);
   $('dataMode').className=modeClass(j.dataMode);
   $('updatedAt').textContent='업데이트 '+date(j.updatedAt||j.fetchedAt);
   renderCounts(j.counts||{});
   updateVolumeScope();
   if(j.state==='empty')$('notice').textContent='연결은 정상입니다. 아직 검색 결과가 없습니다.';
   else if(j.state==='fallback')$('notice').textContent='최신 작업이 '+(j.sourceStatus||'실패/취소')+' 상태라 마지막 완료 결과를 안전하게 표시 중입니다.';
   else if(j.state==='partial')$('notice').textContent='부분 결과 수신 중 · 후보 '+j.candidateCount+'개 · 정밀 완료 '+j.usableCount+'개 · 분석 중 '+j.partialCount+'개';
   else $('notice').textContent='정밀 검색 완료 · 후보 '+j.candidateCount+'개 · 10TF 완료 '+j.usableCount+'개'+(j.fallbackCandidateCount?' · 🧩 대체 데이터 '+j.fallbackCandidateCount+'개':'');
   render();
   timer=setTimeout(load,j.active?10000:(j.state==='fallback'?30000:60000));
 }catch(e){
   const cached=readLastGood();
   if(cached){
     payload={...cached.payload,state:'fallback',sourceStatus:'bridge_unavailable',bridgeCached:true,fetchedAt:Date.now()};
     $('connection').textContent='이전 정상 결과';$('connection').className='delayed';
     $('notice').textContent='Pulse 브리지 재연결 중 · 마지막 정상 결과를 표시합니다 · 캐시 '+age(cached.age)+' 전';
     renderCounts(payload.counts||{});updateVolumeScope();render();
   }else{
     $('connection').textContent='재연결 중';$('connection').className='degraded';
     $('notice').textContent='Pulse 서버 프록시 재연결 중';
   }
   timer=setTimeout(load,12000);
 }
}
$('refreshBtn').onclick=load;$('filter').onchange=render;$('symbolSearch').oninput=render;
const volumeFilter=$('volumeFilter');
if(volumeFilter){
  volumeFilter.value=String(volumeMin);
  volumeFilter.onchange=e=>{volumeMin=Math.max(0,Number(e.target.value)||0);try{localStorage.setItem(VOLUME_KEY,String(volumeMin))}catch{}updateVolumeScope();render();};
}
window.addEventListener('beforeunload',()=>clearTimeout(timer));
updateVolumeScope();
load();
})();
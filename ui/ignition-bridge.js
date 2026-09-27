(()=>{'use strict';
const $=id=>document.getElementById(id);
let payload=null,timer=null;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function num(v,d=2){const n=Number(v);return Number.isFinite(n)?n.toFixed(d):'N/A'}
function money(v){const n=Number(v);if(!Number.isFinite(n))return'N/A';if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';return n.toLocaleString('ko-KR')}
function age(ms){const n=Number(ms);if(!Number.isFinite(n))return'알 수 없음';if(n<60000)return Math.round(n/1000)+'초';if(n<3600000)return Math.round(n/60000)+'분';return(n/3600000).toFixed(1)+'시간'}
function date(v){const n=Number(v);return Number.isFinite(n)?new Date(n).toLocaleString('ko-KR'):'-'}
function modeLabel(mode){return mode==='binance-primary'?'Binance 원본':mode==='bybit-fallback'?'Bybit fallback':mode==='mixed-fallback'||mode==='mixed'?'혼합 · fallback':'확인 필요'}
function modeClass(mode){return mode==='binance-primary'?'sourcePrimary':mode==='bybit-fallback'?'sourceFallback':mode==='mixed-fallback'||mode==='mixed'?'sourceMixed':'sourceNA'}
function src(v){return v==='BINANCE'?'Binance':v==='BYBIT'?'Bybit':v==='UNAVAILABLE'?'N/A':(v||'N/A')}

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
 return '<article class="card">'+
   '<div class="cardHead"><div><div class="symbol">'+esc(x.symbol)+'</div><div class="meta">'+esc(x.status||'관찰')+' · coverage '+esc(x.coverage??'N/A')+'/10</div></div>'+
   '<div class="score '+(ready?'ready':'partial')+'">'+num(x.score,0)+'</div></div>'+
   '<div class="tags"><span class="tag">24H '+num(x.change,2)+'%</span><span class="tag">가격 '+num(x.price,6)+'</span><span class="tag">거래대금 '+money(x.quoteVolume)+'</span><span class="tag">Taker '+takerText+'</span><span class="tag">Funding '+(Number.isFinite(Number(funding))?num(Number(funding)*100,4)+'%':'N/A')+'</span><span class="tag '+(ready?'ready':'partial')+'">'+(ready?'정밀 완료':'분석 중')+'</span></div>'+
   '<div class="tags"><span class="tag '+modeClass(p.mode)+'">'+modeLabel(p.mode)+'</span><span class="tag">OI '+src(p.oi)+'</span><span class="tag">차트 '+frameSource+'</span><span class="tag '+(p.taker==='UNAVAILABLE'?'sourceNA':'')+'">Taker '+src(p.taker)+'</span><span class="tag">Funding '+src(p.funding)+'</span></div>'+
   (x.reasons?.length?'<div class="reason">'+x.reasons.slice(0,3).map(esc).join(' · ')+'</div>':'')+
 '</article>';
}

function render(){
 if(!payload)return;
 const q=$('symbolSearch').value.trim().toUpperCase(),f=$('filter').value;
 let rows=Array.isArray(payload.candidates)?payload.candidates:[];
 rows=rows.filter(x=>(!q||x.symbol.includes(q))&&(f==='all'||(f==='ready'&&x.usable)||(f==='partial'&&!x.usable)));
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
     $('connection').textContent='연결 이상';$('connection').className='degraded';
     $('notice').textContent='IGNITION 결과를 읽지 못했습니다: '+(j.error||('HTTP '+r.status));
     $('results').innerHTML='<div class="empty">IGNITION은 독립 서비스이므로 오류가 나도 Pulse Radar의 다른 기능은 계속 사용할 수 있습니다.</div>';
     timer=setTimeout(load,30000);return;
   }
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
   if(j.state==='empty')$('notice').textContent='연결은 정상입니다. 아직 검색 결과가 없습니다.';
   else if(j.state==='fallback')$('notice').textContent='최신 작업이 '+(j.sourceStatus||'실패/취소')+' 상태라 마지막 완료 결과를 안전하게 표시 중입니다.';
   else if(j.state==='partial')$('notice').textContent='부분 결과 수신 중 · 후보 '+j.candidateCount+'개 · 정밀 완료 '+j.usableCount+'개 · 분석 중 '+j.partialCount+'개';
   else $('notice').textContent='정밀 검색 완료 · 후보 '+j.candidateCount+'개 · 10TF 완료 '+j.usableCount+'개'+(j.fallbackCandidateCount?' · fallback '+j.fallbackCandidateCount+'개':'');
   render();
   timer=setTimeout(load,j.active?10000:(j.state==='fallback'?30000:60000));
 }catch(e){
   $('connection').textContent='연결 이상';$('connection').className='degraded';
   $('notice').textContent='Pulse 서버 프록시 조회 실패';
   timer=setTimeout(load,30000);
 }
}
$('refreshBtn').onclick=load;$('filter').onchange=render;$('symbolSearch').oninput=render;
window.addEventListener('beforeunload',()=>clearTimeout(timer));
load();
})();
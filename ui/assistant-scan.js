(()=>{'use strict';const $=id=>document.getElementById(id),state={running:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+Number(v).toFixed(2)+'%':'N/A';
function card(x){const a=x.assistant||{},b=a.oiBuckets||{},path=Array.isArray(a.path)?a.path.join(' / '):'N/A',counter=(a.counterEvidence||[]).map(v=>'<li>'+esc(v)+'</li>').join('');
return '<article><div class="top"><b>'+esc(x.symbol)+'</b><span>'+esc(a.stage||'⚪ 관찰')+'</span></div>'+
'<div class="type">'+esc(a.type||'미완성')+'</div>'+
'<div class="grid"><span>24H <b>'+pct(x.priceChange24h)+'</b></span><span>OI 8~12H <b>'+pct(b.h8_12)+'</b></span><span>OI 4~8H <b>'+pct(b.h4_8)+'</b></span><span>OI 0~4H <b>'+pct(b.h0_4)+'</b></span><span>경로 <b>'+esc(path)+'</b></span><span>taker <b>'+esc(Number.isFinite(Number(a.takerLatest))?Number(a.takerLatest).toFixed(2):'N/A')+'</b></span><span>funding <b>'+pct(x.fundingRate)+'</b></span><span>1W 위치 <b>'+pct(a.range1wPct)+'</b></span><span>1D 위치 <b>'+pct(a.range1dPct)+'</b></span><span>방향 <b>'+esc(a.direction||'none')+'</b></span></div>'+
'<div class="source">출처 · '+esc(a.source||'N/A')+' · 파라미터 '+esc(a.paramSet||'N/A')+'</div><div class="counter"><b>반증 점검</b><ul>'+counter+'</ul></div></article>'}
function render(items){$('rows').innerHTML=items.length?items.map(card).join(''):'<div class="empty">현재 정밀 후보가 없습니다.</div>'}
async function run(){if(state.running)return;state.running=true;$('scan').disabled=true;$('status').textContent='1차 전체스캔 중…';try{
 const r=await fetch('/api/assistant-scan?mode=summary&limit=24',{cache:'no-store'});const s=await r.json();if(!r.ok||s.status!=='ok')throw new Error(s.error||'전체스캔 실패');
 const syms=s.candidateSymbols||[];$('status').textContent='정밀검사 0 / '+syms.length;let all=[];
 for(let i=0;i<syms.length;i+=6){const chunk=syms.slice(i,i+6);const d=await fetch('/api/assistant-scan?mode=deep&symbols='+encodeURIComponent(chunk.join(',')),{cache:'no-store'});const j=await d.json();if(d.ok&&j.status==='ok'){all=all.concat(j.items||[]);render(all)}$('status').textContent='정밀검사 '+Math.min(i+chunk.length,syms.length)+' / '+syms.length}
 $('updated').textContent=new Date().toLocaleString('ko-KR',{hour12:false});$('status').textContent='완료 · '+all.length+'개 정밀검사';
 }catch(e){$('status').textContent='오류 · '+e.message}finally{state.running=false;$('scan').disabled=false}}
$('scan').addEventListener('click',run);run();})();
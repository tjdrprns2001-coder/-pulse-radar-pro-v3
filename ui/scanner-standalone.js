(()=>{'use strict';
const $=s=>document.querySelector(s),results=$('#results'),notice=$('#notice');let last=[],busy=false;
function stage(name){document.querySelectorAll('.pipeline>div').forEach(x=>x.classList.toggle('active',x.dataset.stage===name))}
function n(v,d=1){const x=Number(v);return Number.isFinite(x)?x.toFixed(d):'-'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function stateLabel(x){return x?.scanClass?.label||x?.scanClass?.key||x?.v2Type||x?.category||'관찰'}
function score(x){return Number(x?.preIgnitionScore??x?.candidateScore??x?.priority??0)}
function card(x){const s=score(x),cls=s>=70?'good':s>=50?'warn':'';
 const oi=x?.derivativesProfile?.v2Profile?.oi4hPct??x?.oi4hPct??x?.oiChangePct;
 const taker=x?.derivativesProfile?.v2Profile?.takerRatio??x?.takerRatio??x?.takerBuySellRatio;
 const rvol=x?.rvol??x?.setupFeatures?.breakout?.rvol??x?.preScan?.rvol;
 return '<article class="card" data-symbol="'+esc(x.symbol)+'"><div class="row"><h3>'+esc(x.symbol)+'</h3><span class="score '+cls+'">'+n(s,0)+'</span></div><div class="meta">'+esc(stateLabel(x))+' · '+esc(x.sector||'기타')+'</div><div><span class="tag">24H '+n(x.priceChange24h,2)+'%</span><span class="tag">OI4H '+n(oi,2)+'%</span><span class="tag">Taker '+n(taker,2)+'</span><span class="tag">RVOL '+n(rvol,2)+'</span></div><div class="row"><span>v2</span><b>'+esc(x.v2Type||'-')+'</b></div><div class="row"><span>v3</span><b>'+esc(x.v3LongTier||'-')+'</b></div></article>'}
function render(){const q=$('#search').value.trim().toUpperCase(),lim=Number($('#limit').value)||12;const rows=last.filter(x=>!q||x.symbol.includes(q)).slice(0,lim);results.innerHTML=rows.length?rows.map(card).join(''):'<div class="empty">표시할 후보가 없습니다.</div>';$('#candidates').textContent=String(last.length)}
async function api(params){const r=await fetch('/api/scanner-core?'+new URLSearchParams(params),{cache:'no-store'});const j=await r.json();if(!r.ok||j.status!=='ok')throw new Error(j.error||'scan failed');return j}
async function run(type){if(busy)return;busy=true;const t=performance.now();$('#state').textContent='스캔 중';notice.textContent=type==='fast'?'전체 유니버스에서 1H·4H 후보를 압축 중…':'프리스캔 후 선택 후보만 8TF 정밀 분석 중…';stage(type==='fast'?'prescan':'deep');
 try{const j=await api(type==='fast'?{stage:'fast',limit:40}:{stage:'deep',limit:30,validation:$('#validation').value});
 last=j.items||[];$('#universe').textContent=j.scanCount??j.universeMeta?.count??'-';$('#updated').textContent=new Date(j.updatedAt||Date.now()).toLocaleString('ko-KR');$('#state').textContent=j.partial?'부분 완료':'완료';stage(type==='fast'?'prescan':'risk');
 notice.textContent=type==='fast'?'후보 압축 완료. 정밀 스캔을 누르면 이 후보군 중심으로 8TF 분석합니다.':'정밀 분석 완료 · '+(j.validationMode||$('#validation').value)+' 검증';render()}
 catch(e){$('#state').textContent='오류';notice.textContent='스캔 오류: '+e.message}
 finally{$('#elapsed').textContent=((performance.now()-t)/1000).toFixed(1)+'초';busy=false}}
$('#fastBtn').onclick=()=>run('fast');$('#deepBtn').onclick=()=>run('deep');$('#search').oninput=render;$('#limit').onchange=render;render();
})();
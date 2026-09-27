(()=>{'use strict';
const $=id=>document.getElementById(id);let filter='all',items=[];
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const pct=v=>{const n=num(v);return n==null?'—':(n>=0?'+':'')+n.toFixed(2)+'%'};
const cls=v=>{const n=num(v);return n==null?'':n>0?'pos':n<0?'neg':''};
const age=t=>{const n=num(t);if(n==null)return'-';const s=Math.max(0,Math.floor((Date.now()-n)/1000));return s<60?s+'초 전':s<3600?Math.floor(s/60)+'분 전':Math.floor(s/3600)+'시간 전'};
const time=t=>{const n=num(t);return n==null?'-':new Date(n).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})};
async function j(url,opt={},timeout=12000){const c=new AbortController(),tm=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{...opt,cache:'no-store',signal:c.signal});const b=await r.json();if(!r.ok)throw new Error(b.error||('HTTP '+r.status));return b}finally{clearTimeout(tm)}}
function badge(t,c=''){return '<span class="badge '+c+'">'+t+'</span>'}
function compactRow(x){const e=Array.isArray(x.errors)?x.errors:[],f=x.frames||{};return '<article class="coin">'+
'<div class="coinTop"><div><div class="symbol">'+String(x.symbol||'-')+'</div><div class="coinFoot">'+(x.marketCapUsd?'시총 $'+Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(x.marketCapUsd):'시총 미확인')+'</div></div><div class="badges">'+badge(x.tier||'unknown',x.tier||'')+(e.length?badge('오류 '+e.length,'error'):'')+'</div></div>'+
'<div class="metrics">'+
'<div class="metric"><span>OI 4H</span><b class="'+cls(x.oi?.oi4hPct)+'">'+pct(x.oi?.oi4hPct)+'</b></div>'+
'<div class="metric"><span>Funding</span><b class="'+cls(x.fundingPct)+'">'+pct(x.fundingPct)+'</b></div>'+
'<div class="metric"><span>1H</span><b class="'+cls(f['1h']?.barChangePct)+'">'+pct(f['1h']?.barChangePct)+'</b></div>'+
'<div class="metric"><span>4H</span><b class="'+cls(f['4h']?.barChangePct)+'">'+pct(f['4h']?.barChangePct)+'</b></div>'+
'</div><div class="coinFoot"><span>'+(x.complete?'정밀 데이터 완료':'부분 데이터')+'</span><span>'+age(x.updatedAt)+'</span></div></article>'}
function render(){const q=$('query').value.trim().toUpperCase();const out=items.filter(x=>(!q||String(x.symbol||'').includes(q))&&(filter==='all'||filter==='errors'?(filter==='all'||(x.errors||[]).length):x.tier===filter));$('list').innerHTML=out.length?out.map(compactRow).join(''):'<div class="empty">조건에 맞는 결과가 없습니다.</div>'}
function cards(run,h){
 const total=num(run?.selectedCount)??num(run?.universeCount)??num(h?.websocket?.symbolCount)??0,done=num(run?.completedCount)??0,remain=Math.max(0,num(run?.remainingCount)??(total-done)),err=num(run?.errorCount)??0,p=total?done/total*100:0,tc=run?.tierCounts||{};
 $('status').textContent=run?.status||h?.fullScan?.status||'-';$('runId').textContent=run?.id||h?.fullScan?.runId||'-';
 $('universe').textContent=total||'-';$('completed').textContent=done+'/'+total;$('remaining').textContent='남음 '+remain;$('errors').textContent=err;
 $('barFill').style.width=Math.min(100,p).toFixed(1)+'%';$('progressText').textContent=p.toFixed(1)+'% · '+done+' / '+total+' 종목';
 $('smallCount').textContent=tc.small??'-';$('midCount').textContent=tc.mid??'-';$('largeCount').textContent=tc.large??'-';$('unknownCount').textContent=tc.unknown??'-';
 $('nextAuto').textContent=time(h?.nextAutoBucketAt);
 const cap=h?.marketCaps||{};$('capSource').textContent=cap.source||'-';$('capCoverage').textContent=cap.count!=null?'매핑 '+cap.count+'개':'-';
 const w=h?.websocket||{};$('ws').textContent=(w.shardCount??'-')+' shard';$('wsDetail').textContent='심볼 '+(w.symbolCount??'-')+' · live '+(w.latestCount??0);
 $('manual').hidden=!h?.manualEnabled;
}
async function load(){
 $('refresh').disabled=true;
 try{
   const h=await j('/api/v1/health'),rid=h?.fullScan?.runId;let run=null,data=null;
   if(rid)run=await j('/api/v1/runs/'+encodeURIComponent(rid)+'?items=1&compact=1&limit=200').catch(()=>null);
   if(!run||run.status==='DONE'||run.status==='FAILED')data=await j('/api/v1/results?compact=1&limit=500').catch(()=>null);
   const src=data?.items?.length?data:run;items=Array.isArray(src?.items)?src.items:[];
   cards(run||data,h);render();
   $('resultNote').textContent=run?.status==='FAILED'&&data?.items?.length?'현재 회차 실패 · 아래는 최근 완료 회차 결과':data?.items?.length?'최근 완료 회차 결과':'현재 진행 중인 회차의 완료된 일부 종목';
   $('updated').textContent='상태 '+age(run?.updatedAt||h?.fullScan?.updatedAt||Date.now());
 }catch(e){$('status').textContent='연결 오류';$('progressText').textContent=e.message;$('list').innerHTML='<div class="empty">데이터를 불러오지 못했습니다.</div>'}
 finally{$('refresh').disabled=false}
}
$('refresh').addEventListener('click',load);$('query').addEventListener('input',render);
$('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;filter=b.dataset.filter;for(const x of $('filters').querySelectorAll('button'))x.classList.toggle('active',x===b);render()});
$('manual').addEventListener('click',async()=>{const tier=prompt('수동 스캔 규모: small, mid, large 중 쉼표로 입력','small,mid,large');if(!tier)return;const token=prompt('관리자 토큰을 입력하세요 (저장되지 않음)');if(!token)return;try{const d=await j('/api/v1/manual-scan',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({tiers:tier.split(',').map(x=>x.trim())})},15000);alert('수동 스캔 시작: '+d.runId);load()}catch(e){alert('수동 스캔 실패: '+e.message)}});
load();setInterval(load,5000);
})();
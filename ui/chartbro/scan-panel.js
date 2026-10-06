(function(){'use strict';
const $=s=>document.querySelector(s),dom=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;},time=ChartBroRenderer.time;
async function api(action,q,signal){const r=await fetch('/api/index?'+new URLSearchParams({route:'chartbro',action,...q}),{signal,cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw Object.assign(Error(j.error||'HTTP '+r.status),{retry_at:j.retry_at});return j;}
const labels={LOADING:'모집단 조회 중',RUNNING:'스캔 중',PAUSED:'일시정지',CANCELLED:'취소됨',COMPLETED:'완료',PARTIAL:'일부 조회 실패',FAILED:'조회 실패'};
function render(s){if(!s)return;const done=s.results.length,ok=s.results.filter(r=>r.ok).length,confirmed=s.results.filter(r=>r.confirmed).length;
 $('#scan-status').textContent=(labels[s.state]||s.state)+' · 처리 '+done+'/'+s.tasks.length+' · 성공 '+ok+' · 실패/부분 '+(done-ok)+' · 구조 확인 '+confirmed+(s.decision_at?' · 기준 '+time(s.decision_at)+' KST':'')+(s.retry_at?' · 재시도 '+time(s.retry_at)+' KST':'')+(s.error?' · '+s.error:'')+(s.checkpoint_saved===false?' · 탭 체크포인트 저장 불가 · JSON 저장 권장':'');
 $('#scan-start').disabled=['LOADING','RUNNING'].includes(s.state);$('#scan-pause').disabled=s.state!=='RUNNING';$('#scan-resume').disabled=!['PAUSED','CANCELLED'].includes(s.state);$('#scan-cancel').disabled=!['LOADING','RUNNING','PAUSED'].includes(s.state);$('#scan-progress').max=Math.max(1,s.tasks.length*s.timeframes.length);$('#scan-progress').value=done*s.timeframes.length+Object.keys(s.frames).length;
 const population=$('#scan-population');population.replaceChildren();for(const g of s.groups||[])population.append(dom('p',g.venue.toUpperCase()+' · 전체 '+g.universe_count+' → 조건 통과 '+g.symbols.length+' · 변화율 결측 '+(g.missing_price_count||0)+' · 거래대금 결측 '+(g.missing_volume_count||0)));for(const e of s.universe_errors||[])population.append(dom('p',e.venue.toUpperCase()+' 조회 실패: '+e.error));
 const table=dom('table'),header=dom('tr');['종목 / 거래소','구조 / 유형','RVOL / 압축','OI 4H / 펀딩','롱 조건 / 신뢰도','근거 / 반증 / 미확보','상태'].forEach(x=>header.append(dom('th',x)));table.append(header);
 for(const r of [...s.results].reverse()){
  const tr=dom('tr'),cell=dom('td'),a=dom('a',r.symbol+' / '+r.venue.toUpperCase());a.href='/chartbro-lab.html?'+new URLSearchParams({symbol:r.symbol,venue:r.venue,market:r.market,tf:'4h'});a.target='_blank';a.rel='noopener';cell.append(a);tr.append(cell);
  const errors=Object.entries(r.frames).filter(([,v])=>!v.ok).map(([tf,v])=>tf+': '+v.error),pct=x=>x==null?'N/A':x.toFixed(2)+'%';
  [r.structure+' / '+r.type,(r.rvol==null?'N/A':r.rvol.toFixed(2)+'배')+' / '+pct(r.compression_pct),pct(r.oi?.contracts_change_pct)+' / '+pct(r.funding?.rate==null?null:r.funding.rate*100),(r.assessment?.score==null?'N/A':r.assessment.score+'/100')+' / '+(r.ok?(r.assessment?.confidence?.grade||'N/A'):'D · 부분 조회'),r.assessment?('상승: '+r.assessment.bullish.slice(0,2).map(x=>x.text).join(' · ')+' / 반대: '+(r.assessment.contradictions.slice(0,2).map(x=>x.text).join(' · ')||'없음')+' / 미확보: '+r.assessment.unknown.map(x=>x.code).join(', ')):'미확보',!r.ok?(errors.join(' · ')||'부분/결측 데이터'):r.astra_eligible?'Astra 실행 조건 확인':r.confirmed?'구조 확인 · 수급 조건 대기':'관찰 · 실행 미확인'].forEach(x=>tr.append(dom('td',x)));table.append(tr);
 }$('#scan-results').replaceChildren(table);$('#scan-export').disabled=!s.results.length;
}
let storage=null;try{storage=sessionStorage;}catch{}
const scanner=ChartBroScanner.createScanner({api,storage,onChange:render});scanner.notify();
$('#scan-start').onclick=()=>scanner.start({venue:$('#scan-venue').value,market:$('#scan-market').value,mode:$('#scan-mode').value,volume_cut:$('#scan-volume').checked,flow:$('#scan-flow').checked});
$('#scan-pause').onclick=()=>scanner.pause();$('#scan-resume').onclick=()=>scanner.resume();$('#scan-cancel').onclick=()=>scanner.cancel();
$('#scan-export').onclick=()=>{const s=scanner.get();if(!s)return;const href=URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'})),a=dom('a');a.href=href;a.download='chartbro-scan-'+s.decision_at+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);};
})();

(function(){
  const $=id=>document.getElementById(id);const text=v=>String(v??'');
  function clear(el){while(el.firstChild)el.removeChild(el.firstChild)}
  function openReport(symbol){const s=String(symbol||'').trim().toUpperCase();if(!s)return;try{parent.postMessage({type:'pulse-nav',view:'report',symbol:s},'*')}catch{}if(window===parent)location.href=`/coin-report.html?symbol=${encodeURIComponent(s)}`}
  function row(label,detail,symbol=null){const d=document.createElement('div');d.className='item';const b=document.createElement('b');b.textContent=label;const s=document.createElement('span');s.textContent=detail||'';d.append(b,s);if(symbol){d.classList.add('reportItem');d.tabIndex=0;d.dataset.symbol=symbol;d.addEventListener('click',()=>openReport(symbol));d.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openReport(symbol)}})}return d}
  function eventRow(x){
    const d=document.createElement('div');d.className='eventItem';
    const head=document.createElement('div');head.className='eventHead';
    const b=document.createElement('b');b.textContent=`${text(x.symbol||'코인')} · ${text(x.eventTypeKo||'이벤트')}`;
    const badge=document.createElement('span');badge.className=`eventTier tier${text(x.sourceTier||'C')}`;badge.textContent=text(x.sourceTierKo||'출처 확인');
    head.append(b,badge);
    const meta=document.createElement('div');meta.className='eventMeta';meta.textContent=`${text(x.timingKo||'일정 미정')} · ${text(x.technicalStateKo||'이벤트 관찰')} · 촉매점수 ${text(x.catalystScore??0)}/20`;
    const title=document.createElement('div');title.className='eventTitle';title.textContent=text(x.titleKo||'이벤트 확인');
    const summary=document.createElement('div');summary.className='eventDetail';summary.textContent=text(x.summaryKo||'요약 없음');
    d.append(head,meta,title,summary);
    if(x.sourceUrl){const a=document.createElement('a');a.className='eventSource';a.rel='noopener noreferrer';a.target='_blank';a.href=x.sourceUrl;a.textContent=`출처: ${text(x.sourceName||'공식/뉴스')}`;d.append(a)}
    return d;
  }
  function renderList(id,items,map){const el=$(id);clear(el);if(!items?.length){el.append(row('없음',''));return}for(const x of items)el.append(map(x))}
  function render(data){
    $('summary').textContent=text(data.summary||'요약이 없습니다.');
    $('eventSummary').textContent=text(data.eventSummary||'현재 확인된 이벤트 요약이 없습니다.');
    $('updated').textContent=data.updatedAt?`업데이트 ${new Date(data.updatedAt).toLocaleString('ko-KR')}`:'업데이트 시간 없음';
    $('aiBadge').textContent=data.aiGenerated?'AI 브리핑':'규칙 기반';$('aiBadge').dataset.mode=data.aiGenerated?'ai':'fallback';
    renderList('eventCatalysts',data.eventCatalysts,eventRow);
    renderList('highlights',data.highlights,x=>row(text(x.symbol||x.title||'변화'),text(x.reason||x.category||''),x.symbol||null));
    renderList('watch',data.watch,x=>row(text(x.symbol||x.title||'관찰'),text(x.category||x.reason||''),x.symbol||null));
    renderList('warnings',data.dataWarnings,x=>row('주의',text(x)));
    const src=$('sources');clear(src);if(!data.sources?.length)src.append(row('출처 없음',''));else for(const x of data.sources){const a=document.createElement('a');a.className='source';a.rel='noopener noreferrer';a.target='_blank';a.href=x.url;a.textContent=text(x.title||x.url);src.append(a)}
  }
  async function load(){try{const r=await fetch('/api/pulse-ai?mode=brief',{headers:{Accept:'application/json'}});const j=await r.json();render(j)}catch(e){render({summary:'Pulse AI 브리핑을 불러오지 못했습니다.',eventSummary:'이벤트 정보를 불러오지 못했습니다.',eventCatalysts:[],dataWarnings:[e.message],highlights:[],watch:[],sources:[]})}}
  async function ask(){const q=$('question').value.trim();if(!q)return;$('answer').textContent='분석 중…';$('ask').disabled=true;try{const r=await fetch('/api/pulse-ai?mode=chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});const j=await r.json();$('answer').textContent=text(j.answer||j.summary||j.error||'응답 없음')}catch(e){$('answer').textContent=`오류: ${e.message}`}finally{$('ask').disabled=false}}
  $('ask').addEventListener('click',ask);$('question').addEventListener('keydown',e=>{if(e.key==='Enter')ask()});load();setInterval(load,30000);
})();
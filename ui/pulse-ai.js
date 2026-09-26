(()=>{'use strict';

const $=id=>document.getElementById(id);
const text=v=>String(v??'');
const selectedSymbol=()=>String(new URLSearchParams(location.search).get('symbol')||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'')||'BTCUSDT';
let current=null,loading=null,seq=0,lastLoadedAt=0;

function node(tag,cls,txt){
  const el=document.createElement(tag);if(cls)el.className=cls;if(txt!=null)el.textContent=text(txt);return el;
}
function clear(el){while(el?.firstChild)el.removeChild(el.firstChild)}
function fmtPct(v,d=1){const n=Number(v);return Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(d)}%`:'—'}
function fmtNum(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ko-KR'):'—'}
function fmtMoney(v){const n=Number(v);if(!Number.isFinite(n))return'—';if(Math.abs(n)>=1e9)return'USD '+(n/1e9).toFixed(2)+'B';if(Math.abs(n)>=1e6)return'USD '+(n/1e6).toFixed(1)+'M';if(Math.abs(n)>=1e3)return'USD '+(n/1e3).toFixed(1)+'K';return'USD '+n.toFixed(0)}
function age(ms){const n=Number(ms);if(!Number.isFinite(n))return'시간 미상';if(n<60000)return'방금';if(n<3600000)return`${Math.max(1,Math.floor(n/60000))}분 전`;return`${Math.floor(n/3600000)}시간 전`}
function openReport(symbol){
  const s=String(symbol||'').trim().toUpperCase();if(!s)return;
  try{parent.postMessage({type:'pulse-nav',view:'report',symbol:s},'*')}catch{}
  if(window===parent)location.href=`/coin-report.html?symbol=${encodeURIComponent(s)}`;
}
function itemRow(label,detail,symbol=null){
  const d=node('div','item'),left=node('div','itemLeft'),b=node('b','',label),span=node('span','',detail||'');
  left.append(b,span);d.append(left);
  if(symbol){
    const go=node('button','miniGo','보기');go.type='button';go.addEventListener('click',()=>openReport(symbol));d.append(go);
  }
  return d;
}
function confidenceClass(v){return v==='높음'?'high':v==='낮음'?'low':'mid'}
function candidateCard(x){
  const d=node('button','candidateCard');d.type='button';d.addEventListener('click',()=>openReport(x.symbol));
  const top=node('div','candidateTop'),sym=node('b','',x.symbol||'—'),score=node('span','scorePill',x.candidateScore!=null?`후보 ${x.candidateScore}`:'관찰');
  top.append(sym,score);
  const meta=node('div','candidateMeta',`${x.sector||'기타'} · 24H ${fmtPct(x.change24h)}`);
  const cls=node('div','candidateClass',x.scanClass?.label||x.category||'관찰');
  const reason=node('div','candidateReason',x.reason||'추가 근거 대기');
  d.append(top,meta,cls,reason);return d;
}
function eventRow(x){
  const d=node('div','eventItem'),head=node('div','eventHead'),b=node('b','',`${text(x.symbol||'코인')} · ${text(x.eventTypeKo||'이벤트')}`);
  const badge=node('span',`eventTier tier${text(x.sourceTier||'C')}`,text(x.sourceTierKo||'출처 확인'));head.append(b,badge);
  const meta=node('div','eventMeta',`${text(x.timingKo||'일정 미정')} · ${text(x.technicalStateKo||'이벤트 관찰')} · 촉매 ${text(x.catalystScore??0)}/20`);
  const title=node('div','eventTitle',text(x.titleKo||'이벤트 확인')),summary=node('div','eventDetail',text(x.summaryKo||'요약 없음'));
  d.append(head,meta,title,summary);
  if(x.sourceUrl){
    const a=node('a','eventSource',`출처: ${text(x.sourceName||'공식/뉴스')}`);a.rel='noopener noreferrer';a.target='_blank';a.href=x.sourceUrl;d.append(a);
  }
  return d;
}
const EVENT_LABELS={
  presurge_transition:'점화전 후보 진입',presurge_upgrade:'점화전 강도 상승',presurge_exit:'점화전 후보 이탈',
  score_jump:'후보점수 급상승',volume_spike:'거래량 급증',taker_buy:'매수 체결 우위 진입',oi_build:'OI 증가 진입',
  data_warning:'데이터 품질 경고',data_recovered:'데이터 복구',sector_rotation:'섹터 순환 변화'
};
function technicalRow(x){
  const label=EVENT_LABELS[x.type]||x.type||'변화',symbol=x.symbol||'시장';
  let detail='';
  if(x.delta!=null)detail=`+${Number(x.delta).toFixed(1)}점`;
  else if(x.value!=null)detail=String(Number(x.value).toFixed(2));
  else if(x.to)detail=`${x.from||'—'} → ${x.to}`;
  else if(x.clusters)detail=(x.clusters||[]).slice(0,3).map(c=>`${c.sector} ${c.count}`).join(' · ');
  return itemRow(`${symbol} · ${label}`,detail,x.symbol||null);
}
function renderList(id,items,mapper,empty='없음'){
  const el=$(id);clear(el);if(!Array.isArray(items)||!items.length){el.append(node('div','empty',empty));return}
  for(const x of items)el.append(mapper(x));
}
function renderResearch(r){
  const el=$('researchPanel');clear(el);
  if(!r){el.append(node('div','empty','Research AI 상태를 불러오지 못했습니다.'));return}
  const labels=Number(r.labels)||0,min=Number(r.model?.minimumLabels)||20,pct=Math.min(100,min?labels/min*100:0);
  const line=node('div','researchLine'),state=node('b','',`${r.model?.state||'SHADOW'} · ${r.shadowOnly===false?'ACTIVE':'SHADOW_ONLY'}`);
  const count=node('span','',`관측 ${fmtNum(r.observations)} · 대기 ${fmtNum(r.pending)} · 라벨 ${labels}/${min}`);
  line.append(state,count);
  const bar=node('div','progress'),fill=node('span','progressFill');fill.style.width=`${pct}%`;bar.append(fill);
  const detail=node('div','researchDetail',`확정 결과: 성공 ${fmtNum(r.positive)} · 실패 ${fmtNum(r.negative)} · 모델 ${r.model?.active?'활성':'워밍업'}`);
  el.append(line,bar,detail);
}
function renderFocus(f){
  const card=$('focusCard');
  if(!f||!f.found){card.hidden=true;return}
  card.hidden=false;$('focusSymbol').textContent=f.symbol;
  const baseMeta=[f.category||'관찰',f.marketScope||f.sector||'기타',`24H ${fmtPct(f.change24h)}`];
  if(f.candidateScore!=null)baseMeta.push(`후보 ${f.candidateScore}`);
  if(f.preIgnitionScore!=null)baseMeta.push(`점화전 ${f.preIgnitionScore}`);
  if(f.derivatives?.exchangeCount!=null)baseMeta.push(`선물 ${f.derivatives.exchangeCount}곳`);
  if(f.derivatives?.openInterestUsd!=null)baseMeta.push(`OI ${fmtMoney(f.derivatives.openInterestUsd)}`);
  if(f.derivatives?.fundingRate!=null)baseMeta.push(`펀딩 ${fmtPct(Number(f.derivatives.fundingRate)*100,4)}`);
  $('focusMeta').textContent=baseMeta.join(' · ');
  $('focusSummary').textContent=f.summary||f.reason||'추가 근거를 확인하는 중입니다.';
  const reasons=$('focusReasons');clear(reasons);for(const r of (f.reasons||[]).slice(0,4))reasons.append(node('span','chip',r));
  $('openReport').onclick=()=>openReport(f.symbol);
}
function render(data){
  current=data;
  const m=data.marketPulse||{},q=data.dataQuality||{},r=data.researchAI||null,candidates=data.candidates||[];
  $('summary').textContent=text(data.summary||'요약이 없습니다.');
  $('updated').textContent=data.scanUpdatedAt?`스캔 ${new Date(data.scanUpdatedAt).toLocaleString('ko-KR')} · ${age(Date.now()-Number(data.scanUpdatedAt))}`:'업데이트 시간 없음';
  $('aiBadge').textContent=data.aiGenerated?'생성형 AI':'로컬 분석';$('aiBadge').dataset.mode=data.aiGenerated?'ai':'fallback';
  $('providerBadge').textContent=data.aiGenerated?`${data.provider||'AI'} · ${data.model||''}`.trim():data.aiAvailable?'AI 대기 · 로컬 분석':'로컬 분석';
  $('dataBadge').textContent=q.state==='LIVE'?'데이터 LIVE':`데이터 ${q.state||'확인'}`;$('dataBadge').dataset.state=q.state||'UNKNOWN';
  $('marketRegime').textContent=m.regime==='RISK_ON'?'상승 확산':m.regime==='ALT_BREADTH'?'알트 확산 · 메이저 약세':m.regime==='RISK_OFF'?'위험 축소':m.regime==='MAJOR_DIVERGENCE'?'메이저 강세 · 시장 폭 약세':'혼조';
  $('marketRegime').dataset.regime=m.regime||'MIXED';
  $('breadth').textContent=`${fmtNum(m.up)} / ${fmtNum(m.down)}`;
  $('breadthDetail').textContent=`상승비 ${Number.isFinite(Number(m.breadthRatio))?(Number(m.breadthRatio)*100).toFixed(1)+'%':'—'}`;
  $('median').textContent=fmtPct(m.medianChange24h);
  $('majors').textContent=`BTC ${fmtPct(m.majors?.BTC)} · ETH ${fmtPct(m.majors?.ETH)} · SOL ${fmtPct(m.majors?.SOL)}`;
  $('candidateCount').textContent=fmtNum(candidates.length);
  $('candidateDetail').textContent=`전체 스캔 ${fmtNum(q.total||m.total)} · 과진행 별도`;
  $('researchState').textContent=r?.model?.state||'—';
  $('researchDetail').textContent=r?`라벨 ${fmtNum(r.labels)}/${fmtNum(r.model?.minimumLabels)} · 관측 ${fmtNum(r.observations)}`:'상태 없음';
  renderFocus(data.selectedFocus);
  renderList('candidates',candidates,candidateCard,'현재 과진행을 제외한 우선 후보가 없습니다.');
  renderList('sectors',data.sectors,x=>itemRow(`${x.sector} · 후보 ${x.candidates}개`,`평균 ${fmtPct(x.avgChange24h)} · ${(x.leaders||[]).join(', ')}`));
  renderResearch(r);
  $('eventSummary').textContent=text(data.eventSummary||'현재 확인된 이벤트 요약이 없습니다.');
  $('eventCount').textContent=fmtNum((data.eventCatalysts||[]).length);
  renderList('eventCatalysts',data.eventCatalysts,eventRow,'현재 확인된 공식·신뢰 이벤트가 없습니다.');
  $('changeCount').textContent=fmtNum((data.technicalEvents||[]).length);
  renderList('technicalEvents',data.technicalEvents,technicalRow,'새로운 기술 변화가 없습니다.');
  $('extendedCount').textContent=fmtNum((data.extended||[]).length);
  renderList('extended',data.extended,x=>itemRow(x.symbol,`${x.category} · 24H ${fmtPct(x.change24h)}`,x.symbol),'과진행 종목 없음');
  const warnings=data.dataWarnings||[];$('warningCount').textContent=fmtNum(warnings.length);
  renderList('warnings',warnings,x=>itemRow('주의',text(x)),'현재 데이터 경고가 없습니다.');$('warningsCard').open=warnings.length>0;
  const sources=data.sources||[];$('sourceCount').textContent=fmtNum(sources.length);
  const src=$('sources');clear(src);if(!sources.length)src.append(node('div','empty','표시할 외부 출처가 없습니다.'));
  for(const x of sources){const a=node('a','source',x.title||x.url);a.rel='noopener noreferrer';a.target='_blank';a.href=x.url;src.append(a)}
  lastLoadedAt=Date.now();$('answerStatus').textContent=data.aiGenerated?'AI 브리핑 + 로컬 검증':'로컬 분석 모드 · 스캐너/Research AI 근거 사용';
}
async function fetchJson(url,options={},timeout=45000){
  const controller=new AbortController(),external=options.signal,relay=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),timeout);
  if(external){if(external.aborted)controller.abort();else external.addEventListener('abort',relay,{once:true})}
  const opts={...options,signal:controller.signal,cache:'no-store'};
  try{
    const r=await fetch(url,opts);
    const j=await r.json().catch(()=>({status:'error',error:`HTTP ${r.status}`}));
    if(!r.ok||j.status==='error')throw new Error(j.error||`HTTP ${r.status}`);
    return j;
  }finally{
    clearTimeout(timer);if(external)external.removeEventListener('abort',relay);
  }
}
async function load(force=false){
  const my=++seq;if(loading)loading.abort();loading=new AbortController();
  $('refresh').disabled=true;$('refresh').textContent='갱신 중…';
  try{
    const q=new URLSearchParams({mode:'brief',symbol:selectedSymbol()});if(force){q.set('fresh','1');q.set('_',String(Date.now()))}
    const j=await fetchJson('/api/pulse-ai?'+q.toString(),{signal:loading.signal},55000);
    if(my===seq)render(j);
  }catch(e){
    if(e.name!=='AbortError'&&my===seq){
      $('dataBadge').textContent='Pulse AI 오류';$('dataBadge').dataset.state='DEGRADED';
      $('summary').textContent='Pulse AI 브리핑을 불러오지 못했습니다.';
      $('answerStatus').textContent=`오류: ${e.message}`;
    }
  }finally{
    if(my===seq){$('refresh').disabled=false;$('refresh').textContent='새로고침'}
  }
}
function addChat(role,message,meta=''){
  const wrap=node('div',`chatMsg ${role}`),head=node('div','chatMsgHead',role==='user'?'나':'Pulse AI'),body=node('div','chatMsgBody',message);
  wrap.append(head,body);if(meta)wrap.append(node('div','chatMsgMeta',meta));$('chatHistory').append(wrap);wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function ask(prefill=null){
  const input=$('question'),q=String(prefill||input.value||'').trim();if(!q)return;
  input.value='';addChat('user',q);$('ask').disabled=true;$('answerStatus').textContent='분석 중…';
  try{
    const j=await fetchJson('/api/pulse-ai?mode=chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:q,selectedSymbol:selectedSymbol(),deep:$('deep').checked})
    },70000);
    addChat('assistant',text(j.answer||j.summary||'응답 없음'),j.answerMode==='ai'?'생성형 AI + 스캐너 근거':'로컬 분석 + 스캐너 근거');
    $('answerStatus').textContent=j.answerMode==='ai'?'AI 답변 완료':'로컬 분석 답변 완료';
    if(j.researchAI||j.marketPulse)render({...current,...j});
  }catch(e){
    addChat('assistant',`오류: ${e.message}`,'요청 실패');$('answerStatus').textContent='질문 처리 실패';
  }finally{$('ask').disabled=false}
}
$('refresh').addEventListener('click',()=>load(true));
$('ask').addEventListener('click',()=>ask());
$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}});
$('quickPrompts').addEventListener('click',e=>{const b=e.target.closest('button[data-q]');if(b)ask(b.dataset.q)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastLoadedAt>60000)load(false)});
setInterval(()=>{if(!document.hidden)load(false)},60000);
load(false);
})()

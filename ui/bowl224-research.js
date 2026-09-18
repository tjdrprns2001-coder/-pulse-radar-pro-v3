(()=>{'use strict';
const $=id=>document.getElementById(id),valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)),pct=v=>valid(v)?(Number(v)*100).toFixed(1)+'%':'-',num=v=>valid(v)?Number(v).toFixed(2):'-';
async function get(url){const r=await fetch(url,{cache:'no-store'}),j=await r.json();if(!r.ok||j.status!=='ok')throw new Error(j.error||('HTTP '+r.status));return j}
function card(k,v){return '<article><b>'+k+'</b><span>'+v+'</span></article>'}
function cohortRows(stats){
 const names=[['3A','3A'],['3B','3B'],['3B1H','3B + 1H 교집합'],['3C','3C']];
 return names.map(function(x){const c=(stats.cohorts||{})[x[0]]||{},l=c.labels||{};return '<div class="trow"><b>'+x[1]+'</b><span>'+String(c.sampleCount||0)+'</span><span>'+pct(l.Hit_72H_10pct&&l.Hit_72H_10pct.hitRate)+'</span><span>'+pct(l.Hit_7D_10pct&&l.Hit_7D_10pct.hitRate)+'</span><span>'+pct(l.Hit_7D_15pct&&l.Hit_7D_15pct.hitRate)+'</span><span>'+pct(l.Hit_7D_20pct&&l.Hit_7D_20pct.hitRate)+'</span><span>'+pct(c.clean10pctMae3Share)+'</span><span>'+num((c.timeToHit72MedianMs||0)/3600000)+'h</span></div>'}).join('')
}
function eventRows(items){if(!items.length)return'<div class="empty">아직 formal 이벤트가 없습니다.</div>';return items.slice(0,30).map(function(e){return '<article><b>'+String(e.symbol||'')+'</b><span>'+String(e.cohort||'')+' · '+String(e.group||'-')+'</span><small>'+new Date(Number(e.signalCloseTs)).toLocaleString('ko-KR',{hour12:false})+'</small></article>'}).join('')}
async function load(){
 try{
  const r=await Promise.all([get('/api/bowl224-research?action=status'),get('/api/bowl224-research?action=stats'),get('/api/bowl224-research?action=events&limit=50')]);
  const st=r[0].data||{},stats=r[1].data||{},latest=(st.runs||[])[0]||{};
  $('status').textContent=st.initialized?'formal dataset 활성 · '+String(stats.formalEventCount||0)+' events':'아직 formal dataset이 초기화되지 않았습니다.';
  $('coverage').innerHTML=card('데이터 완전성',latest.status||'미실행')+card('선택 종목',String((latest.selectedSymbols||[]).length||0))+card('가설용 32코인 제외',stats.hypothesisEvidenceExcluded?'적용':'확인 필요')+card('규칙 버전','strict120 / VRP-v1');
  $('universeL').textContent=String(latest.universeLCount??(latest.selectedSymbols||[]).length??0);$('universeN').textContent=String(latest.universeNCount??0);
  $('cohorts').innerHTML=['3A','3B','3B1H','3C'].map(k=>card(k,String(((stats.cohorts||{})[k]||{}).sampleCount||0))).join('');
  $('groups').innerHTML=['A','B','C','D'].map(k=>card(k,String((stats.groups||{})[k]||0))).join('');
  $('outcomes').innerHTML='<div class="thead"><span>코호트</span><span>표본</span><span>72H +10%</span><span>7D +10%</span><span>7D +15%</span><span>7D +20%</span><span>+10% & MAE -3% 이내</span><span>Time-to-hit</span></div>'+cohortRows(stats);
  $('events').innerHTML=eventRows(r[2].items||[]);
 }catch(e){$('status').textContent='데이터를 불러오지 못했습니다 · '+String(e&&e.message||e);['coverage','cohorts','groups','outcomes','events'].forEach(id=>$(id).innerHTML='<div class="empty">다시 불러와 주세요.</div>')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
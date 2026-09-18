(()=>{'use strict';
const $=id=>document.getElementById(id);
const H=[['h3','3시간'],['h6','6시간'],['h12','12시간'],['h24','24시간'],['d3','3일']];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const pct=v=>valid(v)?(Number(v)*100).toFixed(1)+'%':'-';
const num=(v,d=2)=>valid(v)?Number(v).toFixed(d):'-';
async function get(url){const r=await fetch(url,{cache:'no-store'}),j=await r.json();if(!r.ok||j.status!=='ok')throw new Error(j.error||('HTTP '+r.status));return j}
function labelCard(x){return x?(String(x.hitCount)+'/'+String(x.evaluatedCount)+' · '+pct(x.hitRate)):'-'}
function integrity(status,stats){
 const manifest=(status.manifests||[])[0],warn=Boolean(stats.survivorshipWarning||status.survivorshipWarning);
 const rows=[['임계값 동결',manifest&&manifest.frozen?'동결됨':'확인 필요'],['Manifest',manifest&&manifest.manifestVersion||'-'],['표본',stats.sampleCount??0],['Unbiased 표본',stats.unbiasedSampleCount??0],['생존편향',warn?'생존편향 경고':'경고 없음'],['가설용 샘플','정식 통계에서 제외']];
 return rows.map(function(row){const a=row[0],b=row[1],cl=a==='생존편향'&&warn?'warn':'';return '<article class="'+cl+'"><b>'+esc(a)+'</b><span>'+esc(b)+'</span></article>'}).join('')
}
function horizonCards(stats){return H.map(function(pair){const k=pair[0],label=pair[1],h=(stats.horizons||{})[k]||{};return '<article><h3>'+label+'</h3><p>수익률 P50 <b>'+num(h.returnPct&&h.returnPct.p50)+'%</b></p><p>MFE P50 <b>'+num(h.mfePct&&h.mfePct.p50)+'%</b></p><p>MAE P50 <b>'+num(h.maePct&&h.maePct.p50)+'%</b></p><p>RR P50 <b>'+num(h.rr&&h.rr.p50)+'</b></p></article>'}).join('')}
function featureRows(stats){
 const rows=Object.entries(stats.features||{}).sort((a,b)=>(a[1].missingRate||0)-(b[1].missingRate||0)).slice(0,30);
 if(!rows.length)return'<div class="empty">아직 숫자 피처 표본이 없습니다.</div>';
 return '<div class="thead"><span>피처</span><span>P50</span><span>Missing</span><span>성공-실패 P50 차이</span></div>'+rows.map(function(pair){const k=pair[0],v=pair[1],c=(stats.featureComparison||{})[k];return '<div class="trow"><b>'+esc(k)+'</b><span>'+num(v.p50)+'</span><span>'+pct(v.missingRate)+'</span><span>'+num(c&&c.medianDifference)+'</span></div>'}).join('')
}
function eventRows(items){if(!items.length)return'<div class="empty">저장된 이벤트가 없습니다.</div>';return items.slice(0,30).map(function(x){return '<article><b>'+esc(x.symbol)+'</b><span>'+esc(String(x.datasetSplit||'').toUpperCase())+'</span><small>'+new Date(Number(x.signalCandleCloseTs)).toLocaleString('ko-KR',{hour12:false})+'</small><small>entry '+esc(x.entryPrice)+'</small></article>'}).join('')}
async function load(){
 $('refresh').disabled=true;$('status').textContent='정식 데이터셋 확인 중…';const split=$('split').value;
 try{
  const result=await Promise.all([get('/api/research-backtest?action=status'),get('/api/research-backtest?action=stats&split='+encodeURIComponent(split)),get('/api/research-backtest?action=events&split='+encodeURIComponent(split)+'&limit=50')]);
  const status=result[0].data||{},stats=result[1].data||{},ev=result[2];
  $('integrity').innerHTML=integrity(status,stats);$('hit6').textContent=labelCard(stats.labels&&stats.labels.Hit_6H_8pct);$('hit24').textContent=labelCard(stats.labels&&stats.labels.Hit_24H_12pct);$('horizons').innerHTML=horizonCards(stats);$('features').innerHTML=featureRows(stats);$('events').innerHTML=eventRows(ev.items||[]);
  $('status').textContent=split.toUpperCase()+' · 표본 '+String(stats.sampleCount||0)+' · '+(stats.validationIntegrity==='biased-universe-present'?'생존편향 경고':'데이터 무결성 확인');
 }catch(err){$('status').textContent='백테스트 데이터를 불러오지 못했습니다 · '+String(err&&err.message||err);['integrity','horizons','features','events'].forEach(id=>$(id).innerHTML='<div class="empty">데이터를 다시 불러와 주세요.</div>');$('hit6').textContent='-';$('hit24').textContent='-'}finally{$('refresh').disabled=false}
}
function init(){$('refresh').addEventListener('click',load);$('split').addEventListener('change',load);load()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
(()=>{'use strict';
const $=id=>document.getElementById(id);
const fmt=v=>v==null?'—':Number(v).toFixed(2)+'%';
async function get(action='status'){
  const r=await fetch('/api/learning-ai?action='+encodeURIComponent(action),{cache:'no-store'});
  const d=await r.json();if(!r.ok||d.status!=='ok')throw Error(d.error||('HTTP '+r.status));return d;
}
function renderStatus(s){
  $('obs').textContent=(s.observations||0).toLocaleString();
  $('labels').textContent=(s.labels||0).toLocaleString();
  $('pn').textContent=(s.positive||0)+' / '+(s.negative||0);
  $('model').innerHTML=s.model?.active?'<span class="good">ACTIVE</span>':'<span class="warn">WARMUP '+(s.labels||0)+'/'+(s.model?.minimumLabels||20)+'</span>';
  $('sources').innerHTML='급등 역추적 샘플 <b>'+(s.sources?.seedSamples||0)+'</b>개<br>책 기법 레지스트리 <b>'+(s.sources?.bookTechniques||0)+'</b>개<br>랭킹 사용 기법 <b>'+(s.sources?.bookRankingTechniques||0)+'</b>개';
  $('persist').innerHTML='저장소 <b>'+String(s.persistence||'—')+'</b><br>모델 <b>'+String(s.model?.type||'—')+'</b><br>마지막 학습 '+(s.model?.trainedAt?new Date(s.model.trainedAt).toLocaleString():'대기 중');
}
function renderRows(state){
  const rows=(state.observations||[]).slice(-30).reverse();
  $('rows').innerHTML=rows.length?rows.map(r=>'<tr><td><b>'+r.symbol+'</b></td><td>'+new Date(r.asOf||r.capturedAt).toLocaleString()+'</td><td>'+String(r.researchScore??'—')+'</td><td>'+String(r.researchStage||r.scannerState||'—')+'</td><td>'+fmt(r.outcome6hPct)+'</td><td>'+fmt(r.outcome24hPct)+'</td><td>'+(r.label===1?'<span class="good">성공</span>':r.label===0?'<span class="bad">실패</span>':'대기')+'</td></tr>').join(''):'<tr><td colspan="7">아직 자동스캔 학습 관측이 없습니다.</td></tr>';
}
async function refresh(){
  $('status').textContent='연구 AI 상태 불러오는 중…';
  try{
    const d=await get('export'),state=d.state||{};
    const s={version:state.version,updatedAt:state.updatedAt,observations:(state.observations||[]).length,labels:state.training?.labels||0,positive:state.training?.positive||0,negative:state.training?.negative||0,model:{type:state.model?.type,active:(state.training?.labels||0)>=20,minimumLabels:20,trainedAt:state.model?.trainedAt},sources:{seedSamples:state.memory?.seedSamples||0,bookTechniques:state.memory?.bookTechniques||0,bookRankingTechniques:state.memory?.bookRankingTechniques||0},persistence:state.memory?.persistence};
    renderStatus(s);renderRows(state);window.__researchAIState=state;
    $('status').textContent='정상 · '+new Date(state.updatedAt||Date.now()).toLocaleString()+' · SHADOW_ONLY';
  }catch(e){$('status').textContent='오류 · '+e.message}
}
$('refresh').onclick=refresh;
$('exportBtn').onclick=()=>{const s=window.__researchAIState;if(!s)return;const w=window.open('','_blank');if(w){w.document.write('<pre style="white-space:pre-wrap">'+JSON.stringify(s,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre>');w.document.close()}};
refresh();
})();
(()=>{'use strict';
const $=id=>document.getElementById(id);
const pct=v=>v==null?'—':Number(v).toFixed(2)+'%';
const rate=v=>v==null?'—':(Number(v)*100).toFixed(1)+'%';
const num=v=>v==null?'—':Number(v).toLocaleString();
const esc=v=>String(v??'—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
async function get(action='status'){
  const r=await fetch('/api/learning-ai?action='+encodeURIComponent(action),{cache:'no-store'});
  const d=await r.json();if(!r.ok||d.status!=='ok')throw Error(d.error||('HTTP '+r.status));return d;
}
function renderTop(state){
  const rows=state.observations||[],labels=rows.filter(x=>x.label===0||x.label===1),confirmed=rows.filter(x=>x.outcomeV2?.confirmed===true).length;
  $('obs').textContent=num(rows.length);$('confirmed').textContent=num(confirmed);$('pending').textContent=num(rows.length-confirmed);
  $('labels').textContent=num(labels.length);$('pn').textContent=labels.filter(x=>x.label===1).length+' / '+labels.filter(x=>x.label===0).length;
  const modelState=(state.registry?.models||[]).find(x=>x.id==='tiny-mlp-v2')?.state||'SHADOW';
  const active=labels.length>=20;
  $('model').innerHTML=active?'<span class="good">'+esc(modelState)+'</span>':'<span class="warn">WARMUP '+labels.length+'/20</span>';
  const autoCount=rows.filter(x=>x.source==='auto-surge-reverse-trace').length;$('sources').innerHTML='급등 역추적 seed <b>'+num(state.memory?.seedSamples)+'</b>개<br>🧬 자동 역추적 <b>'+num(autoCount)+'</b>개<br>책 기법 <b>'+num(state.memory?.bookTechniques)+'</b>개<br>스캔 소스 <b>'+esc([...(new Set(rows.map(x=>x.source).filter(Boolean)))].join(', ')||'대기')+'</b>';
  $('persist').innerHTML='저장소 <b>'+esc(state.memory?.persistence||'—')+'</b><br>모델 <b>'+esc(state.model?.type||'—')+'</b><br>버전 <b>'+esc(state.version||'—')+'</b><br>마지막 학습 '+(state.model?.trainedAt?new Date(state.model.trainedAt).toLocaleString():'대기 중');
  const ds=state.training?.dataset||{};
  $('dataset').innerHTML='TRAIN <b>'+num(ds.train||0)+'</b><br>VALIDATION <b>'+num(ds.validation||0)+'</b><br>LOCKED OOS <b>'+num(ds.lockedOos||0)+'</b><br>OOS freeze <b>'+esc(state.validation?.lockedOosStart?new Date(state.validation.lockedOosStart).toLocaleString():'미설정')+'</b>';
  const vm=state.training?.metrics?.validation||{},om=state.training?.metrics?.lockedOos||{};
  $('validation').innerHTML='VAL precision <b>'+rate(vm.precision)+'</b> · recall <b>'+rate(vm.recall)+'</b><br>VAL FPR <b>'+rate(vm.falsePositiveRate)+'</b> · calibration <b>'+rate(vm.calibrationError)+'</b><br>OOS precision <b>'+rate(om.precision)+'</b> · recall <b>'+rate(om.recall)+'</b><br>OOS N <b>'+num(om.count||0)+'</b>';
}
function renderResearch(state){
  const research=state.research||{},stats=research.stats||{},clusters=research.archetypes||[];
  const score=stats.scoreBuckets||[];
  $('scoreRows').innerHTML=score.length?score.map(x=>'<tr><td><b>'+esc(x.key)+'</b></td><td>'+num(x.count)+'</td><td>'+rate(x.successRate)+'</td><td>'+pct(x.avgMfePct)+'</td><td>'+pct(x.avgMaePct)+'</td></tr>').join(''):'<tr><td colspan="5">실제 라벨이 더 필요합니다.</td></tr>';
  $('archetypeRows').innerHTML=clusters.length?clusters.slice(0,12).map(x=>'<tr><td><b>'+esc(x.id)+'</b></td><td>'+num(x.count)+'</td><td>'+esc((x.symbols||[]).slice(0,4).join(', '))+'</td><td>'+pct(x.avgMfePct)+'</td><td>'+pct(x.avgMaePct)+'</td></tr>').join(''):'<tr><td colspan="5">성공 라벨 군집 대기</td></tr>';
  const books=stats.bookRules||[];
  $('bookRows').innerHTML=books.length?books.slice(0,20).map(x=>'<tr><td><b>'+esc(x.ruleId)+'</b></td><td>'+esc(x.regime)+'</td><td>'+num(x.count)+'</td><td>'+rate(x.successRate)+'</td></tr>').join(''):'<tr><td colspan="4">책 규칙 outcome 대기</td></tr>';
  const regimes=stats.byRegime||[];
  $('regimeRows').innerHTML=regimes.length?regimes.map(x=>'<tr><td><b>'+esc(x.key)+'</b></td><td>'+num(x.count)+'</td><td>'+num(x.success)+'</td><td>'+num(x.failure)+'</td><td>'+rate(x.successRate)+'</td><td>'+pct(x.avgMfePct)+'</td><td>'+pct(x.avgMaePct)+'</td></tr>').join(''):'<tr><td colspan="7">Regime outcome 대기</td></tr>';
}

function renderLab(state){
  const lab=state.research?.lab||{},knowledge=lab.knowledge||{},coverage=knowledge.coverage||{},hyp=lab.hypotheses||{};
  $('labTechTotal').textContent=num(coverage.total||knowledge.techniques?.length||0);
  $('labTechSeen').textContent=num(coverage.observed||0);
  $('labHypotheses').textContent=num(hyp.observed?.length||0);
  $('labHybrids').textContent=num(hyp.archetypes?.length||0);
  $('labIdeas').textContent=num(hyp.ideaCount||0);

  const seen=new Set((state.observations||[]).flatMap(r=>r.bookRuleIds||[]));
  const techniques=knowledge.techniques||[];
  $('techniqueCatalog').innerHTML=techniques.length?techniques.map(t=>{
    const active=seen.has(t.id),req=(t.requires||[]).length?' · 필요데이터 '+(t.requires||[]).join(', '):'';
    return '<span class="techniqueChip '+(active?'seen':'unseen')+'" title="'+esc((t.sources||[]).join(' · ')+req)+'"><b>'+esc(t.label)+'</b><small>'+esc(t.category)+' · '+esc(t.researchRole||t.mode)+'</small></span>';
  }).join(''):'<span class="muted">등록 기법이 없습니다.</span>';

  const observed=(hyp.observed||[]).slice(0,12);
  $('hypothesisCards').innerHTML=observed.length?observed.map(x=>{
    const counter=x.counterexamples||[],rateText=x.successRate==null?'표본 부족':Math.round(x.successRate*100)+'%';
    return '<article class="hypothesisCard"><div class="hypHead"><span class="hypId">'+esc(x.id)+'</span><span class="hypScore">'+esc(x.confidence)+'점</span></div><h3>'+esc(x.title)+'</h3><div class="hypMeta"><span>시장국면 '+esc(x.regime)+'</span><span>표본 '+num(x.support)+'</span><span>성공률 '+esc(rateText)+'</span><span>MFE '+pct(x.avgMfePct)+'</span></div><p>'+esc(x.thesis)+'</p><div class="counter '+(counter.length?'has':'none')+'">⚠️ 반례 '+counter.length+'개 · '+esc(x.falsification||'')+'</div><div class="next">다음 연구 → '+esc(x.nextAction||'추가 관찰')+'</div></article>';
  }).join(''):'<div class="emptyLab">라벨 표본이 더 쌓이면 기법 조합 가설이 자동 생성됩니다.</div>';

  const hybrids=(hyp.archetypes||[]).slice(0,10);
  $('hybridCards').innerHTML=hybrids.length?hybrids.map(x=>'<div class="labRow"><b>'+esc(x.title)+'</b><span>표본 '+num(x.support)+' · '+esc((x.regimes||[]).join(', ')||'시장국면 미분류')+'</span><small>'+esc(x.thesis||'')+'</small><em>'+esc(x.nextAction||'연구 대기')+'</em></div>').join(''):'<div class="emptyLab">성공 군집 표본 대기</div>';

  const experiments=[...(hyp.mutations||[]),...(hyp.crossovers||[])].slice(0,14);
  $('experimentCards').innerHTML=experiments.length?experiments.map(x=>'<div class="labRow experiment"><b>'+esc(x.kind==='MUTATION'?'🧪 돌연변이 · ':'🧬 교배 · ')+esc(x.title)+'</b><span>'+esc(x.thesis||'')+'</span><small>부모 '+esc(x.parentId||(x.parents||[]).join(' + ')||'독립')+'</small><em>'+esc(x.nextAction||'연구 설계')+'</em></div>').join(''):'<div class="emptyLab">충분한 관측 가설이 생기면 자동 실험안이 생성됩니다.</div>';

  const g=lab.governance||{},steps=g.promotionRequires||[];
  $('labGovernance').innerHTML='<div class="governanceStates">'+(g.states||[]).map((s,i)=>'<span class="'+(i===0?'active':'')+'">'+esc({'IDEA':'아이디어','SHADOW':'연구 전용','CANDIDATE':'검증 후보','VALIDATED':'검증 완료','PROMOTED':'운영 승격'}[s]||s)+'</span>').join('<i>→</i>')+'</div><div class="gateChecks">'+steps.map(s=>'<span>✓ '+esc(s)+'</span>').join('')+'</div><p>'+esc(g.note||'')+'</p>';
}

function horizon(row,h){return row.outcomeV2?.horizons?.['h'+h]?.returnPct??row['outcome'+h+'hPct']??null}
function renderRows(state){
  const rows=(state.observations||[]).slice(-40).reverse();
  $('rows').innerHTML=rows.length?rows.map(r=>'<tr><td><b>'+esc(r.symbol)+'</b></td><td>'+new Date(r.asOf||r.capturedAt).toLocaleString()+'</td><td>'+esc(r.researchScore??'—')+'</td><td>'+esc(r.researchStage||r.scannerState||'—')+'</td><td>'+pct(horizon(r,1))+'</td><td>'+pct(horizon(r,6))+'</td><td>'+pct(horizon(r,24))+'</td><td>'+pct(horizon(r,72))+'</td><td>'+pct(r.outcomeV2?.mfePct??r.mfe72hPct)+'</td><td>'+pct(r.outcomeV2?.maePct??r.mae72hPct)+'</td><td>'+(r.label===1?'<span class="good">성공</span>':r.label===0?'<span class="bad">실패</span>':r.labelStatus==='AMBIGUOUS'?'<span class="warn">모호</span>':'대기')+'</td></tr>').join(''):'<tr><td colspan="11">아직 자동스캔 학습 관측이 없습니다.</td></tr>';
}
async function refresh(){
  $('status').textContent='연구 AI v3 상태 불러오는 중…';
  try{
    const d=await get('export'),state=d.state||{};
    renderTop(state);renderResearch(state);renderLab(state);renderRows(state);window.__researchAIState=state;
    $('status').textContent='정상 · '+new Date(state.updatedAt||Date.now()).toLocaleString()+' · SHADOW_ONLY · 자동 역추적은 급등 확인 뒤 학습 반영';
  }catch(e){$('status').textContent='오류 · '+e.message}
}
$('refresh').onclick=refresh;
$('exportBtn').onclick=()=>{const s=window.__researchAIState;if(!s)return;const w=window.open('','_blank');if(w){w.document.write('<pre style="white-space:pre-wrap">'+JSON.stringify(s,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre>');w.document.close()}};
refresh();
})();
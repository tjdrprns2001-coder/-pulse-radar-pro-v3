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
  $('model').innerHTML=active?'<span class="good">'+esc(modelState)+'</span>':'<span class="warn">준비중 '+labels.length+'/20</span>';
  const autoCount=rows.filter(x=>x.source==='auto-surge-reverse-trace').length,failCount=rows.filter(x=>x.source==='auto-failed-ignition-reverse-trace').length;$('sources').innerHTML='급등 역추적 seed <b>'+num(state.memory?.seedSamples)+'</b>개<br>🧬 성공 역추적 <b>'+num(autoCount)+'</b>개<br>🟥 실패 역추적 <b>'+num(failCount)+'</b>개<br>책 기법 <b>'+num(state.memory?.bookTechniques)+'</b>개<br>스캔 소스 <b>'+esc([...(new Set(rows.map(x=>x.source).filter(Boolean)))].join(', ')||'대기')+'</b>';
  $('persist').innerHTML='저장소 <b>'+esc(state.memory?.persistence||'—')+'</b><br>모델 <b>'+esc(state.model?.type||'—')+'</b><br>버전 <b>'+esc(state.version||'—')+'</b><br>마지막 학습 '+(state.model?.trainedAt?new Date(state.model.trainedAt).toLocaleString():'대기 중');
  const ds=state.training?.dataset||{};
  $('dataset').innerHTML='학습 <b>'+num(ds.train||0)+'</b><br>검증 <b>'+num(ds.validation||0)+'</b><br>잠금 OOS <b>'+num(ds.lockedOos||0)+'</b><br>경계 제거 <b>'+num(ds.purged||0)+'</b> · 엠바고 <b>'+num(ds.embargoed||0)+'</b><br>OOS 고정시각 <b>'+esc(state.validation?.lockedOosStart?new Date(state.validation.lockedOosStart).toLocaleString():'미설정')+'</b>';
  const vm=state.training?.metrics?.validation||{},om=state.training?.metrics?.lockedOos||{};
  $('validation').innerHTML='검증 정밀도 <b>'+rate(vm.precision)+'</b> · 재현율 <b>'+rate(vm.recall)+'</b><br>검증 오탐률 <b>'+rate(vm.falsePositiveRate)+'</b> · 보정오차 <b>'+rate(vm.calibrationError)+'</b><br>OOS 정밀도 <b>'+rate(om.precision)+'</b> · 재현율 <b>'+rate(om.recall)+'</b><br>OOS 표본 <b>'+num(om.count||0)+'</b>';
}
function renderIntegrity(state){
  const integ=state.integrity||{},contract=integ.contract||{},health=integ.lastHealth||state.research?.lab?.integrity?.health||{},ds=state.training?.dataset||{},sealed=state.sealedEvaluation||{};
  $('integrityContract').textContent=contract.contractVersion||'-';
  $('integrityDataset').textContent=integ.datasetSnapshotId||'표본 생성 대기';
  $('integrityHealth').textContent=(health.status||health.state||'대기')+' · 유효 '+num(health.validSampleCount??health.labeledCount??0);
  $('integrityPurge').textContent=num(ds.purged||0)+' / '+num(ds.embargoed||0);
  $('integrityOos').textContent=sealed.locked?'🔒 격리됨 · N '+num(sealed.count||0):'아직 미고정';
  $('integrityReference').textContent=num(state.referenceSampleCount||0)+'개 · 학습 제외';
  const cost=contract.roundTripCostPct;
  $('integrityDetail').innerHTML='<span>진입 '+esc(contract.entryPolicy||'-')+'</span><span>라벨 '+esc(contract.labelVersion||'-')+'</span><span>피처 '+esc(contract.featureSchemaVersion||'-')+'</span><span>중복창 '+num(contract.duplicateWindowMinutes||0)+'분</span><span>Purge '+num(contract.purgeHours||0)+'h</span><span>Embargo '+num(contract.embargoHours||0)+'h</span><span>조건실험 최소 N '+num(contract.minAblationSample||30)+'</span><span>비용 '+(Number.isFinite(Number(cost))?esc(cost)+'%':'미설정')+'</span><span>OOS 가설접근 '+esc(sealed.hypothesisGeneratorAccess===false?'차단':'확인 필요')+'</span>';
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

  const ideaById=new Map([...(hyp.mutations||[]),...(hyp.crossovers||[])].map(x=>[x.id,x])),experiments=(lab.experiments||[]).slice(0,14);
  $('experimentCards').innerHTML=experiments.length?experiments.map(exp=>{const x=ideaById.get(exp.hypothesisId)||{},ev=exp.evaluation||{},vm=ev.validation||{},hm=ev.validationHoldout||{};const stateLabel=({'WAITING_FOR_MATCHES':'표본 대기','SAMPLE_INSUFFICIENT':'표본 부족','SHADOW_TESTING':'연구 중','VALIDATION_PROMISING':'검증 유망','BLOCKED_DATA_QUALITY':'데이터 차단'})[exp.state]||exp.state;return '<div class="labRow experiment"><b>'+esc(x.kind==='MUTATION'?'🧪 돌연변이 · ':'🧬 교배 · ')+esc(x.title||exp.hypothesisId)+'</b><span>'+esc(x.thesis||'')+'</span><small>상태 '+esc(stateLabel)+' · 표본 '+num(ev.support||0)+' · 검증 '+rate(vm.successRate)+' · 검증 홀드아웃 '+rate(hm.successRate)+'</small><small>Locked OOS 접근 차단 · 실험예산 '+num(exp.budget?.experimentIndex||0)+'/'+num(exp.budget?.familyLimit||0)+'</small><em>운영 가중치 0% · '+esc(x.nextAction||'연구 설계')+'</em></div>'}).join(''):'<div class="emptyLab">충분한 관측 가설이 생기면 자동 실험안이 생성됩니다.</div>';

  const comp=lab.competition||{},champ=comp.champion,prov=comp.provisional,chall=comp.challengers||[];
  $('competitionCards').innerHTML=(champ?'<div class="labRow champion"><b>🏆 '+esc(champ.dna?.name||champ.title||'Champion')+'</b><span>'+esc(champ.dna?.strategyId||'')+' '+esc(champ.dna?.version||'')+' · 연구점수 '+esc(champ.labScore??'-')+'</span><small>OOS '+rate(champ.evaluation?.lockedOos?.successRate)+' · 표본 '+num(champ.evaluation?.support||0)+' · 운영 가중치 0%</small></div>':prov?'<div class="labRow provisional"><b>⏳ 잠정 후보 · '+esc(prov.dna?.name||prov.title||'연구전략')+'</b><span>'+esc(prov.dna?.strategyId||'')+' '+esc(prov.dna?.version||'')+' · 연구점수 '+esc(prov.labScore??'-')+'</span><small>sealed OOS 전 잠정 후보 · 검증 홀드아웃 '+rate(prov.evaluation?.validationHoldout?.successRate)+' · 운영 가중치 0%</small></div>':'<div class="emptyLab">Champion 선정에 필요한 표본이 부족합니다.</div>')+chall.map(x=>'<div class="labRow challenger"><b>🧪 '+esc(x.dna?.name||x.title||'Challenger')+'</b><span>'+esc(x.dna?.strategyId||'')+' '+esc(x.dna?.version||'')+' · 연구점수 '+esc(x.labScore??'-')+'</span><small>OOS '+rate(x.evaluation?.validationHoldout?.successRate)+' · 표본 '+num(x.evaluation?.support||0)+' · 운영 가중치 0%</small></div>').join('');

  const dna=(lab.strategyDna||[]).slice(0,18);
  $('strategyDnaCards').innerHTML=dna.length?dna.map(x=>'<div class="labRow dnaRow"><b>'+esc(x.name)+'</b><span>'+esc(x.strategyId)+' · '+esc(x.version)+' · '+esc(x.regime)+'</span><small>구성 '+esc((x.ruleIds||[]).join(' + '))+'</small><small>부모 '+esc((x.parentIds||x.parents||[]).join(', ')||'독립 생성')+'</small><em>'+esc(x.changeReason||'관측 데이터 기반 연구')+'</em></div>').join(''):'<div class="emptyLab">전략 DNA 생성 대기</div>';

  const abs=(lab.ablation||[]).slice(0,10);
  $('ablationCards').innerHTML=abs.length?abs.map(x=>{const s=x.study||{},imp=s.mostImportant,red=s.redundant;return '<article class="hypothesisCard"><div class="hypHead"><span class="hypId">'+esc(x.dna?.strategyId||x.hypothesisId)+'</span><span class="hypScore">'+esc(x.dna?.version||'v1')+'</span></div><h3>'+esc(x.dna?.name||x.hypothesisId)+'</h3><p>조건을 하나씩 제거해 성능 변화를 비교했습니다.</p><div class="ablationLine goodish">핵심 후보 · '+esc(imp?.removedLabel||'표본 부족')+(imp?.importance!=null?' · 영향 '+esc((imp.importance*100).toFixed(1))+'%p':'')+'</div><div class="ablationLine neutral">중복 후보 · '+esc(red?.removedLabel||'표본 부족')+(red?.importance!=null?' · 영향 '+esc((red.importance*100).toFixed(1))+'%p':'')+'</div><div class="next">'+esc(s.note||'')+'</div></article>'}).join(''):'<div class="emptyLab">조건 기여도 계산에 필요한 표본이 부족합니다.</div>';

  const notes=lab.notes||[];
  $('researchNotes').innerHTML=notes.length?notes.map(x=>'<article class="noteItem"><div><b>'+esc({'DATASET':'📚','HYPOTHESIS':'🧠','CHAMPION':'🏆','PROVISIONAL':'⏳','ABLATION':'🧪','IDEA':'💡'}[x.type]||'📓')+' '+esc(x.title)+'</b><time>'+new Date(x.at||Date.now()).toLocaleString()+'</time></div><p>'+esc(x.body)+'</p></article>').join(''):'<div class="emptyLab">연구노트 대기</div>';

  const g=lab.governance||{},steps=g.promotionRequires||[];
  $('labGovernance').innerHTML='<div class="governanceStates">'+(g.states||[]).map((s,i)=>'<span class="'+(i===0?'active':'')+'">'+esc({'HYPOTHESIS_NEW':'새 가설','DATA_PENDING':'데이터 대기','SAMPLE_INSUFFICIENT':'표본 부족','TRAINING':'학습','VALIDATING':'검증','OOS_LOCKED':'OOS 잠금','SHADOW_RUNNING':'연구 전용','PROMOTION_REVIEW':'승격 심사','CHAMPION':'Champion','REJECTED':'폐기','RETIRED':'은퇴','BLOCKED_DATA_QUALITY':'데이터 차단'}[s]||s)+'</span>').join('<i>→</i>')+'</div><div class="gateChecks">'+steps.map(s=>'<span>✓ '+esc(s)+'</span>').join('')+'</div><p>'+esc(g.note||'')+'</p>';
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
    renderTop(state);renderIntegrity(state);renderResearch(state);renderLab(state);renderRows(state);window.__researchAIState=state;
    $('status').textContent='정상 · '+new Date(state.updatedAt||Date.now()).toLocaleString()+' · 연구 전용 · 자동 역추적은 결과 확인 뒤 학습 반영';
  }catch(e){$('status').textContent='오류 · '+e.message}
}
$('refresh').onclick=refresh;
$('exportBtn').onclick=()=>{const s=window.__researchAIState;if(!s)return;const w=window.open('','_blank');if(w){w.document.write('<pre style="white-space:pre-wrap">'+JSON.stringify(s,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre>');w.document.close()}};
refresh();
})();
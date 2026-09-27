'use strict';

const Book=require('../coin-scan/book-strategy-registry.js');
const Archetype=require('./archetype-lab.js');

const VERSION='RESEARCH_LAB_v3';

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function avg(a=[]){const x=a.map(n).filter(v=>v!=null);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function uniq(a=[]){return [...new Set(a.filter(Boolean).map(String))]}
function combinations(arr,k,start=0,prefix=[],out=[]){
  if(prefix.length===k){out.push(prefix.slice());return out}
  for(let i=start;i<=arr.length-(k-prefix.length);i++){prefix.push(arr[i]);combinations(arr,k,i+1,prefix,out);prefix.pop()}
  return out;
}
function techniqueCatalog(){
  return Book.TECHNIQUES.map(t=>({
    id:t.id,label:t.label,category:t.category,mode:t.mode,
    sources:t.sources||[],requires:t.requires||[],rankingWeight:t.rankingWeight??null,
    researchRole:t.mode===Book.MODES.RANK?'핵심 신호':t.mode===Book.MODES.EVIDENCE?'보조 증거':t.mode===Book.MODES.RISK?'리스크 설계':t.mode===Book.MODES.CONTEXT?'시장 맥락':t.mode===Book.MODES.DATA_REQUIRED?'데이터 필요':'조건부 제외'
  }));
}
function labeled(rows=[]){return rows.filter(x=>x.label===0||x.label===1)}
function observedRuleStats(rows=[]){
  const map=new Map();
  for(const r of labeled(rows)){
    for(const id of uniq(r.bookRuleIds||[])){
      if(!map.has(id))map.set(id,{id,count:0,success:0,failure:0,regimes:new Map(),setupTypes:new Map()});
      const x=map.get(id);x.count++;if(r.label===1)x.success++;else x.failure++;
      const regime=String(r.regime||r.canonicalSnapshot?.market?.regime||'UNKNOWN'),setup=String(r.setupType||'UNKNOWN');
      x.regimes.set(regime,(x.regimes.get(regime)||0)+1);x.setupTypes.set(setup,(x.setupTypes.get(setup)||0)+1);
    }
  }
  return [...map.values()].map(x=>({...x,successRate:x.count?x.success/x.count:null,
    regimes:[...x.regimes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([key,count])=>({key,count})),
    setupTypes:[...x.setupTypes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([key,count])=>({key,count}))
  })).sort((a,b)=>b.count-a.count||(b.successRate||0)-(a.successRate||0));
}
function comboStats(rows=[],{minSize=2,maxSize=4,minCount=2}={}){
  const map=new Map();
  for(const r of labeled(rows)){
    const ids=uniq(r.bookRuleIds||[]).filter(id=>Book.get(id)).sort();
    for(let k=minSize;k<=Math.min(maxSize,ids.length);k++){
      for(const combo of combinations(ids,k)){
        const regime=String(r.regime||r.canonicalSnapshot?.market?.regime||'UNKNOWN'),key=combo.join('+')+'@@'+regime;
        if(!map.has(key))map.set(key,{ids:combo,regime,rows:[]});
        map.get(key).rows.push(r);
      }
    }
  }
  return [...map.values()].filter(x=>x.rows.length>=minCount).map(x=>{
    const success=x.rows.filter(r=>r.label===1).length,failure=x.rows.length-success;
    const mfe=avg(x.rows.map(r=>r.outcomeV2?.mfePct)),mae=avg(x.rows.map(r=>r.outcomeV2?.maePct));
    return{ids:x.ids,regime:x.regime,count:x.rows.length,success,failure,successRate:x.rows.length?success/x.rows.length:null,avgMfePct:mfe,avgMaePct:mae,
      symbols:uniq(x.rows.map(r=>r.symbol)).slice(0,10),setupTypes:uniq(x.rows.map(r=>r.setupType)).slice(0,10)};
  }).sort((a,b)=>(b.count-a.count)||((b.successRate||0)-(a.successRate||0)));
}
function complementaryCandidates(ids=[]){
  const used=new Set(ids),cats=new Set(ids.map(id=>Book.get(id)?.category).filter(Boolean));
  return Book.TECHNIQUES.filter(t=>!used.has(t.id)&&t.mode!==Book.MODES.NOT_APPLICABLE)
    .map(t=>({id:t.id,label:t.label,category:t.category,mode:t.mode,novelCategory:!cats.has(t.category)}))
    .sort((a,b)=>(Number(b.novelCategory)-Number(a.novelCategory))||String(a.category).localeCompare(String(b.category)));
}
function counterexamples(rows,ids,regime){
  return labeled(rows).filter(r=>{
    const set=new Set(r.bookRuleIds||[]);
    return r.label===0&&ids.every(id=>set.has(id))&&String(r.regime||r.canonicalSnapshot?.market?.regime||'UNKNOWN')===regime;
  }).slice(-12).map(r=>({symbol:r.symbol,asOf:r.asOf,setupType:r.setupType,score:r.researchScore,maePct:r.outcomeV2?.maePct??null,mfePct:r.outcomeV2?.mfePct??null}));
}
function confidence(row){
  const nrow=Number(row.count)||0,p=Number(row.successRate)||0,mfe=n(row.avgMfePct,0),mae=Math.abs(n(row.avgMaePct,0));
  const support=Math.min(1,nrow/20),edge=Math.max(0,Math.min(1,(p-.5)*2)),quality=Math.max(0,Math.min(1,(mfe-mae+5)/15));
  return Math.round((support*.35+edge*.45+quality*.20)*100);
}
function buildObservedHypotheses(rows=[]){
  return comboStats(rows,{minSize:2,maxSize:4,minCount:2}).slice(0,80).map((x,i)=>{
    const techniques=x.ids.map(id=>Book.get(id)).filter(Boolean);
    const conf=confidence(x),counter=counterexamples(rows,x.ids,x.regime);
    return{
      id:'H-OBS-'+String(i+1).padStart(3,'0'),kind:'OBSERVED_COMBINATION',state:'SHADOW',productionEligible:false,
      title:techniques.map(t=>t.label).join(' + '),ruleIds:x.ids,regime:x.regime,support:x.count,success:x.success,failure:x.failure,successRate:x.successRate,
      avgMfePct:x.avgMfePct,avgMaePct:x.avgMaePct,confidence:conf,counterexamples:counter,
      thesis:'관측 데이터에서 함께 나타난 기법 조합을 하나의 연구 가설로 본다.',
      falsification:counter.length?'동일 조합의 실패 사례가 존재하므로 시장국면·진입순서·무효화 조건을 추가 검증해야 한다.':'반례 표본이 아직 부족하다.',
      nextAction:conf>=70?'LOCKED_OOS 후보':conf>=45?'추가 샘플 필요':'관찰 유지'
    };
  });
}
function buildArchetypeHybrids(rows=[]){
  const clusters=Archetype.buildClusters(rows),out=[];
  for(const c of clusters){
    const members=rows.filter(r=>c.memberKeys.includes(r.key)),rules=uniq(members.flatMap(r=>r.bookRuleIds||[])).filter(id=>Book.get(id));
    if(rules.length<2)continue;
    const top=rules.map(id=>({id,count:members.filter(r=>(r.bookRuleIds||[]).includes(id)).length})).sort((a,b)=>b.count-a.count).slice(0,4).map(x=>x.id);
    out.push({
      id:'H-ARC-'+c.id,kind:'ARCHETYPE_HYBRID',state:'SHADOW',productionEligible:false,
      title:'군집 '+c.id+' · '+top.map(id=>Book.get(id)?.label||id).join(' × '),ruleIds:top,
      support:c.count,regimes:c.regimes,setupTypes:c.setupTypes,symbols:c.symbols,avgMfePct:c.avgMfePct,avgMaePct:c.avgMaePct,
      thesis:'성공 샘플 군집의 공통 기법을 묶어 하나의 하이브리드 셋업 후보로 만든다.',
      nextAction:c.count>=8?'시간순 검증 설계':'군집 표본 확대'
    });
  }
  return out.slice(0,40);
}
function mutateHypotheses(observed=[],max=30){
  const out=[],seen=new Set();
  for(const h of observed.slice(0,20)){
    const adds=complementaryCandidates(h.ruleIds).filter(x=>x.novelCategory).slice(0,3);
    for(const a of adds){
      const ids=[...h.ruleIds,a.id].slice(0,4).sort(),key=ids.join('+')+'@@'+h.regime;if(seen.has(key))continue;seen.add(key);
      out.push({
        id:'H-MUT-'+String(out.length+1).padStart(3,'0'),kind:'MUTATION',state:'IDEA',productionEligible:false,
        title:ids.map(id=>Book.get(id)?.label||id).join(' + '),ruleIds:ids,regime:h.regime,parentId:h.id,
        mutation:{type:'ADD_COMPLEMENTARY_TECHNIQUE',added:a.id,reason:'기존 조합에 다른 카테고리의 기법을 추가해 조건부 우위를 시험'},
        thesis:'기존 성공 조합에 보완 기법을 추가했을 때 실패 사례를 줄일 수 있는지 검증한다.',
        requiredEvidence:['새 조합 표본','기존 부모 조합과 비교','실패율 변화','MFE/MAE 변화'],
        nextAction:'SHADOW 실험 생성'
      });
      if(out.length>=max)return out;
    }
  }
  return out;
}
function crossoverHypotheses(observed=[],max=20){
  const top=observed.filter(x=>x.confidence>=45).slice(0,12),out=[],seen=new Set();
  for(let i=0;i<top.length;i++)for(let j=i+1;j<top.length;j++){
    if(top[i].regime!==top[j].regime)continue;
    const ids=uniq([...top[i].ruleIds,...top[j].ruleIds]).filter(id=>Book.get(id)).slice(0,4).sort();
    if(ids.length<3)continue;const key=ids.join('+')+'@@'+top[i].regime;if(seen.has(key))continue;seen.add(key);
    out.push({
      id:'H-X-'+String(out.length+1).padStart(3,'0'),kind:'CROSSOVER',state:'IDEA',productionEligible:false,
      title:ids.map(id=>Book.get(id)?.label||id).join(' × '),ruleIds:ids,regime:top[i].regime,parents:[top[i].id,top[j].id],
      thesis:'서로 다른 성공 가설의 공통·보완 요소를 교배해 새 셋업 후보를 만든다.',
      requiredEvidence:['두 부모 대비 우월성','중복 조건 제거','표본 외 검증'],nextAction:'SHADOW 실험 생성'
    });
    if(out.length>=max)return out;
  }
  return out;
}
function matchHypothesis(row,h){
  const set=new Set(row.bookRuleIds||[]);
  if(!(h.ruleIds||[]).every(id=>set.has(id)))return false;
  if(h.regime&&h.regime!=='UNKNOWN'){
    const regime=String(row.regime||row.canonicalSnapshot?.market?.regime||'UNKNOWN');
    if(regime!==h.regime)return false;
  }
  return row.label===0||row.label===1;
}
function sliceMetrics(rows=[]){
  const a=rows.filter(x=>x.label===0||x.label===1),success=a.filter(x=>x.label===1).length;
  return{count:a.length,success,failure:a.length-success,successRate:a.length?success/a.length:null,avgMfePct:avg(a.map(x=>x.outcomeV2?.mfePct)),avgMaePct:avg(a.map(x=>x.outcomeV2?.maePct))};
}
function evaluateHypothesis(rows=[],h={}){
  const matched=rows.filter(r=>matchHypothesis(r,h)).slice().sort((a,b)=>Number(a.asOf||0)-Number(b.asOf||0));
  if(!matched.length)return{state:'WAITING_FOR_MATCHES',support:0,train:sliceMetrics([]),validation:sliceMetrics([]),lockedOos:sliceMetrics([]),leakageSafe:true};
  const n=matched.length,t=Math.max(1,Math.floor(n*.6)),v=Math.max(t,Math.floor(n*.8));
  const train=matched.slice(0,t),validation=matched.slice(t,v),lockedOos=matched.slice(v);
  const tm=sliceMetrics(train),vm=sliceMetrics(validation),om=sliceMetrics(lockedOos);
  let state='SHADOW_TESTING';
  if(n<5)state='LOW_SAMPLE';
  else if(om.count>=5&&om.successRate!=null&&om.successRate>=.6&&vm.count>=3&&vm.successRate!=null&&vm.successRate>=.55)state='OOS_PROMISING';
  return{state,support:n,train:tm,validation:vm,lockedOos:om,leakageSafe:true,firstAt:matched[0]?.asOf??null,lastAt:matched.at(-1)?.asOf??null,
    symbols:uniq(matched.map(x=>x.symbol)).slice(0,20)};
}

function stableHash(text=''){
  let h=2166136261;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return (h>>>0).toString(36).toUpperCase().padStart(7,'0').slice(0,7);
}
function strategyDna(h={}){
  const ids=uniq(h.ruleIds||[]).sort(),regime=String(h.regime||'ANY'),base=ids.join('+')+'@@'+regime;
  const parentIds=uniq([h.parentId,...(h.parents||[])]),generation=parentIds.length?2:1;
  return{
    strategyId:'LAB-'+stableHash(base),
    version:'v'+generation,
    generation,
    signature:base,
    ruleIds:ids,
    regime,
    parents:parentIds,
    name:ids.map(id=>Book.get(id)?.label||id).join(' + ')||'미정 전략',
    mutationType:h.mutation?.type||h.kind||'OBSERVED',
    changeReason:h.mutation?.reason||h.thesis||'관측 데이터 기반 연구',
    productionEligible:false
  };
}
function ablationStudy(rows=[],h={}){
  const ids=uniq(h.ruleIds||[]);
  if(ids.length<2)return{baseline:evaluateHypothesis(rows,h),tests:[],mostImportant:null,redundant:null};
  const baseline=evaluateHypothesis(rows,h),baseOos=baseline.lockedOos?.successRate,baseVal=baseline.validation?.successRate;
  const tests=ids.map(id=>{
    const reduced={...h,ruleIds:ids.filter(x=>x!==id)},ev=evaluateHypothesis(rows,reduced);
    const oos=ev.lockedOos?.successRate,val=ev.validation?.successRate;
    const deltaOos=baseOos!=null&&oos!=null?baseOos-oos:null,deltaVal=baseVal!=null&&val!=null?baseVal-val:null;
    const importance=[deltaOos,deltaVal].filter(x=>x!=null).length?avg([deltaOos,deltaVal].filter(x=>x!=null)):null;
    return{removedRuleId:id,removedLabel:Book.get(id)?.label||id,evaluation:ev,deltaOos,deltaValidation:deltaVal,importance};
  }).sort((a,b)=>(b.importance??-999)-(a.importance??-999));
  return{
    baseline,tests,
    mostImportant:tests.find(x=>x.importance!=null&&x.importance>0)||null,
    redundant:tests.slice().reverse().find(x=>x.importance!=null&&x.importance<=0)||null,
    note:'조건 하나씩 제거해 성능 변화를 비교한다. 표본이 부족하면 중요도를 확정하지 않는다.'
  };
}
function scoreStrategy(ev={}){
  const o=ev.lockedOos||{},v=ev.validation||{};
  const support=Number(ev.support)||0,oosN=Number(o.count)||0,valN=Number(v.count)||0;
  if(support<5)return null;
  const oos=Number.isFinite(Number(o.successRate))?Number(o.successRate):0;
  const val=Number.isFinite(Number(v.successRate))?Number(v.successRate):0;
  const mae=Math.abs(n(o.avgMaePct,n(v.avgMaePct,0))),mfe=n(o.avgMfePct,n(v.avgMfePct,0));
  return Math.round(Math.max(0,Math.min(100,(oos*.45+val*.25+Math.min(1,oosN/10)*.15+Math.min(1,valN/10)*.05+Math.max(0,Math.min(1,(mfe-mae+5)/15))*.10)*100)));
}
function championChallenger(rows=[],hypotheses=[]){
  const evaluated=hypotheses.map(h=>{const evaluation=evaluateHypothesis(rows,h),score=scoreStrategy(evaluation);return{...h,dna:strategyDna(h),evaluation,labScore:score}})
    .filter(x=>x.labScore!=null).sort((a,b)=>b.labScore-a.labScore);
  const qualified=evaluated.filter(x=>{
    const o=x.evaluation?.lockedOos||{},v=x.evaluation?.validation||{};
    return x.labScore>=55&&Number(o.count)>=3&&Number(v.count)>=2&&Number(o.successRate)>=.55&&Number(v.successRate)>=.5;
  });
  const champion=qualified[0]||null;
  const provisional=!champion&&evaluated[0]?{...evaluated[0],role:'PROVISIONAL',rankWeight:0}:null;
  const challengers=(champion?evaluated.filter(x=>x.id!==champion.id):evaluated.slice(1)).slice(0,5);
  return{
    champion:champion?{...champion,role:'CHAMPION',rankWeight:0}:null,
    provisional,
    challengers:challengers.map(x=>({...x,role:'CHALLENGER',rankWeight:0})),
    gate:{minLabScore:55,minOosCount:3,minValidationCount:2,minOosSuccessRate:.55,minValidationSuccessRate:.5},
    policy:'절대 성능 게이트를 통과한 전략만 Champion. 나머지는 잠정 후보이며 운영 가중치 0%'
  };
}
function researchNotes({rows=[],observed=[],mutations=[],crossovers=[],champion=null,ablations=[]}={}){
  const notes=[],now=Date.now(),labels=labeled(rows),pos=labels.filter(x=>x.label===1).length,neg=labels.filter(x=>x.label===0).length;
  notes.push({at:now,type:'DATASET',title:'학습 표본 점검',body:'현재 확정 라벨 '+labels.length+'개 · 성공 '+pos+'개 · 실패 '+neg+'개. 성공/실패 균형과 시장국면 편향을 계속 확인한다.'});
  if(observed[0])notes.push({at:now,type:'HYPOTHESIS',title:'가장 강한 관측 가설',body:observed[0].title+' · 표본 '+observed[0].support+'개 · 성공률 '+Math.round((observed[0].successRate||0)*100)+'%. 반례 '+(observed[0].counterexamples||[]).length+'개를 함께 유지한다.'});
  if(champion)notes.push({at:now,type:'CHAMPION',title:'현재 연구 Champion',body:champion.dna.name+' · 연구점수 '+champion.labScore+'점. 운영 가중치는 0%이며 OOS 표본이 더 쌓일 때까지 연구 전용으로 유지한다.'});
  const ab=ablations.find(x=>x.study?.mostImportant);
  if(ab?.study?.mostImportant)notes.push({at:now,type:'ABLATION',title:'조건 기여도 발견',body:ab.study.mostImportant.removedLabel+' 제거 시 성능이 상대적으로 약해져 핵심 조건 후보로 기록했다. 표본 확대 후 재검증한다.'});
  if(mutations.length||crossovers.length)notes.push({at:now,type:'IDEA',title:'새 연구 아이디어 생성',body:'돌연변이 '+mutations.length+'개 · 교배 '+crossovers.length+'개를 만들었다. 새 아이디어는 기존 부모 전략보다 우월한지 시간순 검증한다.'});
  return notes;
}
function techniqueCoverage(rows=[]){
  const catalog=techniqueCatalog(),seen=new Set(rows.flatMap(r=>r.bookRuleIds||[]));
  return{
    total:catalog.length,observed:catalog.filter(x=>seen.has(x.id)).length,unobserved:catalog.filter(x=>!seen.has(x.id)).length,
    byMode:Object.fromEntries(Object.values(Book.MODES).map(mode=>[mode,catalog.filter(x=>x.mode===mode).length])),
    byCategory:Object.fromEntries([...new Set(catalog.map(x=>x.category))].map(cat=>[cat,catalog.filter(x=>x.category===cat).length])),
    unobservedTechniques:catalog.filter(x=>!seen.has(x.id)).map(x=>({id:x.id,label:x.label,category:x.category,mode:x.mode})).slice(0,100)
  };
}
function labSummary(observations=[]){
  const rows=Array.isArray(observations)?observations:[],
    observed=buildObservedHypotheses(rows),
    archetypes=buildArchetypeHybrids(rows),
    mutations=mutateHypotheses(observed),
    crossovers=crossoverHypotheses(observed),
    ideas=[...mutations,...crossovers],
    allCandidates=[...observed,...archetypes,...ideas];

  const dna=allCandidates.slice(0,100).map(h=>({...strategyDna(h),hypothesisId:h.id,state:h.state||'IDEA'}));
  const ablations=observed.slice(0,12).map(h=>({hypothesisId:h.id,dna:strategyDna(h),study:ablationStudy(rows,h)}));
  const competition=championChallenger(rows,[...observed,...archetypes]);
  const notes=researchNotes({rows,observed,mutations,crossovers,champion:competition.champion,ablations});

  return{
    version:'RESEARCH_LAB_v4',mode:'HYPOTHESIS_RESEARCH',shadowOnly:true,productionAutoMutation:false,
    knowledge:{registryVersion:Book.VERSION,techniques:techniqueCatalog(),coverage:techniqueCoverage(rows)},
    hypotheses:{observed,archetypes,mutations,crossovers,ideaCount:ideas.length},
    strategyDna:dna,
    ablation:ablations,
    competition,
    notes,
    experiments:ideas.slice(0,30).map((h,i)=>{const evaluation=evaluateHypothesis(rows,h);return{id:'EXP-'+String(i+1).padStart(3,'0'),hypothesisId:h.id,dna:strategyDna(h),state:evaluation.state,split:'TIME_ORDERED',requiresLockedOos:true,rankWeight:0,evaluation,
      protocol:['과거 구간 탐색','시간순 학습','검증','잠금 OOS','부정 샘플 대조','조건 기여도 실험','수수료·슬리피지 반영','연구 전용 결과만 기록']}}),
    governance:{
      states:['IDEA','SHADOW','CANDIDATE','VALIDATED','PROMOTED'],
      currentMaxAutoState:'SHADOW',
      promotionRequires:['시간순 표본','실패/반례 포함','잠금 OOS','최소 표본수','정밀도/재현율/FPR','MFE/MAE','조건 기여도','부모 전략 대비 우월성','데이터 누수 검사'],
      note:'AI는 전략을 만들고 수정할 수 있지만 운영 랭킹 변경은 별도 검증 게이트를 통과해야 한다.'
    }
  };
}

module.exports={VERSION,techniqueCatalog,observedRuleStats,comboStats,buildObservedHypotheses,buildArchetypeHybrids,mutateHypotheses,crossoverHypotheses,matchHypothesis,evaluateHypothesis,strategyDna,ablationStudy,championChallenger,researchNotes,techniqueCoverage,labSummary};

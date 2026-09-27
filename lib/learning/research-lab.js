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
  const rows=Array.isArray(observations)?observations:[],observed=buildObservedHypotheses(rows),archetypes=buildArchetypeHybrids(rows),mutations=mutateHypotheses(observed),crossovers=crossoverHypotheses(observed);
  const ideas=[...mutations,...crossovers];
  return{
    version:VERSION,mode:'HYPOTHESIS_RESEARCH',shadowOnly:true,productionAutoMutation:false,
    knowledge:{registryVersion:Book.VERSION,techniques:techniqueCatalog(),coverage:techniqueCoverage(rows)},
    hypotheses:{observed,archetypes,mutations,crossovers,ideaCount:ideas.length},
    experiments:ideas.slice(0,30).map((h,i)=>{const evaluation=evaluateHypothesis(rows,h);return{id:'EXP-'+String(i+1).padStart(3,'0'),hypothesisId:h.id,state:evaluation.state,split:'TIME_ORDERED',requiresLockedOos:true,rankWeight:0,evaluation,
      protocol:['과거 구간 탐색','시간순 학습','검증','잠금 OOS','부정 샘플 대조','수수료·슬리피지 반영','연구 전용 결과만 기록']}}),
    governance:{
      states:['IDEA','SHADOW','CANDIDATE','VALIDATED','PROMOTED'],
      currentMaxAutoState:'SHADOW',
      promotionRequires:['시간순 표본','반례 포함','LOCKED OOS','최소 표본수','정밀도/재현율/FPR','MFE/MAE','데이터 누수 검사'],
      note:'AI가 새 가설을 만들 수는 있지만 운영 랭킹 변경은 별도 검증 게이트를 통과해야 한다.'
    }
  };
}
module.exports={VERSION,techniqueCatalog,observedRuleStats,comboStats,buildObservedHypotheses,buildArchetypeHybrids,mutateHypotheses,crossoverHypotheses,matchHypothesis,evaluateHypothesis,techniqueCoverage,labSummary};

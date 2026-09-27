'use strict';

const Book=require('../coin-scan/book-strategy-registry.js');
const Archetype=require('./archetype-lab.js');

const VERSION='RESEARCH_LAB_v5';

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
  const regimes={};for(const r of a){const k=String(r.regime||r.canonicalSnapshot?.market?.regime||'UNKNOWN');regimes[k]=(regimes[k]||0)+1}
  const net24=a.map(x=>x.outcomeV2?.netHorizons?.h24).filter(Number.isFinite),net72=a.map(x=>x.outcomeV2?.netHorizons?.h72).filter(Number.isFinite);
  const gross24=a.map(x=>x.outcomeV2?.horizons?.h24?.returnPct).filter(Number.isFinite),gross72=a.map(x=>x.outcomeV2?.horizons?.h72?.returnPct).filter(Number.isFinite);
  const maes=a.map(x=>n(x.outcomeV2?.maePct??x.mae72hPct)).filter(v=>v!=null);
  return{count:a.length,signalCount:a.length,success,failure:a.length-success,successRate:a.length?success/a.length:null,
    avgMfePct:avg(a.map(x=>x.outcomeV2?.mfePct)),avgMaePct:avg(maes),worstMaePct:maes.length?Math.min(...maes):null,
    avgGross24hPct:avg(gross24),avgGross72hPct:avg(gross72),avgNet24hPct:avg(net24),avgNet72hPct:avg(net72),
    costAdjustedAvailable:net24.length>0||net72.length>0,regimeDistribution:regimes};
}
function evaluateHypothesis(rows=[],h={},opts={}){
  const matched=rows.filter(r=>matchHypothesis(r,h)).slice().sort((a,b)=>Number(a.asOf||0)-Number(b.asOf||0));
  if(!matched.length)return{state:'WAITING_FOR_MATCHES',support:0,train:sliceMetrics([]),validation:sliceMetrics([]),validationHoldout:sliceMetrics([]),lockedOos:null,leakageSafe:true};
  const total=matched.length,t=Math.max(1,Math.floor(total*.7)),v=Math.max(t,Math.floor(total*.9));
  const train=matched.slice(0,t),validation=matched.slice(t,v),holdout=matched.slice(v);
  const tm=sliceMetrics(train),vm=sliceMetrics(validation),hm=sliceMetrics(holdout);
  const minSample=Number(opts.minSample||30);
  let state=total<minSample?'SAMPLE_INSUFFICIENT':'SHADOW_TESTING';
  if(total>=minSample&&vm.count>=5&&vm.successRate!=null&&vm.successRate>=.55&&hm.count>=3&&hm.successRate!=null&&hm.successRate>=.55)state='VALIDATION_PROMISING';
  return{state,support:total,train:tm,validation:vm,validationHoldout:hm,lockedOos:null,leakageSafe:true,firstAt:matched[0]?.asOf??null,lastAt:matched.at(-1)?.asOf??null,
    symbols:uniq(matched.map(x=>x.symbol)).slice(0,20),note:'진짜 Locked OOS는 가설 생성기에서 격리됨'};
}

function stableHash(text=''){
  let h=2166136261;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return (h>>>0).toString(36).toUpperCase().padStart(7,'0').slice(0,7);
}
function strategyDna(h={},opts={}){
  const ids=uniq(h.ruleIds||[]).sort(),regime=String(h.regime||'ANY'),base=ids.join('+')+'@@'+regime;
  const parentIds=uniq([h.parentId,...(h.parents||[])]),generation=parentIds.length?2:1,parentRules=uniq(opts.parentRuleIds||[]);
  const added=ids.filter(x=>!parentRules.includes(x)),removed=parentRules.filter(x=>!ids.includes(x));
  const version=h.kind==='CROSSOVER'?'v2.0.0':parentIds.length?'v1.1.0':'v1.0.0';
  return{
    strategyId:'LAB-'+stableHash(base),family:'Pulse Research Lab',version,generation,signature:base,ruleIds:ids,regime,parentIds,
    name:ids.map(id=>Book.get(id)?.label||id).join(' + ')||'미정 전략',
    status:parentIds.length?'researching':'draft',
    mutationType:h.mutation?.type||h.kind||'OBSERVED',changeReason:h.mutation?.reason||h.thesis||'관측 데이터 기반 연구',
    diff:{fromVersion:parentIds.length?'parent':'none',toVersion:version,addedConditions:added,removedConditions:removed,modifiedConditions:[],
      expectedEffect:h.mutation?.reason||h.thesis||null,observedEffect:null},
    contract:{direction:'LONG',market:'Binance USDT perpetual research universe',maxHoldingHours:72,
      entryPolicy:opts.integrity?.contract?.entryPolicy||'NEXT_CONFIRMED_OPEN',labelVersion:opts.integrity?.contract?.labelVersion||null,
      costModelVersion:opts.integrity?.contract?.costModelVersion||null,minSample:Number(opts.integrity?.contract?.minAblationSample||30),
      prohibitedAssumptions:['Locked OOS 결과를 본 뒤 동일 버전 수정','미래 데이터 피처 사용','referenceOnly 역추적 샘플을 학습 라벨로 사용']},
    provenance:{
      featureSchemaVersion:opts.integrity?.contract?.featureSchemaVersion||null,
      datasetSnapshotId:opts.integrity?.datasetSnapshotId||null,
      labelVersion:opts.integrity?.contract?.labelVersion||null,
      testCount:Number(opts.testCount||0),
      codeCommitHash:opts.codeCommitHash||process.env.RENDER_GIT_COMMIT||process.env.COMMIT_REF||null
    },
    productionEligible:false
  };
}
function ablationStudy(rows=[],h={},opts={}){
  const ids=uniq(h.ruleIds||[]),minSample=Number(opts.minSample||30),preferred=Number(opts.preferredSample||50);
  const baseline=evaluateHypothesis(rows,h,{minSample});
  if(ids.length<2||baseline.support<minSample)return{state:'SAMPLE_INSUFFICIENT',minimumSample:minSample,preferredSample:preferred,baseline,tests:[],incremental:{state:'SAMPLE_INSUFFICIENT',steps:[]},interaction:{state:'SAMPLE_INSUFFICIENT',tests:[]},mostImportant:null,redundant:null};
  const baseVal=baseline.validation?.successRate,baseHold=baseline.validationHoldout?.successRate;
  const tests=ids.map(id=>{
    const ev=evaluateHypothesis(rows,{...h,ruleIds:ids.filter(x=>x!==id)},{minSample}),val=ev.validation?.successRate,hold=ev.validationHoldout?.successRate;
    const deltas=[baseVal!=null&&val!=null?baseVal-val:null,baseHold!=null&&hold!=null?baseHold-hold:null].filter(x=>x!=null);
    return{removedRuleId:id,removedLabel:Book.get(id)?.label||id,evaluation:ev,deltaValidation:baseVal!=null&&val!=null?baseVal-val:null,
      deltaHoldout:baseHold!=null&&hold!=null?baseHold-hold:null,importance:deltas.length?avg(deltas):null};
  }).sort((a,b)=>(b.importance??-999)-(a.importance??-999));
  return{state:baseline.support>=preferred?'READY':'MINIMUM_SAMPLE_ONLY',minimumSample:minSample,preferredSample:preferred,baseline,tests,
    incremental:incrementalStudy(rows,h,{minSample}),interaction:interactionStudy(rows,h,{minSample}),
    mostImportant:tests.find(x=>x.importance!=null&&x.importance>0)||null,redundant:tests.slice().reverse().find(x=>x.importance!=null&&x.importance<=0)||null,
    note:'Leave-one-out + Add-one + Interaction을 동일 모집단·동일 비용 가정에서 비교. Locked OOS는 사용하지 않음.'};
}

function incrementalStudy(rows=[],h={},opts={}){
  const ids=uniq(h.ruleIds||[]),minSample=Number(opts.minSample||30),steps=[];
  for(let i=1;i<=ids.length;i++){
    const ruleIds=ids.slice(0,i),evaluation=evaluateHypothesis(rows,{...h,ruleIds},{minSample});
    steps.push({step:i,ruleIds,evaluation});
  }
  return{state:steps.at(-1)?.evaluation?.support>=minSample?'READY':'SAMPLE_INSUFFICIENT',steps,note:'최소 조건에서 하나씩 추가해 표본·검증 성능 변화를 비교'};
}
function interactionStudy(rows=[],h={},opts={}){
  const ids=uniq(h.ruleIds||[]),minSample=Number(opts.minSample||30),tests=[];
  for(let k=2;k<=Math.min(3,ids.length);k++){
    for(const combo of combinations(ids,k)){
      if(tests.length>=12)break;
      tests.push({ruleIds:combo,evaluation:evaluateHypothesis(rows,{...h,ruleIds:combo},{minSample})});
    }
  }
  return{state:tests.some(x=>x.evaluation.support>=minSample)?'READY':'SAMPLE_INSUFFICIENT',tests,note:'조건 조합의 상호작용을 비교하며 Locked OOS는 사용하지 않음'};
}
function scoreStrategy(ev={},ruleCount=0){
  const v=ev.validation||{},h=ev.validationHoldout||{},support=Number(ev.support)||0;
  if(support<30)return null;
  const val=Number.isFinite(Number(v.successRate))?Number(v.successRate):0,hold=Number.isFinite(Number(h.successRate))?Number(h.successRate):0;
  const mae=Math.abs(n(h.avgMaePct,n(v.avgMaePct,0))),mfe=n(h.avgMfePct,n(v.avgMfePct,0));
  const raw=(hold*.45+val*.30+Math.min(1,support/60)*.15+Math.max(0,Math.min(1,(mfe-mae+5)/15))*.10)*100;
  const complexityPenalty=Math.max(0,ruleCount-2)*3;
  return Math.round(Math.max(0,Math.min(100,raw-complexityPenalty)));
}

function matchedEventKeys(rows=[],h={}){
  return new Set(rows.filter(r=>matchHypothesis(r,h)).map(r=>r.integrity?.eventFamilyKey||r.key).filter(Boolean));
}
function eventOverlap(a=new Set(),b=new Set()){
  if(!a.size||!b.size)return null;let inter=0;for(const x of a)if(b.has(x))inter++;
  const union=a.size+b.size-inter;return union?inter/union:null;
}
function lifecycleAssessment(rows=[],h={}){
  const matched=rows.filter(r=>matchHypothesis(r,h)).slice().sort((a,b)=>Number(a.asOf||0)-Number(b.asOf||0));
  if(matched.length<30)return{state:'INSUFFICIENT_HISTORY',sample:matched.length};
  const cut=Math.max(1,Math.floor(matched.length*.7)),older=sliceMetrics(matched.slice(0,cut)),recent=sliceMetrics(matched.slice(cut));
  const delta=older.successRate!=null&&recent.successRate!=null?recent.successRate-older.successRate:null;
  let state='STABLE';
  if(recent.count>=10&&delta!=null&&delta<=-.30)state='QUARANTINE';
  else if(recent.count>=10&&delta!=null&&delta<=-.20)state='WARNING';
  return{state,sample:matched.length,older,recent,successRateDelta:delta,note:'최근 성과가 과거 대비 크게 악화되면 경고/격리'};
}
function championChallenger(rows=[],hypotheses=[],opts={}){
  let evaluated=hypotheses.map(h=>{const evaluation=evaluateHypothesis(rows,h,{minSample:30}),score=scoreStrategy(evaluation,(h.ruleIds||[]).length);
    return{...h,dna:strategyDna(h,opts),evaluation,labScore:score,eventKeys:matchedEventKeys(rows,h),lifecycle:lifecycleAssessment(rows,h)}})
    .filter(x=>x.labScore!=null).sort((a,b)=>b.labScore-a.labScore);
  const leader=evaluated[0]||null,leaderKeys=leader?.eventKeys||new Set();
  evaluated=evaluated.map((x,i)=>{
    const overlap=i===0?0:eventOverlap(leaderKeys,x.eventKeys),penalty=overlap!=null&&overlap>.70?Math.round(((overlap-.70)/.30)*8):0;
    return{...x,eventOverlapWithLeader:overlap,orthogonalityPenalty:penalty,adjustedLabScore:Math.max(0,(x.labScore||0)-penalty)};
  }).sort((a,b)=>b.adjustedLabScore-a.adjustedLabScore);
  const provisional=evaluated[0]?{...evaluated[0],role:'PROVISIONAL',rankWeight:0,eventKeys:undefined}:null;
  return{champion:null,provisional,challengers:evaluated.slice(1,6).map(x=>({...x,role:'CHALLENGER',rankWeight:0,eventKeys:undefined})),
    gate:{minDiscoverySample:30,preferredSample:50,lockedOosRequired:true,oosVisibleToHypothesisGenerator:false,maxEventOverlapPreferred:.70},
    policy:'Champion은 sealed Locked OOS 전용 평가에서만 확정. 이벤트 중복 70% 초과 전략은 직교성 페널티 적용'};
}
function researchNotes({rows=[],observed=[],mutations=[],crossovers=[],champion=null,provisional=null,ablations=[],integrity=null}={}){
  const notes=[],now=Date.now(),ds=integrity?.datasetSnapshotId||'NO_DATASET',labels=labeled(rows),pos=labels.filter(x=>x.label===1).length,neg=labels.filter(x=>x.label===0).length;
  const make=(type,title,body,extra={})=>({id:'RN-'+stableHash(type+'|'+title+'|'+ds+'|'+(extra.experimentId||'')),at:now,type,title,body,
    datasetSnapshotId:ds,strategyVersion:extra.strategyVersion||null,experimentId:extra.experimentId||null,counterexampleIds:extra.counterexampleIds||[],
    question:extra.question||null,previousObservation:extra.previousObservation||null,hypothesis:extra.hypothesis||null,
    observedResult:extra.observedResult||null,conclusion:extra.conclusion||null,nextExperiment:extra.nextExperiment||null});
  notes.push(make('DATASET','학습 표본 점검','동일 모집단 확정 라벨 '+labels.length+'개 · 성공 '+pos+'개 · 실패 '+neg+'개. Locked OOS는 가설 생성 입력에서 제외한다.',
    {question:'현재 데이터셋이 연구에 충분한가?',observedResult:'N='+labels.length,nextExperiment:labels.length<30?'동일 모집단 표본 추가 수집':'가설별 검증 진행'}));
  if(observed[0])notes.push(make('HYPOTHESIS','가장 강한 관측 가설',observed[0].title+' · 표본 '+observed[0].support+'개 · 성공률 '+Math.round((observed[0].successRate||0)*100)+'% · 반례 '+(observed[0].counterexamples||[]).length+'개.',
    {experimentId:observed[0].id,question:'이 조건 조합이 동일 모집단에서 반복되는가?',hypothesis:observed[0].thesis,
      counterexampleIds:(observed[0].counterexamples||[]).map(x=>String(x.symbol||'')+':'+String(x.asOf||'')),nextExperiment:'반례와 조건 기여도 비교'}));
  if(provisional)notes.push(make('PROVISIONAL','잠정 전략 후보',provisional.dna.name+' · 연구점수 '+provisional.adjustedLabScore+'점. sealed OOS 전에는 Champion으로 부르지 않는다.',
    {experimentId:provisional.id,strategyVersion:provisional.dna.version,question:'검증 홀드아웃 우위가 sealed OOS에서도 유지되는가?',nextExperiment:'사전등록 후 sealed OOS 평가'}));
  const ab=ablations.find(x=>x.study?.mostImportant);
  if(ab?.study?.mostImportant)notes.push(make('ABLATION','조건 기여도 발견',ab.study.mostImportant.removedLabel+' 제거 시 검증 성능이 약해져 핵심 조건 후보로 기록했다. OOS 결과는 사용하지 않았다.',
    {experimentId:ab.hypothesisId,strategyVersion:ab.dna?.version,question:'이 조건이 실제 기여하는가?',observedResult:'importance='+ab.study.mostImportant.importance,nextExperiment:'Add-one/Interaction 교차확인'}));
  if(mutations.length||crossovers.length)notes.push(make('IDEA','새 연구 아이디어 생성','돌연변이 '+mutations.length+'개 · 교배 '+crossovers.length+'개. 실험 예산을 넘는 변형은 생성하지 않는다.',
    {question:'부모 전략의 어떤 결함을 줄일 것인가?',hypothesis:'복잡도 증가보다 검증 우위가 커야 한다',nextExperiment:'실험 예산 내 시간순 검증'}));
  return notes;
}

function tokenize(text=''){
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9가-힣_\-]+/g,' ').split(/\s+/).filter(x=>x.length>=2));
}
function retrieveResearchMemory(notes=[],h={},limit=3){
  const query=tokenize([h.title,h.thesis,...(h.ruleIds||[]),h.regime].filter(Boolean).join(' '));
  return (notes||[]).map(n=>{
    const text=[n.title,n.body,n.question,n.hypothesis,n.conclusion,n.nextExperiment,n.strategyVersion,n.experimentId].filter(Boolean).join(' ');
    const toks=tokenize(text);let hit=0;for(const q of query)if(toks.has(q))hit++;
    const score=query.size?hit/query.size:0;return{noteId:n.id,title:n.title,type:n.type,score,body:n.body,datasetSnapshotId:n.datasetSnapshotId};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
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
function labSummary(observations=[],opts={}){
  const rows=Array.isArray(observations)?observations:[],integrity=opts.integrity||{},
    minSample=Number(integrity?.contract?.minAblationSample||30),preferred=Number(integrity?.contract?.preferredAblationSample||50),
    budget=Number(integrity?.contract?.experimentBudgetPerFamily||12),
    observed=buildObservedHypotheses(rows),
    archetypes=buildArchetypeHybrids(rows),
    mutations=mutateHypotheses(observed,Math.min(30,budget)),
    crossovers=crossoverHypotheses(observed,Math.min(20,budget)),
    ideas=[...mutations,...crossovers].slice(0,budget),
    allCandidates=[...observed,...archetypes,...ideas];

  const hypothesisMap=new Map(allCandidates.map(h=>[h.id,h]));
  const parentRulesFor=h=>uniq([h.parentId,...(h.parents||[])].flatMap(id=>hypothesisMap.get(id)?.ruleIds||[]));
  const dna=allCandidates.slice(0,100).map((h,i)=>({...strategyDna(h,{integrity,testCount:i+1,parentRuleIds:parentRulesFor(h)}),hypothesisId:h.id,state:h.state||'IDEA'}));
  const ablations=observed.slice(0,12).map(h=>({hypothesisId:h.id,dna:strategyDna(h,{integrity}),study:ablationStudy(rows,h,{minSample,preferredSample:preferred})}));
  const competition=championChallenger(rows,[...observed,...archetypes],{integrity});
  const notes=researchNotes({rows,observed,mutations,crossovers,champion:null,provisional:competition.provisional,ablations,integrity});
  const health={sampleCount:rows.length,labeledCount:labeled(rows).length,minAblationSample:minSample,preferredAblationSample:preferred,
    state:labeled(rows).length<minSample?'SAMPLE_INSUFFICIENT':'READY'};
  return{
    version:VERSION,mode:'INTEGRITY_FIRST_RESEARCH',shadowOnly:true,productionAutoMutation:false,
    integrity:{contract:integrity?.contract||null,datasetSnapshotId:integrity?.datasetSnapshotId||null,health,oosAccess:'SEALED_DENY_HYPOTHESIS_GENERATOR'},
    knowledge:{registryVersion:Book.VERSION,techniques:techniqueCatalog(),coverage:techniqueCoverage(rows)},
    hypotheses:{observed,archetypes,mutations,crossovers,ideaCount:ideas.length},
    strategyDna:dna,ablation:ablations,competition,notes,
    experiments:ideas.map((h,i)=>{const evaluation=evaluateHypothesis(rows,h,{minSample}),memoryMatches=retrieveResearchMemory(opts.pastNotes||[],h,3);return{id:'EXP-'+String(i+1).padStart(3,'0'),hypothesisId:h.id,dna:strategyDna(h,{integrity,testCount:i+1}),
      idempotencyKey:stableHash((integrity?.datasetSnapshotId||'DS')+'|'+h.id+'|'+VERSION),state:evaluation.state,split:'TRAIN_VALIDATION_ONLY',requiresLockedOos:true,rankWeight:0,evaluation,memoryMatches,
      budget:{familyLimit:budget,experimentIndex:i+1,remaining:Math.max(0,budget-i-1),stopIf:['SAMPLE_INSUFFICIENT','BLOCKED_DATA_QUALITY','NO_VALIDATION_EDGE']},
      protocol:['동일 모집단 확인','중복 제거','과거 연구노트 검색','학습','검증','조건 기여도','반례 검색','sealed Locked OOS 별도 요청','연구 전용 결과만 기록']} }),
    governance:{
      states:['HYPOTHESIS_NEW','DATA_PENDING','SAMPLE_INSUFFICIENT','TRAINING','VALIDATING','OOS_LOCKED','SHADOW_RUNNING','PROMOTION_REVIEW','CHAMPION','REJECTED','RETIRED','BLOCKED_DATA_QUALITY'],
      currentMaxAutoState:'SHADOW_RUNNING',
      promotionRequires:['연구계약 고정','동일 모집단','실패/반례 포함','최소 표본 30','purge/embargo','sealed Locked OOS','조건 기여도','복잡도 페널티','실험 예산','데이터 누수 검사'],
      note:'가설 생성기는 Locked OOS를 볼 수 없으며 Champion 확정은 별도 sealed 평가에서만 가능.'
    }
  };
}

module.exports={VERSION,techniqueCatalog,observedRuleStats,comboStats,buildObservedHypotheses,buildArchetypeHybrids,mutateHypotheses,crossoverHypotheses,matchHypothesis,evaluateHypothesis,strategyDna,ablationStudy,incrementalStudy,interactionStudy,matchedEventKeys,eventOverlap,lifecycleAssessment,championChallenger,researchNotes,retrieveResearchMemory,techniqueCoverage,labSummary};

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiSummaryTemplate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const VERSION='BOOK_AI_CANONICAL_SUMMARY_v1';
const GENERATED_BY='TEMPLATE_ENGINE';
const STATE_LABELS=Object.freeze({
  NO_SETUP:'셋업 없음',
  WATCH:'관찰',
  READY:'준비',
  CONFIRMED:'확정',
  INVALIDATED:'무효화'
});
const ALIGNMENT_LABELS=Object.freeze({
  ALIGNED:'상위 프레임 정렬',
  PARTIAL:'상위 프레임 부분 정렬',
  MIXED:'상위 프레임 혼조',
  UNKNOWN:'상위 프레임 확인 부족'
});
const RULE_LABELS=Object.freeze({
  BREAKOUT_RETEST:'돌파 후 리테스트',
  SUPPORT_RESISTANCE_FLIP:'지지·저항 역할 전환',
  TRENDLINE_REACTION:'추세선 반응',
  LIQUIDITY_SWEEP_RECLAIM:'유동성 스윕 후 회복',
  VOLUME_CONTRACTION_BREAK:'거래량 수축 후 돌파',
  MOVING_AVERAGE_COMPRESSION:'이평 압축'
});
const RULE_STATUS_LABELS=Object.freeze({
  CONFIRMED:'확인',
  CANDIDATE:'후보',
  NOT_CONFIRMED:'미확인',
  INVALIDATED:'무효',
  'N/A':'자료 없음'
});
const DATA_STATE_LABELS=Object.freeze({FRESH:'데이터 정상',DEGRADED:'데이터 품질 저하'});
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const stable=v=>{
  if(v==null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
};
function getPath(obj,path){
  const parts=String(path||'').split('.').filter(Boolean);
  let cur=obj;
  for(const p of parts){
    if(cur==null||!Object.prototype.hasOwnProperty.call(cur,p))return undefined;
    cur=cur[p];
  }
  return cur;
}
function claim(fusion,claimId,sourcePath,label,format=v=>String(v)){
  const rawValue=getPath(fusion,sourcePath);
  if(rawValue===undefined)throw new Error('summary claim source missing: '+sourcePath);
  return{claimId,sourcePath,label,rawValue:clone(rawValue),text:format(rawValue)};
}
function labelBias(v){
  const s=String(v??'').toLowerCase();
  if(s.includes('bull')||s.includes('up')||s.includes('상승'))return'상승';
  if(s.includes('bear')||s.includes('down')||s.includes('하락'))return'하락';
  if(s.includes('neutral')||s.includes('mixed')||s.includes('혼조')||s.includes('중립'))return'중립';
  return String(v??'확인 부족');
}
function activeRules(fusion){
  return (fusion.bookSetups||[])
    .filter(x=>x&&['CONFIRMED','CANDIDATE'].includes(x.status))
    .slice()
    .sort((a,b)=>String(a.ruleId).localeCompare(String(b.ruleId)));
}
function degradedSources(fusion){
  return Object.entries(fusion.engineSources||{})
    .filter(([,x])=>x&&['MISSING','STALE','ERROR'].includes(x.status))
    .sort(([a],[b])=>a.localeCompare(b));
}
function buildCanonicalSummary(fusion={}){
  if(!fusion||typeof fusion!=='object')throw new Error('fusion result required');
  if(!fusion.symbol)throw new Error('fusion.symbol required');
  if(!fusion.setupState)throw new Error('fusion.setupState required');
  if(!fusion.bias?.value)throw new Error('fusion.bias.value required');
  if(!fusion.stage?.code)throw new Error('fusion.stage.code required');
  if(!fusion.bookEvidence||!Number.isFinite(Number(fusion.bookEvidence.normalizedScore)))throw new Error('fusion.bookEvidence.normalizedScore required');

  const claims=[
    claim(fusion,'symbol','symbol','심볼',v=>String(v)),
    claim(fusion,'bias','bias.value','편향',labelBias),
    claim(fusion,'stage','stage.code','Scanner 단계',v=>String(v)),
    claim(fusion,'setupState','setupState','Book AI 상태',v=>STATE_LABELS[v]||String(v)),
    claim(fusion,'htfAlignment','htfAlignment','상위 정렬',v=>ALIGNMENT_LABELS[v]||String(v)),
    claim(fusion,'evidenceScore','bookEvidence.normalizedScore','근거 완성도',v=>String(Math.round(Number(v)))),
    claim(fusion,'dataState','setupLifecycle.dataState','데이터 상태',v=>DATA_STATE_LABELS[v]||String(v))
  ];

  const rules=activeRules(fusion);
  const ruleClaims=rules.map((r,i)=>({
    claimId:'rule_'+i,
    sourcePath:'bookSetups',
    label:'책 규칙',
    rawValue:{ruleId:r.ruleId,status:r.status},
    text:(RULE_LABELS[r.ruleId]||r.ruleId)+' '+(RULE_STATUS_LABELS[r.status]||r.status)
  }));
  const degraded=degradedSources(fusion);
  const degradedClaims=degraded.map(([name,x],i)=>({
    claimId:'degraded_'+i,
    sourcePath:'engineSources.'+name,
    label:'데이터 품질',
    rawValue:clone(x),
    text:name+' '+x.status+(x.reason?' ('+x.reason+')':'')
  }));

  const c=Object.fromEntries(claims.map(x=>[x.claimId,x]));
  const headline=c.symbol.text+' · '+c.setupState.text+' · '+c.stage.text+' · '+c.bias.text;
  const htf=c.htfAlignment.text+' · 편향 '+c.bias.text;
  const setup=ruleClaims.length?ruleClaims.map(x=>x.text).join(' · '):'활성 Book Rule 없음';
  const evidence='근거 완성도 '+c.evidenceScore.text+'/100';
  const dataQuality=degradedClaims.length?c.dataState.text+' · '+degradedClaims.map(x=>x.text).join(' · '):c.dataState.text;
  let counterEvidence='명시적 무효화 근거 없음';
  if(fusion.setupState==='INVALIDATED')counterEvidence='명시적 무효화 근거 확인';
  else if(fusion.setupLifecycle?.transition?.reason==='DATA_DEGRADED_HOLD')counterEvidence='데이터 품질 저하로 기존 상태 유지';
  else if(fusion.htfAlignment==='MIXED')counterEvidence='상위 프레임 정렬 혼조';

  let nextConfirmation='추가 확정 규칙 대기';
  if(fusion.setupState==='CONFIRMED')nextConfirmation='현재 sequence 확정 상태 유지 조건 관찰';
  else if(fusion.setupState==='INVALIDATED')nextConfirmation='새 sequence 형성 전까지 무효화 상태';
  else if(fusion.setupState==='NO_SETUP')nextConfirmation='새 후보 근거 발생 대기';
  else if(rules.some(x=>x.status==='CANDIDATE'))nextConfirmation='후보 규칙의 event-backed 확정 근거 대기';

  const summary={
    version:VERSION,
    generatedBy:GENERATED_BY,
    analysisAsOf:fusion.analysisAsOf,
    symbol:fusion.symbol,
    headline,
    htf,
    setup,
    evidence,
    dataQuality,
    counterEvidence,
    nextConfirmation,
    claims:[...claims,...ruleClaims,...degradedClaims],
    referencedPrices:[],
    llmUsed:false
  };
  return Object.freeze(summary);
}
function assertCanonicalSummaryGrounded(summary,fusion){
  if(summary?.generatedBy!==GENERATED_BY)throw new Error('canonical summary must be TEMPLATE_ENGINE generated');
  if(summary?.llmUsed!==false)throw new Error('canonical summary may not use LLM');
  if(Array.isArray(summary?.referencedPrices)&&summary.referencedPrices.length)throw new Error('canonical summary v1 may not emit prices');
  const expected=buildCanonicalSummary(fusion);
  if(stable(summary)!==stable(expected))throw new Error('canonical summary diverges from deterministic fusion template');
  for(const c of summary.claims||[]){
    if(c.sourcePath==='bookSetups'){
      const ok=(fusion.bookSetups||[]).some(r=>r.ruleId===c.rawValue?.ruleId&&r.status===c.rawValue?.status);
      if(!ok)throw new Error('summary rule claim not grounded: '+c.claimId);
    }else{
      const actual=getPath(fusion,c.sourcePath);
      if(stable(actual)!==stable(c.rawValue))throw new Error('summary claim value mismatch: '+c.sourcePath);
    }
  }
  return true;
}
return{VERSION,GENERATED_BY,STATE_LABELS,ALIGNMENT_LABELS,RULE_LABELS,RULE_STATUS_LABELS,DATA_STATE_LABELS,getPath,labelBias,activeRules,degradedSources,buildCanonicalSummary,assertCanonicalSummaryGrounded};
});
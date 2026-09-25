'use strict';

const VERSION='SETUP_VALIDATION_REPORT_r0.1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function pct(v,d=1){const n=finite(v);return n==null?'N/A':(n*100).toFixed(d)+'%'}
function num(v,d=2){const n=finite(v);return n==null?'N/A':n.toFixed(d)}
function int(v){const n=finite(v);return n==null?'0':String(Math.trunc(n))}
function cell(v){return v==null?'N/A':String(v).replace(/\|/g,'\\|')}
function setupLabel(v){return v==='BOTTOM_REVERSAL'?'바닥 전환':v==='PREBREAKOUT'?'급등 전조':v}
function regimeLabel(v){return({bull:'상승장',bear:'하락장',sideways:'횡보장','high-vol':'고변동성',unknown:'미분류',ALL:'전체'})[v]||v}

function costMatrix(batch={},split='lockedOos'){
  const out=[];
  for(const costKey of ['1x','1.5x','2x']){
    const x=batch?.regimeAggregates?.[split]?.[costKey]?.['ALL|ALL'];
    if(!x)continue;
    out.push({costKey,tradeCount:x.tradeCount||0,precision:x.precision,falseTriggerRate:x.falseTriggerRate,medianR:x.medianRealizedR,meanR:x.meanRealizedR,meanReturnPct:x.meanReturnPct});
  }
  return out;
}
function setupMatrix(batch={},split='lockedOos',costKey='1x'){
  const src=batch?.regimeAggregates?.[split]?.[costKey]||{},rows=[];
  for(const type of ['BOTTOM_REVERSAL','PREBREAKOUT']){
    const x=src[type+'|ALL'];if(!x)continue;
    rows.push({setupType:type,tradeCount:x.tradeCount||0,precision:x.precision,falseTriggerRate:x.falseTriggerRate,medianR:x.medianRealizedR,meanR:x.meanRealizedR,meanReturnPct:x.meanReturnPct});
  }
  return rows;
}
function regimeMatrix(batch={},split='lockedOos',costKey='1x'){
  const src=batch?.regimeAggregates?.[split]?.[costKey]||{},rows=[];
  for(const regime of ['bull','bear','sideways','high-vol','unknown']){
    const x=src['ALL|'+regime];if(!x)continue;
    rows.push({regime,tradeCount:x.tradeCount||0,precision:x.precision,falseTriggerRate:x.falseTriggerRate,medianR:x.medianRealizedR,meanReturnPct:x.meanReturnPct});
  }
  return rows;
}
function structureMatrix(batch={}){
  return (batch?.symbolSummary||[]).map(x=>({
    symbol:x.symbol,
    structureTriggers:x.lockedOosStructureTriggers||0,
    executionCoverageRate:x.lockedOosExecutionCoverageRate,
    triggerConfirmConversion:x.lockedOosTriggerConfirmConversion,
    executionTrades:x.lockedOosTrades||0,
    precision:x.lockedOosPrecision,
    falseTriggerRate:x.lockedOosFalseTriggerRate,
    medianR:x.lockedOosMedianR
  })).sort((a,b)=>b.structureTriggers-a.structureTriggers||String(a.symbol).localeCompare(String(b.symbol)));
}
function rejectionMatrix(batch={}){
  const a=batch?.featureAudit?.lockedOos||{},counts=a.counts||{};
  return Object.entries(counts).map(([reason,count])=>({reason,count,rate:a.decisionCount?count/a.decisionCount:null})).sort((x,y)=>y.count-x.count);
}
function rejectionBySymbol(batch={}){
  const syms=batch?.featureAudit?.lockedOos?.symbols||{};
  return Object.values(syms).map(x=>({symbol:x.symbol,decisionCount:x.decisionCount||0,topReason:Object.entries(x.counts||{}).sort((a,b)=>b[1]-a[1])[0]?.[0]||null,topCount:Object.entries(x.counts||{}).sort((a,b)=>b[1]-a[1])[0]?.[1]||0,diagnosis:(x.diagnosis||[])[0]?.kind||null})).sort((a,b)=>b.topCount-a.topCount||String(a.symbol).localeCompare(String(b.symbol)));
}
function caveats(batch={}){
  const notes=[];
  const symbols=batch?.symbolSummary||[];
  const anyMissingExecution=symbols.some(x=>(finite(x.lockedOosExecutionCoverageRate)??0)<1);
  if(anyMissingExecution)notes.push('일부 구간은 과거 order-book/spread/depth가 없어 구조 검증과 execution-qualified 검증을 분리했다.');
  if((batch?.errorCount||0)>0)notes.push('일부 종목 검증이 실패하여 전체 집계에서 제외됐다. errors를 확인해야 한다.');
  const agg=batch?.aggregateLockedOos;
  if(!agg||!(agg.tradeCount>0))notes.push('Locked OOS execution-qualified 거래 표본이 부족하거나 없다. 성과 결론을 내리면 안 된다.');
  notes.push('Locked OOS는 평가 전용이며, 결과를 본 뒤 파라미터를 수정하면 같은 OOS를 다시 최종 검증으로 사용하면 안 된다.');
  notes.push('구조 trigger의 MFE/MAE는 체결 성과가 아니라 선행 신호 품질 진단용이다.');
  return notes;
}
function buildJson(batch={},meta={}){
  return{
    version:VERSION,
    generatedAt:meta.generatedAt??Date.now(),
    sourceReportId:meta.sourceReportId||null,
    caseCount:batch.caseCount||0,errorCount:batch.errorCount||0,
    lockedOos:{
      aggregate:batch.aggregateLockedOos||null,
      bySetup:setupMatrix(batch),
      byRegime:regimeMatrix(batch),
      costStress:costMatrix(batch),
      symbolStructureExecution:structureMatrix(batch),
      featureRejections:rejectionMatrix(batch),
      featureRejectionsBySymbol:rejectionBySymbol(batch),
      featureAuditDiagnosis:batch?.featureAudit?.lockedOos?.diagnosis||[]
    },
    errors:batch.errors||[],
    caveats:caveats(batch)
  };
}
function mdTable(headers,rows){
  if(!rows.length)return '_표본 없음_';
  return[
    '| '+headers.join(' | ')+' |',
    '| '+headers.map(()=> '---').join(' | ')+' |',
    ...rows.map(r=>'| '+r.map(cell).join(' | ')+' |')
  ].join('\n');
}
function buildMarkdown(batch={},meta={}){
  const j=buildJson(batch,meta),lines=[];
  lines.push('# Setup Validation 리포트');
  lines.push('');
  lines.push('- 검증 종목: **'+j.caseCount+'개**');
  lines.push('- 제외/오류: **'+j.errorCount+'개**');
  if(j.sourceReportId)lines.push('- 원본 report: '+j.sourceReportId);
  lines.push('');
  lines.push('## Locked OOS — Setup 유형별');
  lines.push('');
  lines.push(mdTable(
    ['유형','거래수','Precision','False trigger','Median R','Mean R','평균수익률'],
    j.lockedOos.bySetup.map(x=>[setupLabel(x.setupType),int(x.tradeCount),pct(x.precision),pct(x.falseTriggerRate),num(x.medianR),num(x.meanR),x.meanReturnPct==null?'N/A':num(x.meanReturnPct)+'%'])
  ));
  lines.push('');
  lines.push('## Locked OOS — 시장 Regime별');
  lines.push('');
  lines.push(mdTable(
    ['Regime','거래수','Precision','False trigger','Median R','평균수익률'],
    j.lockedOos.byRegime.map(x=>[regimeLabel(x.regime),int(x.tradeCount),pct(x.precision),pct(x.falseTriggerRate),num(x.medianR),x.meanReturnPct==null?'N/A':num(x.meanReturnPct)+'%'])
  ));
  lines.push('');
  lines.push('## 비용 스트레스');
  lines.push('');
  lines.push(mdTable(
    ['비용','거래수','Precision','False trigger','Median R','Mean R','평균수익률'],
    j.lockedOos.costStress.map(x=>[x.costKey,int(x.tradeCount),pct(x.precision),pct(x.falseTriggerRate),num(x.medianR),num(x.meanR),x.meanReturnPct==null?'N/A':num(x.meanReturnPct)+'%'])
  ));
  lines.push('');
  lines.push('## 구조 신호 vs Execution-qualified');
  lines.push('');
  lines.push(mdTable(
    ['종목','구조 Trigger','Execution coverage','Trigger→Confirm','실체결 거래','Precision','False trigger','Median R'],
    j.lockedOos.symbolStructureExecution.map(x=>[x.symbol,int(x.structureTriggers),pct(x.executionCoverageRate),pct(x.triggerConfirmConversion),int(x.executionTrades),pct(x.precision),pct(x.falseTriggerRate),num(x.medianR)])
  ));
  lines.push('');
  lines.push('## Locked OOS — Feature-level 탈락 감사');
  lines.push('');
  lines.push(mdTable(
    ['탈락 이유','건수','Decision 대비'],
    j.lockedOos.featureRejections.map(x=>[x.reason,int(x.count),pct(x.rate)])
  ));
  lines.push('');
  lines.push('## Locked OOS — 종목별 최다 탈락 지점');
  lines.push('');
  lines.push(mdTable(
    ['종목','Decision','최다 탈락 이유','건수','진단'],
    j.lockedOos.featureRejectionsBySymbol.map(x=>[x.symbol,int(x.decisionCount),x.topReason,int(x.topCount),x.diagnosis])
  ));
  lines.push('');
  lines.push('## 해석 주의사항');
  lines.push('');
  for(const x of j.caveats)lines.push('- '+x);
  if(j.errors.length){
    lines.push('');
    lines.push('## 제외/오류');
    lines.push('');
    lines.push(mdTable(['종목','오류'],j.errors.map(x=>[x.symbol||'?',x.error||'unknown'])));
  }
  return lines.join('\n');
}
function buildReport(batch={},meta={}){
  const json=buildJson(batch,meta);
  return{version:VERSION,json,markdown:buildMarkdown(batch,meta)};
}

module.exports={VERSION,costMatrix,setupMatrix,regimeMatrix,structureMatrix,rejectionMatrix,rejectionBySymbol,caveats,buildJson,buildMarkdown,buildReport};

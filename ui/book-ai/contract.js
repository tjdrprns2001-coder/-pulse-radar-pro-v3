(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiContract=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const SCHEMA_VERSION=1;
const ANALYSIS_VERSION='BOOK_AI_ANALYST_v1';
const BOOK_EVIDENCE_VERSION='BOOK_EVIDENCE_v1';
const SCORE_TYPE='EVIDENCE_COMPLETENESS';
const BOOK_STORAGE_PREFIX='pulse_book_ai_';
const LEGACY_STORAGE_PREFIX='pulse_legacy_ai_';

const COMPONENT_MAX=Object.freeze({
  bookStructure:25,
  htfAlignment:20,
  liquiditySmc:20,
  volumeRvol:12,
  derivatives:10,
  retestReclaim:8
});
const COMPONENT_KEYS=Object.freeze(Object.keys(COMPONENT_MAX));
const RAW_MAX=Object.values(COMPONENT_MAX).reduce((s,v)=>s+v,0);

const SETUP_STATES=Object.freeze(['WATCH','READY','CONFIRMED','INVALIDATED','NO_SETUP']);
const RULE_STATUSES=Object.freeze(['CONFIRMED','CANDIDATE','NOT_CONFIRMED','INVALIDATED','N/A']);
const SAMPLE_DNA_MODES=Object.freeze(['SHADOW_ONLY']);
const SAMPLE_DNA_STATUSES=Object.freeze(['NOT_EVALUATED','SHADOW_READY','SHADOW_INSUFFICIENT']);
const ENGINE_SOURCE_STATUSES=Object.freeze(['AVAILABLE','MISSING','STALE','ERROR']);

function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function number(v,name){if(!finite(v))throw new Error(name+' must be finite');return Number(v)}
function text(v,name){const s=String(v??'').trim();if(!s)throw new Error(name+' required');return s}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function deepFreeze(v){if(!v||typeof v!=='object'||Object.isFrozen(v))return v;Object.freeze(v);for(const x of Object.values(v))deepFreeze(x);return v}
function object(v,name){if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(name+' must be object');return v}
function enumValue(v,allowed,name){const s=text(v,name);if(!allowed.includes(s))throw new Error(name+' invalid: '+s);return s}
function uniqueStrings(v){return[...new Set((Array.isArray(v)?v:[]).map(x=>String(x||'').trim()).filter(Boolean))]}
function sameJson(a,b){return JSON.stringify(a)===JSON.stringify(b)}

function computeEvidenceScore(components){
  object(components,'bookEvidence.components');
  const keys=Object.keys(components).sort(),expected=[...COMPONENT_KEYS].sort();
  if(!sameJson(keys,expected))throw new Error('bookEvidence.components must contain exactly: '+COMPONENT_KEYS.join(', '));
  const normalized={};
  let rawScore=0;
  for(const key of COMPONENT_KEYS){
    const value=number(components[key],'bookEvidence.components.'+key),max=COMPONENT_MAX[key];
    if(value<0||value>max)throw new Error(key+' score out of range 0..'+max);
    normalized[key]=value;rawScore+=value;
  }
  const roundedRaw=Math.round(rawScore*1e6)/1e6;
  return{
    scoreVersion:BOOK_EVIDENCE_VERSION,
    scoreType:SCORE_TYPE,
    rawScore:roundedRaw,
    rawMax:RAW_MAX,
    normalizedScore:Math.round(roundedRaw/RAW_MAX*100),
    components:normalized,
    rankingContribution:0
  };
}

function normalizeBookEvidence(input={}){
  object(input,'bookEvidence');
  const computed=computeEvidenceScore(input.components||{});
  if(input.scoreVersion!=null&&input.scoreVersion!==BOOK_EVIDENCE_VERSION)throw new Error('bookEvidence.scoreVersion must be '+BOOK_EVIDENCE_VERSION);
  if(input.scoreType!=null&&input.scoreType!==SCORE_TYPE)throw new Error('bookEvidence.scoreType must be '+SCORE_TYPE);
  if(input.rawMax!=null&&Number(input.rawMax)!==RAW_MAX)throw new Error('bookEvidence.rawMax must be '+RAW_MAX);
  if(input.rawScore!=null&&Number(input.rawScore)!==computed.rawScore)throw new Error('bookEvidence.rawScore mismatch');
  if(input.normalizedScore!=null&&Number(input.normalizedScore)!==computed.normalizedScore)throw new Error('bookEvidence.normalizedScore mismatch');
  if(Number(input.rankingContribution||0)!==0)throw new Error('bookEvidence.rankingContribution must be 0');
  return computed;
}

function normalizeSampleDna(input={}){
  object(input,'sampleDna');
  const mode=enumValue(input.mode||'SHADOW_ONLY',SAMPLE_DNA_MODES,'sampleDna.mode');
  const scoreContribution=Number(input.scoreContribution||0),rankingContribution=Number(input.rankingContribution||0);
  if(scoreContribution!==0)throw new Error('sampleDna.scoreContribution must be 0');
  if(rankingContribution!==0)throw new Error('sampleDna.rankingContribution must be 0');
  let similarityScore=input.similarityScore??null;
  if(similarityScore!=null){
    similarityScore=number(similarityScore,'sampleDna.similarityScore');
    if(similarityScore<0||similarityScore>100)throw new Error('sampleDna.similarityScore out of range 0..100');
  }
  return{
    mode,
    similarityVersion:input.similarityVersion==null?null:String(input.similarityVersion),
    nearestSamples:Array.isArray(input.nearestSamples)?clone(input.nearestSamples):[],
    similarityScore,
    scoreContribution:0,
    rankingContribution:0,
    status:enumValue(input.status||'NOT_EVALUATED',SAMPLE_DNA_STATUSES,'sampleDna.status')
  };
}

function normalizeBookSetup(rule={},analysisAsOf){
  object(rule,'bookSetup');
  const status=enumValue(rule.status||'NOT_CONFIRMED',RULE_STATUSES,'bookSetup.status');
  const evidenceFactIds=uniqueStrings(rule.evidenceFactIds);
  const evidenceEventIds=uniqueStrings(rule.evidenceEventIds);
  const trustedEvidenceEventIds=uniqueStrings(rule.trustedEvidenceEventIds);
  const ephemeralEvidenceEventIds=uniqueStrings(rule.ephemeralEvidenceEventIds);
  const evidenceSnapshotIds=uniqueStrings(rule.evidenceSnapshotIds);
  if(status==='CONFIRMED'&&!evidenceEventIds.length)throw new Error('CONFIRMED book rule requires evidenceEventIds');
  if(status==='CONFIRMED'&&!trustedEvidenceEventIds.length)throw new Error('CONFIRMED book rule requires trustedEvidenceEventIds');
  const out={
    ruleId:text(rule.ruleId,'bookSetup.ruleId'),
    ruleVersion:number(rule.ruleVersion,'bookSetup.ruleVersion'),
    status,
    paramsHash:text(rule.paramsHash,'bookSetup.paramsHash'),
    sourceBookId:text(rule.sourceBookId,'bookSetup.sourceBookId'),
    sourceReference:text(rule.sourceReference,'bookSetup.sourceReference'),
    sequenceId:rule.sequenceId==null?null:String(rule.sequenceId),
    evidenceFactIds,
    evidenceEventIds,
    trustedEvidenceEventIds,
    ephemeralEvidenceEventIds,
    evidenceSnapshotIds
  };
  if(status==='CONFIRMED'&&!out.sequenceId)throw new Error('CONFIRMED book rule requires sequenceId');
  if(rule.evidenceConfirmedAt!=null){
    const ts=number(rule.evidenceConfirmedAt,'bookSetup.evidenceConfirmedAt');
    if(ts>analysisAsOf)throw new Error('book rule references evidence after analysisAsOf');
    out.evidenceConfirmedAt=ts;
  }
  return out;
}

function normalizeDataPolicy(input={},analysisAsOf){
  object(input,'dataPolicy');
  const candlePolicy=String(input.candlePolicy||'CLOSED_ONLY');
  if(candlePolicy!=='CLOSED_ONLY')throw new Error('Book AI requires CLOSED_ONLY candlePolicy');
  const closedThrough={};
  object(input.closedThrough||{},'dataPolicy.closedThrough');
  for(const [tf,v] of Object.entries(input.closedThrough||{})){
    const ts=number(v,'dataPolicy.closedThrough.'+tf);
    if(ts>analysisAsOf)throw new Error('source candle after analysisAsOf: '+tf);
    closedThrough[String(tf).toLowerCase()]=ts;
  }
  return{candlePolicy:'CLOSED_ONLY',closedThrough};
}

function normalizeInheritedFact(input,name){
  object(input,name);
  return{
    value:text(input.value,name+'.value'),
    source:text(input.source,name+'.source'),
    ...(input.paramsHash==null?{}:{paramsHash:String(input.paramsHash)})
  };
}

function normalizeStage(input){
  object(input,'stage');
  return{
    code:text(input.code,'stage.code'),
    source:text(input.source,'stage.source'),
    ...(input.paramsHash==null?{}:{paramsHash:String(input.paramsHash)})
  };
}

function normalizeEngineSources(input={},analysisAsOf){
  object(input,'engineSources');
  const out={};
  for(const [name,raw] of Object.entries(input)){
    object(raw,'engineSources.'+name);
    const status=enumValue(raw.status,ENGINE_SOURCE_STATUSES,'engineSources.'+name+'.status');
    const observedAt=raw.observedAt==null?null:number(raw.observedAt,'engineSources.'+name+'.observedAt');
    const staleAfterMs=raw.staleAfterMs==null?null:number(raw.staleAfterMs,'engineSources.'+name+'.staleAfterMs');
    if(observedAt!=null&&observedAt>analysisAsOf)throw new Error('engine source observed after analysisAsOf: '+name);
    if(staleAfterMs!=null&&staleAfterMs<0)throw new Error('engine source staleAfterMs must be >= 0: '+name);
    const ageMs=observedAt==null?null:Math.max(0,analysisAsOf-observedAt);
    if(raw.ageMs!=null&&Number(raw.ageMs)!==ageMs)throw new Error('engine source ageMs mismatch: '+name);
    out[name]={
      status,
      version:raw.version==null?null:String(raw.version),
      observedAt,
      staleAfterMs,
      ageMs,
      reason:raw.reason==null?null:String(raw.reason),
      dataAvailable:raw.dataAvailable===true
    };
  }
  return out;
}

function createBookAnalysisResult(input={}){
  object(input,'BookAnalysisResult');
  const analysisAsOf=number(input.analysisAsOf,'analysisAsOf');
  const generatedAt=number(input.generatedAt,'generatedAt');
  if(generatedAt<analysisAsOf)throw new Error('generatedAt must be >= analysisAsOf');
  const bookEvidence=normalizeBookEvidence(input.bookEvidence||{});
  const sampleDna=normalizeSampleDna(input.sampleDna||{});
  const out={
    schemaVersion:SCHEMA_VERSION,
    analysisVersion:ANALYSIS_VERSION,
    analysisId:text(input.analysisId,'analysisId'),
    symbol:text(input.symbol,'symbol').toUpperCase(),
    exchange:text(input.exchange,'exchange').toUpperCase(),
    marketType:text(input.marketType,'marketType'),
    analysisAsOf,
    generatedAt,
    dataPolicy:normalizeDataPolicy(input.dataPolicy||{},analysisAsOf),
    engines:clone(input.engines||{}),
    engineSources:normalizeEngineSources(input.engineSources||{},analysisAsOf),
    bias:normalizeInheritedFact(input.bias,'bias'),
    stage:normalizeStage(input.stage),
    setupState:enumValue(input.setupState||'WATCH',SETUP_STATES,'setupState'),
    htfAlignment:String(input.htfAlignment||'UNKNOWN'),
    bookSetups:(Array.isArray(input.bookSetups)?input.bookSetups:[]).map(x=>normalizeBookSetup(x,analysisAsOf)),
    evidenceFacts:clone(Array.isArray(input.evidenceFacts)?input.evidenceFacts:[]),
    evidenceAudit:clone(input.evidenceAudit||{}),
    htf:clone(input.htf||{}),
    ltf:clone(input.ltf||{}),
    trigger:clone(input.trigger||{}),
    dol:clone(input.dol||{}),
    invalidation:clone(input.invalidation||{}),
    bookEvidence,
    sampleDna,
    journal:clone(input.journal||{}),
    summary:clone(input.summary||{}),
    snapshotReady:input.snapshotReady===true,
    promptVersion:input.promptVersion==null?null:String(input.promptVersion),
    modelVersion:input.modelVersion==null?null:String(input.modelVersion)
  };
  if(input.schemaVersion!=null&&Number(input.schemaVersion)!==SCHEMA_VERSION)throw new Error('schemaVersion mismatch');
  if(input.analysisVersion!=null&&input.analysisVersion!==ANALYSIS_VERSION)throw new Error('analysisVersion mismatch');
  return deepFreeze(out);
}

function validateBookAnalysisResult(input){createBookAnalysisResult(input);return true}

function assertInheritedFactsUnchanged(source={},result={}){
  if(!source||!result)throw new Error('source and result required');
  const sb=source.bias?.value??source.bias,rb=result.bias?.value??result.bias;
  if(String(sb)!==String(rb))throw new Error('Book AI bias mutation forbidden');
  const ss=source.stage?.code??source.stage,rs=result.stage?.code??result.stage;
  if(String(ss)!==String(rs))throw new Error('Book AI stage mutation forbidden');
  if(source.stage?.paramsHash!=null&&String(source.stage.paramsHash)!==String(result.stage?.paramsHash??''))throw new Error('Book AI stage paramsHash mutation forbidden');
  return true;
}

function assertEvidenceWithinAnalysisAsOf({analysisAsOf,events=[],candles=[]}={}){
  const asOf=number(analysisAsOf,'analysisAsOf');
  for(const e of Array.isArray(events)?events:[]){
    const ts=e?.confirmedAt??e?.candleTime;
    if(ts!=null&&number(ts,'event.confirmedAt')>asOf)throw new Error('event after analysisAsOf');
  }
  for(const c of Array.isArray(candles)?candles:[]){
    const ts=c?.closeTime??c?.closedAt??c?.time;
    if(ts!=null&&number(ts,'candle.closeTime')>asOf)throw new Error('candle after analysisAsOf');
    if(c?.confirmed===false||c?.isClosed===false)throw new Error('incomplete candle forbidden');
  }
  return true;
}

function assertBookStorageKey(key){
  const k=text(key,'storage key');
  if(k.startsWith(LEGACY_STORAGE_PREFIX))throw new Error('Legacy AI storage access forbidden');
  if(!k.startsWith(BOOK_STORAGE_PREFIX))throw new Error('Book AI storage key must use '+BOOK_STORAGE_PREFIX);
  return true;
}

function assertPresurgeReadOnly(sourcePresurge,resultPresurge){
  const hasSource=sourcePresurge!=null,hasResult=resultPresurge!=null;
  if(!hasSource&&hasResult)throw new Error('Book AI may not create PRE-SURGE state');
  if(hasSource&&!hasResult)throw new Error('Book AI may not drop PRE-SURGE source state');
  if(hasSource&&!sameJson(sourcePresurge,resultPresurge))throw new Error('Book AI may not mutate PRE-SURGE state');
  return true;
}

return{
  SCHEMA_VERSION,ANALYSIS_VERSION,BOOK_EVIDENCE_VERSION,SCORE_TYPE,
  BOOK_STORAGE_PREFIX,LEGACY_STORAGE_PREFIX,COMPONENT_MAX,COMPONENT_KEYS,RAW_MAX,
  SETUP_STATES,RULE_STATUSES,SAMPLE_DNA_MODES,SAMPLE_DNA_STATUSES,ENGINE_SOURCE_STATUSES,
  finite,deepFreeze,computeEvidenceScore,normalizeBookEvidence,normalizeSampleDna,
  normalizeBookSetup,normalizeDataPolicy,normalizeEngineSources,createBookAnalysisResult,validateBookAnalysisResult,
  assertInheritedFactsUnchanged,assertEvidenceWithinAnalysisAsOf,assertBookStorageKey,assertPresurgeReadOnly
};
});
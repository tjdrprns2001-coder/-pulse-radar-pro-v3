(function(root,factory){
  const Contract=typeof module==='object'&&module.exports?require('./contract.js'):root?.PulseBookAiContract;
  const api=factory(Contract);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiRuleEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Contract){'use strict';

if(!Contract)throw new Error('PulseBookAiContract required');

const VERSION='BOOK_AI_RULE_ENGINE_v1';
const FACT_VERSION=1;
const RULE_VERSION=1;
const SOURCE_BOOK_ID='all-you-should-know-about-forex-1-406';
const SOURCE_ENGINE='FOREX_BOOK_ENGINE_v4';
const RULE_IDS=Object.freeze([
  'BREAKOUT_RETEST',
  'SUPPORT_RESISTANCE_FLIP',
  'TRENDLINE_REACTION',
  'LIQUIDITY_SWEEP_RECLAIM',
  'VOLUME_CONTRACTION_BREAK',
  'MOVING_AVERAGE_COMPRESSION'
]);
const EVENT_FACT_MAP=Object.freeze({
  LIQ_SWEEP:'LIQUIDITY_SWEEP',
  RECLAIM:'RECLAIM',
  TL_BREAK:'TRENDLINE_BREAK',
  TL_RETEST_TOUCH:'RETEST_TOUCH',
  TL_RETEST_CONFIRMED:'RETEST_CONFIRMED',
  TL_RETEST_FAILED:'RETEST_FAILED',
  MSS:'MSS',
  DISPLACEMENT:'DISPLACEMENT'
});
const RULE_SOURCE_REF=Object.freeze({
  BREAKOUT_RETEST:'support-resistance-breakout-retest',
  SUPPORT_RESISTANCE_FLIP:'support-resistance-role-reversal',
  TRENDLINE_REACTION:'trendline-reaction-retest',
  LIQUIDITY_SWEEP_RECLAIM:'liquidity-sweep-reclaim',
  VOLUME_CONTRACTION_BREAK:'volume-contraction-breakout',
  MOVING_AVERAGE_COMPRESSION:'moving-average-compression-transition'
});
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=(v,d=null)=>finite(v)?Number(v):d;
const txt=v=>String(v??'').trim();
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(x=>txt(x)).filter(Boolean))];
const ms=v=>{const n=num(v);return n!=null&&n>0&&n<1e12?n*1000:n};
function stableStringify(obj){
  if(obj==null||typeof obj!=='object')return JSON.stringify(obj);
  if(Array.isArray(obj))return '['+obj.map(stableStringify).join(',')+']';
  return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')+'}';
}
function fnv1a(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16).padStart(8,'0')}
function factIdFor(seed){return 'fact_'+fnv1a(stableStringify(seed))}
function paramsHashFor(ruleId){return 'book-rule-v1-'+fnv1a(ruleId+'|'+RULE_SOURCE_REF[ruleId])}
function latestSequence(adapter){return adapter?.sources?.journal?.latestSequenceId||adapter?.sources?.journal?.snapshots?.[0]?.sequenceId||null}

function buildEventFacts(adapter){
  const analysisAsOf=num(adapter?.analysisAsOf);
  if(analysisAsOf==null)throw new Error('adapter.analysisAsOf required');
  const out=[],seenFingerprints=new Set();
  const persisted=(adapter?.sources?.journal?.events||[]).map(e=>({...e,provenance:'PERSISTED_JOURNAL'}));
  const ephemeral=(adapter?.liveEvidence?.events||[]).map(e=>({...e,provenance:'LIVE_EPHEMERAL'}));
  for(const e of [...persisted,...ephemeral]){
    const factType=EVENT_FACT_MAP[String(e?.eventType||'')];
    if(!factType)continue;
    const confirmedAt=ms(e.confirmedAt??e.candleTime);
    if(confirmedAt!=null&&confirmedAt>analysisAsOf)throw new Error('evidence event after analysisAsOf');
    const eventId=txt(e.eventId);if(!eventId)continue;
    const provenance=e.provenance==='LIVE_EPHEMERAL'?'LIVE_EPHEMERAL':'PERSISTED_JOURNAL';
    if(provenance==='LIVE_EPHEMERAL'&&!eventId.startsWith('LIVE-'))throw new Error('LIVE_EPHEMERAL eventId must use LIVE- namespace');
    if(provenance==='LIVE_EPHEMERAL'&&e.closedOnly!==true)throw new Error('LIVE_EPHEMERAL evidence must be CLOSED_ONLY');
    const fingerprint=txt(e.eventFingerprint)||null;
    if(fingerprint&&seenFingerprints.has(fingerprint))continue;
    if(fingerprint)seenFingerprints.add(fingerprint);
    out.push({
      factId:factIdFor({factType,eventId,eventVersion:e.eventVersion??null,paramsHash:e.paramsHash??null,provenance}),
      factVersion:FACT_VERSION,factType,sourceKind:'EVENT',
      sourceEngine:e.sourceEngine||adapter?.engineSources?.journal?.version||'JOURNAL',
      sourceVersion:e.eventVersion??adapter?.engineSources?.journal?.version??null,
      eventId,snapshotId:e.snapshotId||null,sequenceId:e.sequenceId||null,timeframe:e.timeframe||null,
      confirmedAt,price:num(e.price),linePrice:num(e.linePrice),paramsHash:e.paramsHash||null,
      provenance,eventStatus:String(e.status||'UNKNOWN'),eventFingerprint:fingerprint,closedOnly:e.closedOnly===true||provenance==='PERSISTED_JOURNAL',
      attributes:{eventType:e.eventType,status:e.status||null,direction:e.direction||null,candleIndex:num(e.candleIndex),atrFrozen:num(e.atrFrozen)}
    });
  }
  return out;
}
function isTrustedConfirmedEventFact(f){
  return Boolean(f?.eventId&&f?.provenance==='PERSISTED_JOURNAL'&&f?.eventStatus==='CONFIRMED');
}
function persistedEventBacked(facts=[]){return facts.filter(x=>x?.eventId&&x?.provenance==='PERSISTED_JOURNAL')}
function trustedEventBacked(facts=[]){return facts.filter(isTrustedConfirmedEventFact)}
function pushSynthetic(out,adapter,{factType,sourceEngine,sourceVersion,timeframe=null,value=null,observedAt=null,attributes={}}){
  const t=ms(observedAt??adapter?.engineSources?.[sourceEngine]?.observedAt??adapter?.analysisAsOf);
  if(t!=null&&t>adapter.analysisAsOf)throw new Error('synthetic fact after analysisAsOf');
  out.push({
    factId:factIdFor({factType,sourceEngine,sourceVersion,timeframe,observedAt:t,value,attributes}),
    factVersion:FACT_VERSION,factType,sourceKind:'ENGINE',sourceEngine,
    sourceVersion:sourceVersion==null?null:String(sourceVersion),eventId:null,snapshotId:null,
    sequenceId:latestSequence(adapter),timeframe,confirmedAt:t,price:null,linePrice:null,paramsHash:null,
    value:value==null?null:value,attributes:clone(attributes)
  });
}
function buildScannerFacts(adapter){
  const out=[],scanner=adapter?.sources?.scanner;if(!scanner)return out;
  const v3=scanner.v3||scanner,version=adapter?.engineSources?.scanner?.version||scanner.version||'scanner';
  const observedAt=adapter?.engineSources?.scanner?.observedAt??adapter.analysisAsOf,filter=v3?.longTerm?.filter;
  if(filter){
    if(filter.tier==='PASS')pushSynthetic(out,adapter,{factType:'HTF_LONG_PASS',sourceEngine:'scanner',sourceVersion:version,observedAt,value:num(filter.alignmentPct),attributes:{tier:filter.tier,alignmentPct:num(filter.alignmentPct),coreUp:num(filter?.core?.up)}});
    if(num(filter?.core?.up,0)>=2)pushSynthetic(out,adapter,{factType:'HTF_CORE_UP',sourceEngine:'scanner',sourceVersion:version,observedAt,value:num(filter.core.up),attributes:{requiredUp:num(filter?.core?.requiredUp)}});
    if(num(filter?.alignmentPct,0)>=66.7)pushSynthetic(out,adapter,{factType:'HTF_ALIGNMENT_STRONG',sourceEngine:'scanner',sourceVersion:version,observedAt,value:num(filter.alignmentPct),attributes:{validFrames:num(filter.validFrames)}});
  }
  const r1=v3?.rvol?.main1h,r15=v3?.rvol?.ignition15m;
  if(['PRE-SPARK','IGNITION','EXPANSION'].includes(r1?.state))pushSynthetic(out,adapter,{factType:'RVOL_1H_ACTIVE',sourceEngine:'scanner',sourceVersion:version,timeframe:'1h',observedAt,value:num(r1.value),attributes:{state:r1.state}});
  if(['IGNITION','EXPANSION'].includes(r15?.state))pushSynthetic(out,adapter,{factType:'RVOL_15M_IGNITION',sourceEngine:'scanner',sourceVersion:version,timeframe:'15m',observedAt,value:num(r15.value),attributes:{state:r15.state}});
  const oi=v3?.oiPath,taker=v3?.taker;
  if(oi?.mainBuild===true||oi?.state==='BUILD'||oi?.state==='CLEAN→REBUILD')pushSynthetic(out,adapter,{factType:'OI_BUILD',sourceEngine:'scanner',sourceVersion:version,observedAt,value:num(oi?.main4hPct),attributes:{state:oi?.state||null,pattern:oi?.pattern||null}});
  if(['IMPROVE','STRONG'].includes(taker?.state))pushSynthetic(out,adapter,{factType:'TAKER_CONFIRM',sourceEngine:'scanner',sourceVersion:version,observedAt,value:num(taker?.latest),attributes:{state:taker?.state||null,improveCount3:num(taker?.improveCount3)}});
  for(const tf of Object.keys(v3?.movingAverage||{}).sort()){
    const row=v3.movingAverage[tf];
    if(row?.compressed===true)pushSynthetic(out,adapter,{factType:'MA_COMPRESSION',sourceEngine:'scanner',sourceVersion:version,timeframe:tf,observedAt,value:num(row.compressionRatio),attributes:{compressed:true,ribbonWidthAtr:num(row.ribbonWidthAtr)}});
    if(row?.alignmentTransition===true)pushSynthetic(out,adapter,{factType:'MA_ALIGNMENT_TRANSITION',sourceEngine:'scanner',sourceVersion:version,timeframe:tf,observedAt,value:1,attributes:{bullishAligned:row?.bullishAligned===true}});
  }
  return out;
}
function buildExplicitStructureFacts(adapter){
  const out=[];
  for(const [name,data] of [['structure',adapter?.sources?.structure],['forexBook',adapter?.sources?.forexBook]]){
    if(!data)continue;
    const version=adapter?.engineSources?.[name]?.version||data.version||name,observedAt=adapter?.engineSources?.[name]?.observedAt??adapter.analysisAsOf;
    if(data.volumeContraction===true||data.volumeContracted===true||data?.volume?.contracted===true)pushSynthetic(out,adapter,{factType:'VOLUME_CONTRACTION',sourceEngine:name,sourceVersion:version,observedAt,value:num(data?.volume?.ratio),attributes:{explicit:true}});
    if(data.breakout===true||data.bosUp===true||data?.structure?.breakout===true)pushSynthetic(out,adapter,{factType:'STRUCTURE_BREAK_EXPLICIT',sourceEngine:name,sourceVersion:version,observedAt,value:1,attributes:{explicit:true}});
  }
  return out;
}
function dedupeFacts(facts=[]){
  const map=new Map();for(const raw of facts){if(raw?.factId&&!map.has(raw.factId))map.set(raw.factId,clone(raw))}
  return [...map.values()].sort((a,b)=>String(a.factId).localeCompare(String(b.factId)));
}
function buildEvidenceFacts(adapter){
  const facts=dedupeFacts([...buildEventFacts(adapter),...buildScannerFacts(adapter),...buildExplicitStructureFacts(adapter)]);
  Contract.assertEvidenceWithinAnalysisAsOf({analysisAsOf:adapter.analysisAsOf,events:facts.filter(x=>x.sourceKind==='EVENT').map(x=>({confirmedAt:x.confirmedAt}))});
  return facts;
}
function byType(facts){const m=new Map();for(const f of facts){if(!m.has(f.factType))m.set(f.factType,[]);m.get(f.factType).push(f)}return m}
function eventBacked(facts=[]){return facts.filter(x=>x?.eventId)}
function makeRule(ruleId,status,facts,adapter){
  const dedup=dedupeFacts(facts),allEvents=eventBacked(dedup),trusted=trustedEventBacked(dedup),ephemeral=allEvents.filter(x=>x.provenance==='LIVE_EPHEMERAL');
  const eventIds=uniq(allEvents.map(x=>x.eventId)),trustedEvidenceEventIds=uniq(trusted.map(x=>x.eventId)),ephemeralEvidenceEventIds=uniq(ephemeral.map(x=>x.eventId)),snapshotIds=uniq(allEvents.map(x=>x.snapshotId)),sequenceIds=uniq(allEvents.map(x=>x.sequenceId));
  if(status==='CONFIRMED'&&!trustedEvidenceEventIds.length)throw new Error('CONFIRMED rule requires trusted persisted evidence: '+ruleId);
  return{
    ruleId,ruleVersion:RULE_VERSION,status,paramsHash:paramsHashFor(ruleId),sourceBookId:SOURCE_BOOK_ID,sourceReference:RULE_SOURCE_REF[ruleId],
    sequenceId:sequenceIds[0]||latestSequence(adapter),evidenceFactIds:dedup.map(x=>x.factId),evidenceEventIds:eventIds,trustedEvidenceEventIds,ephemeralEvidenceEventIds,evidenceSnapshotIds:snapshotIds,
    evidenceConfirmedAt:dedup.map(x=>x.confirmedAt).filter(Number.isFinite).sort((a,b)=>b-a)[0]??null
  };
}
function evaluateRules(adapter,facts){
  const m=byType(facts),get=t=>m.get(t)||[],trusted=t=>trustedEventBacked(get(t));
  const breakFacts=[...get('TRENDLINE_BREAK'),...get('STRUCTURE_BREAK_EXPLICIT')],touch=get('RETEST_TOUCH'),confirm=get('RETEST_CONFIRMED'),reclaim=get('RECLAIM'),sweep=get('LIQUIDITY_SWEEP'),contraction=get('VOLUME_CONTRACTION'),ignition=get('RVOL_15M_IGNITION'),maCompression=get('MA_COMPRESSION'),maTransition=get('MA_ALIGNMENT_TRANSITION');
  const trustedBreak=trusted('TRENDLINE_BREAK'),trustedConfirm=trusted('RETEST_CONFIRMED'),trustedReclaim=trusted('RECLAIM'),trustedSweep=trusted('LIQUIDITY_SWEEP'),persistedTouch=persistedEventBacked(touch);
  const rows=[];
  rows.push(makeRule('BREAKOUT_RETEST',trustedBreak.length&&trustedConfirm.length?'CONFIRMED':breakFacts.length||confirm.length?'CANDIDATE':'NOT_CONFIRMED',[...breakFacts,...touch,...confirm],adapter));
  const flipEvidence=[...breakFacts,...reclaim,...confirm];
  rows.push(makeRule('SUPPORT_RESISTANCE_FLIP',trustedBreak.length&&(trustedReclaim.length||trustedConfirm.length)?'CONFIRMED':flipEvidence.length?'CANDIDATE':'NOT_CONFIRMED',flipEvidence,adapter));
  rows.push(makeRule('TRENDLINE_REACTION',persistedTouch.length&&trustedConfirm.length?'CONFIRMED':touch.length||confirm.length?'CANDIDATE':'NOT_CONFIRMED',[...touch,...confirm],adapter));
  rows.push(makeRule('LIQUIDITY_SWEEP_RECLAIM',trustedSweep.length&&trustedReclaim.length?'CONFIRMED':sweep.length||reclaim.length?'CANDIDATE':'NOT_CONFIRMED',[...sweep,...reclaim],adapter));
  const volEvidence=[...contraction,...breakFacts,...ignition];
  rows.push(makeRule('VOLUME_CONTRACTION_BREAK',contraction.length&&ignition.length&&trustedBreak.length?'CONFIRMED':volEvidence.length?'CANDIDATE':'NOT_CONFIRMED',volEvidence,adapter));
  rows.push(makeRule('MOVING_AVERAGE_COMPRESSION',maCompression.length?'CANDIDATE':'NOT_CONFIRMED',[...maCompression,...maTransition],adapter));
  return rows.sort((a,b)=>a.ruleId.localeCompare(b.ruleId));
}
function assertRuleEvidenceIntegrity({rules=[],facts=[],analysisAsOf}={}){
  const factMap=new Map(facts.map(x=>[x.factId,x])),eventMap=new Map(facts.filter(x=>x.eventId).map(x=>[x.eventId,x]));
  for(const r of rules){
    const ids=uniq(r.evidenceFactIds);
    if(ids.length!==(r.evidenceFactIds||[]).length)throw new Error('duplicate evidenceFactIds in rule '+r.ruleId);
    for(const id of ids)if(!factMap.has(id))throw new Error('unknown evidenceFactId '+id+' in '+r.ruleId);
    for(const id of r.evidenceEventIds||[])if(!eventMap.has(id))throw new Error('unknown eventId '+id+' in '+r.ruleId);
    for(const id of r.trustedEvidenceEventIds||[]){
      const f=eventMap.get(id);
      if(!f)throw new Error('unknown trusted eventId '+id+' in '+r.ruleId);
      if(!isTrustedConfirmedEventFact(f))throw new Error('trusted event is not persisted confirmed: '+id);
    }
    for(const id of r.ephemeralEvidenceEventIds||[]){
      const f=eventMap.get(id);
      if(!f)throw new Error('unknown ephemeral eventId '+id+' in '+r.ruleId);
      if(f.provenance!=='LIVE_EPHEMERAL')throw new Error('ephemeral event provenance mismatch: '+id);
    }
    if(r.status==='CONFIRMED'){
      if(!r.trustedEvidenceEventIds?.length)throw new Error('CONFIRMED rule missing trustedEvidenceEventIds: '+r.ruleId);
      if(!r.sequenceId)throw new Error('CONFIRMED rule missing sequenceId: '+r.ruleId);
    }
    for(const id of ids){const f=factMap.get(id);if(f?.confirmedAt!=null&&f.confirmedAt>analysisAsOf)throw new Error('rule evidence after analysisAsOf')}
  }
  return true;
}
function scoreComponents(facts=[]){
  const m=byType(facts),used={},pick=t=>(m.get(t)||[]).map(x=>x.factId);
  const add=(key,points,types)=>{const ids=uniq(types.flatMap(pick));if(!ids.length)return 0;used[key]=uniq([...(used[key]||[]),...ids]);return points};
  let bookStructure=0;bookStructure+=add('bookStructure',8,['TRENDLINE_BREAK','STRUCTURE_BREAK_EXPLICIT']);bookStructure+=add('bookStructure',5,['RETEST_TOUCH']);bookStructure+=add('bookStructure',7,['RETEST_CONFIRMED']);bookStructure+=add('bookStructure',5,['RECLAIM']);bookStructure=Math.min(25,bookStructure);
  let htfAlignment=0;htfAlignment+=add('htfAlignment',14,['HTF_LONG_PASS']);htfAlignment+=add('htfAlignment',4,['HTF_CORE_UP']);htfAlignment+=add('htfAlignment',2,['HTF_ALIGNMENT_STRONG']);htfAlignment=Math.min(20,htfAlignment);
  let liquiditySmc=0;liquiditySmc+=add('liquiditySmc',7,['LIQUIDITY_SWEEP']);liquiditySmc+=add('liquiditySmc',7,['RECLAIM']);liquiditySmc+=add('liquiditySmc',3,['MSS']);liquiditySmc+=add('liquiditySmc',3,['DISPLACEMENT']);liquiditySmc=Math.min(20,liquiditySmc);
  let volumeRvol=0;volumeRvol+=add('volumeRvol',4,['RVOL_1H_ACTIVE']);volumeRvol+=add('volumeRvol',8,['RVOL_15M_IGNITION']);volumeRvol=Math.min(12,volumeRvol);
  let derivatives=0;derivatives+=add('derivatives',5,['OI_BUILD']);derivatives+=add('derivatives',5,['TAKER_CONFIRM']);derivatives=Math.min(10,derivatives);
  let retestReclaim=0;retestReclaim+=add('retestReclaim',2,['RETEST_TOUCH']);retestReclaim+=add('retestReclaim',3,['RETEST_CONFIRMED']);retestReclaim+=add('retestReclaim',3,['RECLAIM']);retestReclaim=Math.min(8,retestReclaim);
  return{bookEvidence:Contract.computeEvidenceScore({bookStructure,htfAlignment,liquiditySmc,volumeRvol,derivatives,retestReclaim}),componentUsage:Object.fromEntries(Object.entries(used).map(([k,v])=>[k,uniq(v).sort()]))};
}
function buildEvidenceAudit({facts=[],rules=[],componentUsage={}}={}){
  const factMap=new Map(facts.map(x=>[x.factId,x])),usage={};let totalRuleFactReferences=0,totalComponentFactReferences=0;
  for(const r of rules)for(const fid of uniq(r.evidenceFactIds)){const f=factMap.get(fid);if(!f)continue;totalRuleFactReferences++;if(!f.eventId)continue;usage[f.eventId]=usage[f.eventId]||{rules:[],components:[],factIds:[]};usage[f.eventId].rules.push(r.ruleId);usage[f.eventId].factIds.push(fid)}
  for(const [component,ids] of Object.entries(componentUsage))for(const fid of uniq(ids)){const f=factMap.get(fid);if(!f)continue;totalComponentFactReferences++;if(!f.eventId)continue;usage[f.eventId]=usage[f.eventId]||{rules:[],components:[],factIds:[]};usage[f.eventId].components.push(component);usage[f.eventId].factIds.push(fid)}
  for(const x of Object.values(usage)){x.rules=uniq(x.rules).sort();x.components=uniq(x.components).sort();x.factIds=uniq(x.factIds).sort()}
  const persistedFacts=facts.filter(x=>x.provenance==='PERSISTED_JOURNAL'),ephemeralFacts=facts.filter(x=>x.provenance==='LIVE_EPHEMERAL');
  const uniqueEventIds=uniq(facts.map(x=>x.eventId)).sort(),sharedEventIds=Object.entries(usage).filter(([,x])=>x.rules.length>1||x.components.length>1).map(([id])=>id).sort(),totalEventRuleReferences=Object.values(usage).reduce((s,x)=>s+x.rules.length,0);
  const sharedEvidenceRatio=totalEventRuleReferences?Number(Math.max(0,(totalEventRuleReferences-uniqueEventIds.length)/totalEventRuleReferences).toFixed(4)):0;
  return{uniqueFactCount:facts.length,uniqueEventCount:uniqueEventIds.length,uniqueEventIds,persistedFactCount:persistedFacts.length,ephemeralFactCount:ephemeralFacts.length,persistedEventCount:uniq(persistedFacts.map(x=>x.eventId)).length,ephemeralEventCount:uniq(ephemeralFacts.map(x=>x.eventId)).length,trustedConfirmedEventCount:uniq(persistedFacts.filter(isTrustedConfirmedEventFact).map(x=>x.eventId)).length,totalRuleFactReferences,totalComponentFactReferences,totalEventRuleReferences,sharedEventIds,sharedEvidenceRatio,usage};
}
function evaluate(adapter){
  if(!adapter||adapter.adapterVersion==null)throw new Error('Book AI adapter result required');
  const facts=buildEvidenceFacts(adapter),rules=evaluateRules(adapter,facts);
  assertRuleEvidenceIntegrity({rules,facts,analysisAsOf:adapter.analysisAsOf});
  for(const r of rules)Contract.normalizeBookSetup(r,adapter.analysisAsOf);
  const scored=scoreComponents(facts),evidenceAudit=buildEvidenceAudit({facts,rules,componentUsage:scored.componentUsage});
  return Contract.deepFreeze({version:VERSION,factVersion:FACT_VERSION,ruleVersion:RULE_VERSION,analysisAsOf:adapter.analysisAsOf,symbol:adapter.symbol,evidenceFacts:facts,bookSetups:rules,bookEvidence:scored.bookEvidence,componentUsage:scored.componentUsage,evidenceAudit});
}
return{VERSION,FACT_VERSION,RULE_VERSION,SOURCE_BOOK_ID,SOURCE_ENGINE,RULE_IDS,EVENT_FACT_MAP,RULE_SOURCE_REF,stableStringify,fnv1a,factIdFor,paramsHashFor,buildEventFacts,isTrustedConfirmedEventFact,eventBacked,persistedEventBacked,trustedEventBacked,buildScannerFacts,buildExplicitStructureFacts,dedupeFacts,buildEvidenceFacts,evaluateRules,assertRuleEvidenceIntegrity,scoreComponents,buildEvidenceAudit,evaluate};
});
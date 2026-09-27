'use strict';
const crypto=require('crypto');

const VERSION='RESEARCH_INTEGRITY_v1';
const CONTRACT=Object.freeze({
  contractVersion:'RC-2026.09-v1',
  candidateRuleVersion:'IGNITION_COHORT_v1',
  featureSchemaVersion:'RESEARCH_FEATURES_v2',
  labelVersion:'OUTCOME_CONTRACT_v3',
  entryPolicy:'NEXT_CONFIRMED_OPEN',
  horizonsHours:[24,72],
  primaryHorizonHours:72,
  tpR:2,
  slR:-1,
  riskPctFallback:3,
  costModelVersion:'COST_v1',
  slippageModelVersion:'SLIPPAGE_v1',
  fundingModelVersion:'FUNDING_v1',
  roundTripCostPct:Number.isFinite(Number(process.env.RESEARCH_ROUNDTRIP_COST_PCT))?Number(process.env.RESEARCH_ROUNDTRIP_COST_PCT):null,
  missingDataPolicy:'AMBIGUOUS_NOT_FORCED',
  duplicateWindowMinutes:60,
  purgeHours:72,
  embargoHours:24,
  minAblationSample:30,
  preferredAblationSample:50,
  experimentBudgetPerFamily:12,
  maxMutationsPerGeneration:4
});
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}
function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function bucket(ts,minutes=CONTRACT.duplicateWindowMinutes){return Math.floor(n(ts,0)/(minutes*60000))}
function eventFamilyKey(item={},asOf=Date.now()){
  const setup=String(item.setup?.type||item.sampleArchetype||item.v2Type||item.scanClass?.key||'UNKNOWN');
  const tf=String(item.primaryTf||item.timeframe||'multi');
  return [String(item.symbol||'').toUpperCase(),setup,tf,bucket(asOf)].join(':');
}
function datasetSnapshotId(rows=[],contract=CONTRACT){
  return 'DS-'+hash({contractVersion:contract.contractVersion,keys:rows.map(x=>x.key||x.eventId||x.sampleId).filter(Boolean).sort()}).slice(0,16).toUpperCase();
}
function featureSnapshotHash(snapshot){return hash(snapshot||{});}
function integrityMeta({item={},canonical=null,asOf=Date.now(),source='scanner',sourceScanId=null,codeCommitHash=null,experimentCountBeforeThis=0}={}){
  const eventId=eventFamilyKey(item,asOf);
  return{
    version:VERSION,
    contract:{...CONTRACT},
    eventId,
    eventFamilyKey:eventId,
    featureCutoffTime:asOf,
    labelAvailableAfter:asOf+CONTRACT.primaryHorizonHours*3600000,
    dataSource:[source],
    sourceScanId:sourceScanId||null,
    featureSchemaVersion:CONTRACT.featureSchemaVersion,
    labelVersion:CONTRACT.labelVersion,
    costModelVersion:CONTRACT.costModelVersion,
    slippageModelVersion:CONTRACT.slippageModelVersion,
    fundingModelVersion:CONTRACT.fundingModelVersion,
    featureSnapshotHash:featureSnapshotHash(canonical),
    codeCommitHash:codeCommitHash||process.env.RENDER_GIT_COMMIT||process.env.COMMIT_REF||null,
    experimentCountBeforeThis:Number(experimentCountBeforeThis)||0
  };
}
function isOos(row,lockedOosStart){const t=n(row?.asOf??row?.capturedAt);return t!=null&&n(lockedOosStart)!=null&&t>=Number(lockedOosStart)}
function labelEnd(row,hours=CONTRACT.primaryHorizonHours){const t=n(row?.asOf??row?.capturedAt);return t==null?null:t+hours*3600000}
function cohortHealth(rows=[]){
  const all=Array.isArray(rows)?rows:[],events=new Map(),symbols=new Map(),missing=all.filter(x=>!x.canonicalSnapshot||x.dataState==='DATA_GAP'||x.canonicalSnapshot?.rawRef?.dataState==='DATA_GAP').length;
  for(const r of all){const e=r.integrity?.eventFamilyKey||r.key;if(e)events.set(e,(events.get(e)||0)+1);const s=r.symbol||'UNKNOWN';symbols.set(s,(symbols.get(s)||0)+1)}
  const duplicates=[...events.values()].reduce((s,n)=>s+Math.max(0,n-1),0),maxSymbol=Math.max(0,...symbols.values());
  const labeled=all.filter(x=>x.label===0||x.label===1),neg=labeled.filter(x=>x.label===0).length;
  const valid=Math.max(0,all.length-duplicates-missing);
  return{
    sampleCount:all.length,validSampleCount:valid,duplicateCount:duplicates,missingCount:missing,
    missingRate:all.length?missing/all.length:0,maxSymbolConcentration:all.length?maxSymbol/all.length:0,
    negativeRate:labeled.length?neg/labeled.length:null,
    status:valid<CONTRACT.minAblationSample?'SAMPLE_INSUFFICIENT':(all.length&&missing/all.length>.08?'BLOCKED_DATA_QUALITY':'READY')
  };
}
module.exports={VERSION,CONTRACT,hash,eventFamilyKey,datasetSnapshotId,featureSnapshotHash,integrityMeta,isOos,labelEnd,cohortHealth};

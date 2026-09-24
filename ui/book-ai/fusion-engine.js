(function(root,factory){
  const Contract=typeof module==='object'&&module.exports?require('./contract.js'):root?.PulseBookAiContract;
  const Setup=typeof module==='object'&&module.exports?require('./setup-state.js'):root?.PulseBookAiSetupState;
  const api=factory(Contract,Setup);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiFusionEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Contract,Setup){'use strict';

if(!Contract||!Setup)throw new Error('Book AI contract/setup-state required');
const VERSION='BOOK_AI_FUSION_v1';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

function htfAlignment(adapter={}){
  const f=adapter?.sources?.scanner?.v3?.longTerm?.filter||adapter?.sources?.scanner?.longTerm?.filter;
  if(!f)return'UNKNOWN';
  if(f.tier==='PASS')return'ALIGNED';
  if(f.tier==='MIXED')return'MIXED';
  if(f.tier==='SOFT_FAIL')return'PARTIAL';
  return'UNKNOWN';
}
function currentJournal(adapter={},sequenceId=null){
  const db=adapter?.sources?.journal||{};
  const snapshots=(db.snapshots||[]).filter(x=>!sequenceId||!x.sequenceId||x.sequenceId===sequenceId);
  const outcomes=(db.outcomes||[]).filter(x=>!sequenceId||!x.sequenceId||x.sequenceId===sequenceId);
  return{
    sequenceId,
    snapshotId:snapshots[0]?.id||null,
    outcomes:clone(outcomes),
    gateState:adapter?.sources?.gate?.state||adapter?.sources?.gate?.round?.decision?.state||null
  };
}
function sampleDnaShadow(){
  return{mode:'SHADOW_ONLY',similarityVersion:null,nearestSamples:[],similarityScore:null,scoreContribution:0,rankingContribution:0,status:'NOT_EVALUATED'};
}
function fuse({adapter,ruleResult,previousLifecycle=null}={}){
  if(!adapter?.adapterVersion)throw new Error('adapter required');
  if(!ruleResult?.version)throw new Error('ruleResult required');
  if(adapter.analysisAsOf!==ruleResult.analysisAsOf)throw new Error('analysisAsOf mismatch');
  if(adapter.symbol!==ruleResult.symbol)throw new Error('symbol mismatch');

  const lifecycle=Setup.resolveSetupState({adapter,ruleResult,previous:previousLifecycle});
  const inherited=adapter.inherited||{};
  const stage=inherited.stage?clone(inherited.stage):null;
  const bias=inherited.bias?clone(inherited.bias):null;

  if(stage&&bias)Contract.assertInheritedFactsUnchanged({stage:inherited.stage,bias:inherited.bias},{stage,bias});
  Contract.assertPresurgeReadOnly(inherited.presurge,adapter?.sources?.presurge??null);

  return Contract.deepFreeze({
    version:VERSION,
    analysisAsOf:adapter.analysisAsOf,
    symbol:adapter.symbol,
    exchange:adapter.exchange,
    marketType:adapter.marketType,
    resultReady:Boolean(stage&&bias),
    incompleteReasons:[
      ...(stage?[]:['MISSING_SCANNER_STAGE']),
      ...(bias?[]:['MISSING_INHERITED_BIAS'])
    ],
    bias,
    stage,
    setupState:lifecycle.currentState,
    setupLifecycle:lifecycle,
    htfAlignment:htfAlignment(adapter),
    bookSetups:clone(ruleResult.bookSetups||[]),
    evidenceFacts:clone(ruleResult.evidenceFacts||[]),
    evidenceAudit:clone(ruleResult.evidenceAudit||{}),
    bookEvidence:clone(ruleResult.bookEvidence),
    sampleDna:sampleDnaShadow(),
    presurge:clone(inherited.presurge),
    engineSources:clone(adapter.engineSources||{}),
    coverage:clone(adapter.coverage||{}),
    journal:currentJournal(adapter,lifecycle.sequenceId),
    rankingContribution:0
  });
}
return{VERSION,htfAlignment,currentJournal,sampleDnaShadow,fuse};
});
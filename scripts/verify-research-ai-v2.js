'use strict';

const assert=require('assert');
const Outcome=require('../lib/learning/outcome-engine.js');
const Canonical=require('../lib/learning/canonical-snapshot.js');
const Similarity=require('../lib/learning/similarity.js');
const Split=require('../lib/learning/dataset-split.js');
const Neural=require('../lib/learning/neural.js');
const Registry=require('../lib/learning/model-registry.js');
const Evidence=require('../lib/learning/evidence.js');
const V2=require('../lib/learning/research-ai-v2.js');
const Adapter=require('../lib/learning/scanner-adapter.js');
const ResearchStats=require('../lib/learning/research-stats.js');
const ArchetypeLab=require('../lib/learning/archetype-lab.js');
const ResearchLab=require('../lib/learning/research-lab.js');
const AutoSample=require('../lib/learning/auto-sample-engine.js');
const Integrity=require('../lib/learning/research-integrity.js');
const Regime=require('../lib/learning/regime-detector.js');
const Sealed=require('../lib/learning/sealed-oos-evaluator.js');

function candle(openTime,open,high,low,close){
  return [openTime,String(open),String(high),String(low),String(close),'100',openTime+3599999,'0',0,'0','0','0'];
}

// Exact confirmed-candle outcomes: no future price substitution.
const t0=1_790_000_000_000;
const rows=[];
for(let i=0;i<80;i++){
  const base=100+i*.05;
  rows.push(candle(t0+i*3600000,base,base+1,base-1,base+.2));
}
let out=Outcome.resolveObservation({price:100,asOf:t0-1},rows,{now:t0+80*3600000});
assert.equal(out.horizons.h1.status,'CONFIRMED');
assert.equal(out.horizons.h72.status,'CONFIRMED');
assert(out.horizons.h6.closeAt<=t0+6*3600000+65*60*1000,'6H must use an on-time confirmed candle');

// Missing target candle must stay pending/gap rather than use a much later price.
const sparse=[candle(t0,100,101,99,100.5),candle(t0+20*3600000,110,111,109,110.5)];
out=Outcome.resolveObservation({price:100,asOf:t0-1},sparse,{now:t0+30*3600000});
assert.equal(out.horizons.h6.status,'PENDING_OR_GAP');
assert.equal(out.horizons.h6.returnPct,null);

// Same candle touches TP and SL -> ambiguous and no label.
const ambiguous=[candle(t0,100,106,96,101)];
out=Outcome.resolveObservation({price:100,asOf:t0-1},ambiguous,{now:t0+2*3600000,tpPct:5,slPct:-3});
assert.equal(out.barriers.status,'AMBIGUOUS_SAME_CANDLE');
assert.equal(out.label,null);
assert.equal(out.labelStatus,'AMBIGUOUS');

// Null preservation in canonical snapshots and evidence features.
const snap=Canonical.canonicalize({symbol:'TESTUSDT',lastPrice:1,priceChange24h:null,stats:{'1h':{rsi:null}}},{source:'test'});
assert.equal(snap.market.change24hPct,null);
assert.equal(snap.timeframes['1h'].rsi,null);
const features=Evidence.normalizeItem({symbol:'TESTUSDT',lastPrice:1});
assert(features.some(x=>x===null),'missing features must remain null in stored vector');
assert(Evidence.modelVector(features).every(Number.isFinite),'model input may neutral-impute only at model boundary');

// Similarity requires real overlap instead of treating all missing values as zero evidence.
const sim0=Similarity.compareVectors([null,null,1],[null,null,1],{minOverlap:2});
assert.equal(sim0.status,'INSUFFICIENT_OVERLAP');
assert.equal(sim0.score,null);
const sim1=Similarity.compareVectors([1,.5,0],[1,.4,0],{minOverlap:2});
assert.equal(sim1.status,'OK');
assert(sim1.score>90);

// Time-ordered split and leakage guard.
const ds=Array.from({length:10},(_,i)=>({asOf:1000+i,label:i%2,features:Array(18).fill(0)}));
const split=Split.chronological(ds,{trainRatio:.6,validationRatio:.2});
assert.equal(split.train.length,6);
assert.equal(split.validation.length,2);
assert.equal(split.lockedOos.length,2);
assert.equal(Split.assertNoLeakage(split).ok,true);
const dense=Array.from({length:40},(_,i)=>({asOf:t0+i*24*3600000,label:i%2,features:Array(18).fill(0)}));
const purged=Split.purgedChronological(dense,{trainRatio:.6,validationRatio:.2,purgeHours:72,embargoHours:24});
assert.equal(purged.leakage.ok,true);
assert(purged.purge.purged>=0&&purged.purge.embargoed>=0);

const nextOpenRows=[candle(t0,100,101,99,100.2),candle(t0+3600000,103,104,102,103.5),candle(t0+2*3600000,104,105,103,104.5)];
const nextOpenObs={price:100,signalClose:100,asOf:t0+1000,entryPolicy:'NEXT_CONFIRMED_OPEN',integrity:{contract:{entryPolicy:'NEXT_CONFIRMED_OPEN',costModelVersion:'COST_v1',roundTripCostPct:null}}};
const nextOpenOut=Outcome.resolveObservation(nextOpenObs,nextOpenRows,{now:t0+4*3600000});
assert.equal(nextOpenOut.entryPrice,103);
assert.equal(nextOpenOut.entryPolicy,'NEXT_CONFIRMED_OPEN');
assert.equal(nextOpenOut.costModel.configured,false);

const integrityMeta=Integrity.integrityMeta({item:{symbol:'TESTUSDT',setup:{type:'WATCH'}},canonical:snap,asOf:t0,source:'test'});
assert.equal(integrityMeta.contract.labelVersion,'OUTCOME_CONTRACT_v3');
assert(integrityMeta.featureSnapshotHash.length===64);
const unknownRegime=Regime.detect({});
assert.equal(unknownRegime.regime,'UNKNOWN');
const riskOn=Regime.detect({marketContext:{btc:{change24hPct:2},alts:{median24hPct:3}},altBreadthUpRatio:.7});
assert.equal(riskOn.regime,'RISK_ON');

const sealedBlocked=Sealed.compare({rows:[],champion:{ruleIds:[]},challenger:{ruleIds:[]},lockedOosStart:null});
assert.equal(sealedBlocked.promotionEligible,false);


// Locked OOS boundary is immutable once frozen in Research AI v2.
const state=V2.initialState();
V2.freezeLockedOos(state,5000);
assert.throws(()=>V2.freezeLockedOos(state,6000),/already frozen/);

// Neural model extraction works and remains deterministic enough for repeatable tests.
const model=Neural.createModel(18);
const before=Neural.forward(model,Array(18).fill(0)).p;
Neural.train(model,[{features:Array(18).fill(.2),label:1},{features:Array(18).fill(-.2),label:0}],{epochs:2});
const after=Neural.forward(model,Array(18).fill(0)).p;
assert(Number.isFinite(before)&&Number.isFinite(after));

// Registry cannot jump directly from SHADOW to PROMOTED and gate failures block promotion.
let entry=Registry.createEntry({id:'m1',type:'mlp'});
assert.equal(Registry.promote(entry,'PROMOTED',{metrics:{labels:100},gate:{minLabels:20}}).ok,false);
let step=Registry.promote(entry,'CANDIDATE',{metrics:{labels:10},gate:{minLabels:20}});
assert.equal(step.ok,false);
step=Registry.promote(entry,'CANDIDATE',{metrics:{labels:25},gate:{minLabels:20}});
assert.equal(step.ok,true);
entry=step.entry;
assert.equal(entry.state,'CANDIDATE');

// Cross-scanner dedupe: same symbol/hour must only add once.
const item={symbol:'ABCUSDT',lastPrice:1,updatedAt:t0,dataState:'live',candidateScore:50,priceChange24h:1};
let obs=V2.observeBatch(state,[item],{source:'auto-scan'});
assert.equal(obs.added,1);
obs=V2.observeBatch(state,[{...item,source:'trader'}],{source:'trader-scan'});
assert.equal(obs.added,0);

// Exact outcome resolution is the only path to a new v2 ground-truth label.
const target=state.observations.find(x=>x.symbol==='ABCUSDT');
assert.equal(target.label,null);
const outcomeRows=[
  candle(t0,1,1.06,.995,1.04),
  candle(t0+3600000,1.04,1.12,1.02,1.11),
  ...Array.from({length:74},(_,i)=>candle(t0+(i+2)*3600000,1.11,1.12,1.08,1.11))
];
const resolved=V2.resolveSymbol(state,'ABCUSDT',outcomeRows,{now:t0+80*3600000});
assert(resolved.changed>=1);
assert.equal(state.observations.find(x=>x.symbol==='ABCUSDT').label,1);

// Astra/Manus/Grok/etc. deep rows use the same common adapter without changing scanner verdicts.
const astra=Adapter.normalizeScannerItem({
  symbol:'ASTRAUSDT',method:'astra',lastPrice:2,priceChange24h:1.5,quoteVolume24h:20_000_000,
  oi4hPct:2.4,taker15m:1.35,fundingRatePct:.01,
  tf:{'1h':{available:true,bars:100,closeTime:t0,close:2,rsi14:57,rvol:1.8,stack:true,above20:true,above60:true},
      '15m':{available:true,bars:100,closeTime:t0,close:2,rsi14:61,rvol:2.2,stack:true,above20:true,above60:true}},
  commonPreignition:{version:'COMMON_PREIGNITION_STAGE_v1',shadowOnly:true,stage:'COOLDOWN_COMPRESSION',progressPct:60,evidenceScore:74,subtypes:['A · OI_BUILD','B · FLOW_LEAD','COMP · MA/MACD_COMPRESSION'],evidence:['volume lead'],counterEvidence:[],baseStable:true,compression:{compressed:true,oneHour:{ribbonRatio:.72}},volume:{hadSpike:true,cooled:true,currentRvol:1.1},taker:{improving:true,last:1.35},oi:{build:true,oi4hPct:2.4}},
  verdict:{key:'WATCH_PRIORITY',label:'watch',score:68}
},{source:'astra-astra',marketState:{regime:'RISK_ON'},asOf:t0});
assert.equal(astra.regime,'RISK_ON');
assert.equal(astra.flow.oi4hPct,2.4);
assert.equal(astra.flow.takerRatio,1.35);
assert.equal(astra.stats['1h'].rvol,1.8);
assert.equal(astra.setup.type,'WATCH_PRIORITY');
assert.equal(astra.researchContext.commonPreignition.stage,'COOLDOWN_COMPRESSION');
assert.deepEqual(astra.researchContext.commonPreignition.subtypeCodes,['A','B','COMP']);
assert(astra.patternTags.includes('COMP'));

// Research statistics must keep derived rules research-only.
const labeledRows=[
  {key:'a',symbol:'A',asOf:1,label:1,features:Array(18).fill(.2),regime:'RISK_ON',setupType:'SWEEP_RECLAIM',source:'astra',bookRuleIds:['MARKET_STRUCTURE','VOLUME_PRICE'],preIgnitionStage:'RECLAIM',preIgnitionSubtypes:['A','COMP'],preIgnitionEvidenceScore:78,preIgnitionProgressPct:80,outcomeV2:{mfePct:9,maePct:-1}},
  {key:'b',symbol:'B',asOf:2,label:1,features:Array(18).fill(.22),regime:'RISK_ON',setupType:'SWEEP_RECLAIM',source:'trader',bookRuleIds:['MARKET_STRUCTURE','VOLUME_PRICE'],preIgnitionStage:'RECLAIM',preIgnitionSubtypes:['B','COMP'],preIgnitionEvidenceScore:82,preIgnitionProgressPct:80,outcomeV2:{mfePct:8,maePct:-1.2}},
  {key:'c',symbol:'C',asOf:3,label:0,features:Array(18).fill(-.3),regime:'RISK_OFF',setupType:'COMPRESSION',source:'auto',bookRuleIds:['RSI'],preIgnitionStage:'COOLDOWN_COMPRESSION',preIgnitionSubtypes:['COMP'],preIgnitionEvidenceScore:54,preIgnitionProgressPct:60,outcomeV2:{mfePct:1,maePct:-4}}
];
const rs=ResearchStats.summary(labeledRows);
assert(rs.byRegime.some(x=>x.key==='RISK_ON'&&x.count===2));
assert(rs.byPreIgnitionStage.some(x=>x.key==='RECLAIM'&&x.observed===2&&x.labeled===2&&x.successRate===1));
assert(rs.byPreIgnitionSubtype.some(x=>x.key==='COMP'&&x.observed===3&&x.labeled===3));
const clusters=ArchetypeLab.buildClusters(labeledRows,{similarityThreshold:.8,minOverlap:6});
assert(clusters.length>=1);
assert(clusters.every(x=>x.state==='RESEARCH_CANDIDATE'&&x.productionEligible===false));
assert(clusters.some(x=>x.preIgnitionStages.includes('RECLAIM')),'archetypes must preserve common-stage context');
assert(clusters.some(x=>x.preIgnitionSubtypes.includes('COMP')),'archetypes must preserve subtype DNA');

// Research Integrity / Lab v5: hypothesis generation never consumes sealed OOS.
const integrityState={contract:{...Integrity.CONTRACT},datasetSnapshotId:'DS-TEST'};
const lab=ResearchLab.labSummary(labeledRows,{integrity:integrityState});
assert.equal(lab.shadowOnly,true);
assert.equal(lab.integrity.oosAccess,'SEALED_DENY_HYPOTHESIS_GENERATOR');
assert.equal(lab.knowledge.coverage.total,ResearchLab.techniqueCatalog().length);
assert(Array.isArray(lab.experiments));
assert(lab.experiments.every(x=>x.rankWeight===0&&x.requiresLockedOos===true&&x.split==='TRAIN_VALIDATION_ONLY'));
const evalProbe=ResearchLab.evaluateHypothesis(labeledRows,{ruleIds:['MARKET_STRUCTURE','VOLUME_PRICE'],regime:'RISK_ON'});
assert.equal(evalProbe.leakageSafe,true);
assert.equal(evalProbe.lockedOos,null);
assert.equal(evalProbe.state,'SAMPLE_INSUFFICIENT');

const dnaProbe=ResearchLab.strategyDna({id:'probe',ruleIds:['MARKET_STRUCTURE','VOLUME_PRICE'],regime:'RISK_ON'},{integrity:integrityState});
assert(dnaProbe.strategyId.startsWith('LAB-')&&dnaProbe.version==='v1.0.0');
assert.equal(dnaProbe.provenance.datasetSnapshotId,'DS-TEST');
const childDna=ResearchLab.strategyDna({id:'child',kind:'MUTATION',parentId:'probe',ruleIds:['MARKET_STRUCTURE','VOLUME_PRICE','RSI'],regime:'RISK_ON'},{integrity:integrityState,parentRuleIds:['MARKET_STRUCTURE','VOLUME_PRICE']});
assert.equal(childDna.version,'v1.1.0');
assert.deepEqual(childDna.diff.addedConditions,['RSI']);

const abl=ResearchLab.ablationStudy(labeledRows,{id:'probe',ruleIds:['MARKET_STRUCTURE','VOLUME_PRICE'],regime:'RISK_ON'},{minSample:30});
assert.equal(abl.state,'SAMPLE_INSUFFICIENT');
assert.equal(abl.tests.length,0);
const competition=ResearchLab.championChallenger(labeledRows,[{id:'probe',ruleIds:['MARKET_STRUCTURE','VOLUME_PRICE'],regime:'RISK_ON',title:'probe'}],{integrity:integrityState});
assert.equal(competition.champion,null);
assert(competition.policy.includes('sealed Locked OOS'));

const ledger=V2.mergeExperimentLedger([],lab.experiments,'DS-TEST');
const ledger2=V2.mergeExperimentLedger(ledger,lab.experiments,'DS-TEST');
assert.equal(ledger2.length,ledger.length,'idempotency keys must prevent duplicate experiment rows');

const refState=V2.initialState();
V2.ingestLabeledSample(refState,{symbol:'REFUSDT',lastPrice:1,stats:{},tfState:{}},{label:1,source:'reference-test',knownAt:t0,metadata:{referenceOnly:true}});
assert.equal(V2.trainingRows(refState.observations).length,0,'reference-only reverse traces must never become training labels');

// Failed ignition detector must only label retrospectively after future failure bars exist.
const ft0=1_800_000_000_000,failBars=[];
for(let i=0;i<80;i++){
  let close=100;
  if(i===40)close=102;
  else if(i>40&&i<=48)close=101-(i-40)*.65;
  else if(i>48)close=95;
  const vol=i===40?500:100;
  failBars.push([ft0+i*900000,String(close),String(close+0.5),String(close-0.5),String(close),String(vol),ft0+(i+1)*900000-1,'0',0,'0','0','0']);
}
const failEvent=AutoSample.detectFailedIgnition({'15m':failBars},ft0+80*900000);
assert(failEvent===null||failEvent.knownResolvedAt<=ft0+80*900000,'failure labels must only resolve after future bars exist');

// Research AI central-state wiring: scanners must hydrate persisted memory before mutation,
 // trader runtime must return raw scan data, and learning status must stay on the unified runtime.
const fs=require('fs');
const adapterSrc=fs.readFileSync(require.resolve('../lib/learning/scanner-adapter.js'),'utf8');
const coinSrc=fs.readFileSync(require.resolve('../api/coin-scan.js'),'utf8');
const learningSrc=fs.readFileSync(require.resolve('../handlers/learning-ai.js'),'utf8');
assert(adapterSrc.includes('await ai.hydrateRemote(false)'),'scanner adapter must hydrate persisted memory before ingest');
assert(coinSrc.includes("params.set('learning','0')"),'proxied trader runtime must not mutate its own Research AI state');
assert(coinSrc.includes("body.learning.authority='unified-runtime'"),'proxied trader results must be ingested by unified runtime');
assert(!learningSrc.includes('forwardToRuntime'),'learning API must remain authoritative on unified runtime');
// Research AI central-state wiring

console.log('Research AI v2 PASS');

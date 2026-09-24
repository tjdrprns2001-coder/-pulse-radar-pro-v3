'use strict';
const assert=require('assert');
const F=require('../ui/book-ai/fusion-engine.js');
const Contract=require('../ui/book-ai/contract.js');
const ASOF=2000000;
function base(){
  const adapter={
    adapterVersion:'BOOK_AI_ADAPTER_v1',analysisAsOf:ASOF,symbol:'BTCUSDT',exchange:'BINANCE',marketType:'perpetual',
    inherited:{bias:{value:'bullish',source:'scanner'},stage:{code:'A',source:'scanner',paramsHash:'p1'},presurge:{label:'관찰'}},
    engineSources:{scanner:{status:'AVAILABLE'},journal:{status:'AVAILABLE'}},
    coverage:{AVAILABLE:2},
    sources:{
      scanner:{v3:{longTerm:{filter:{tier:'PASS'}}}},
      presurge:{label:'관찰'},
      journal:{latestSequenceId:'q1',snapshots:[{id:'s1',sequenceId:'q1'}],outcomes:[]},
      gate:{state:'OBSERVING'}
    }
  };
  const ruleResult={
    version:'BOOK_AI_RULE_ENGINE_v1',analysisAsOf:ASOF,symbol:'BTCUSDT',
    bookSetups:[{ruleId:'R',status:'CANDIDATE',sequenceId:'q1',evidenceEventIds:['e1']},{ruleId:'R2',status:'CANDIDATE',sequenceId:'q1',evidenceEventIds:['e2']}],
    evidenceFacts:[{factId:'f1',factType:'X',eventId:'e1',sequenceId:'q1'}],
    evidenceAudit:{uniqueEventCount:1},
    bookEvidence:Contract.computeEvidenceScore({bookStructure:5,htfAlignment:14,liquiditySmc:7,volumeRvol:0,derivatives:0,retestReclaim:2})
  };
  return{adapter,ruleResult};
}
{
  const x=base(),r=F.fuse(x);
  assert.equal(r.resultReady,true);
  assert.equal(r.bias.value,'bullish');
  assert.equal(r.stage.code,'A');
  assert.equal(r.setupState,'READY');
  assert.equal(r.htfAlignment,'ALIGNED');
  assert.equal(r.sampleDna.scoreContribution,0);
  assert.equal(r.rankingContribution,0);
  assert.deepEqual(r.presurge,{label:'관찰'});
  assert.equal(r.journal.gateState,'OBSERVING');
}
{
  const x=base();x.adapter.inherited.stage=null;
  const r=F.fuse(x);
  assert.equal(r.resultReady,false);assert(r.incompleteReasons.includes('MISSING_SCANNER_STAGE'));
}
{
  const x=base();x.ruleResult.analysisAsOf=ASOF+1;
  assert.throws(()=>F.fuse(x),/analysisAsOf mismatch/i);
}
{
  const x=base();x.ruleResult.symbol='ETHUSDT';
  assert.throws(()=>F.fuse(x),/symbol mismatch/i);
}
{
  const x=base();const previous={currentState:'CONFIRMED',sequenceId:'q1',transitionPath:['WATCH','READY','CONFIRMED']};
  x.ruleResult.bookSetups=[];x.ruleResult.evidenceFacts=[];
  const r=F.fuse({...x,previousLifecycle:previous});
  assert.equal(r.setupState,'CONFIRMED');
  assert.equal(r.setupLifecycle.transition.reason,'CONFIRMED_STICKY_SAME_SEQUENCE');
}
console.log('book ai fusion PASS');
'use strict';
const assert=require('assert');
const Replay=require('../lib/research-backtest-v2/forex-book-replay.js');

const H=3600000,DAY=24*H;
function rawSeries(step,count,cutoff,base=100){
  const start=cutoff-count*step+1;
  const out=[];
  for(let i=0;i<count;i++){
    const openTime=start+i*step,closeTime=openTime+step-1;
    const p=base+i*.06+Math.sin(i/6)*.6,vol=1000+(i%13)*25;
    out.push([openTime,String(p-.12),String(p+.45),String(p-.42),String(p+.08),String(vol),closeTime,String(vol*p),100,'0',String(vol*p*.54),'0']);
  }
  return out;
}
function frameSet(cutoff){
  return{
    '15m':rawSeries(15*60000,220,cutoff,100),
    '1h':rawSeries(H,160,cutoff,98),
    '4h':rawSeries(4*H,120,cutoff,94),
    '1d':rawSeries(DAY,90,cutoff,80),
    '1w':rawSeries(7*DAY,60,cutoff,55)
  };
}
function addFuture(frames,cutoff,mutator){
  const out={};
  for(const [tf,rows] of Object.entries(frames)){
    const step={'15m':15*60000,'1h':H,'4h':4*H,'1d':DAY,'1w':7*DAY}[tf];
    const future=[cutoff+1,'9999','10050','1','9998','999999',cutoff+step,'999999999',999,'0','999999','0'];
    if(mutator)mutator(future,tf);
    out[tf]=[...rows,future];
  }
  return out;
}
function futureOutcomeBars(cutoff,{surge=false}={}){
  const rows=[];
  for(let i=1;i<=72;i++){
    const oTs=cutoff+(i-1)*H+1,cTs=cutoff+i*H,open=100;
    const high=surge?(i===6?109:i===24?113:102+i*.03):101.8;
    const low=surge?98.5:96.5-i*.01,close=surge?100+i*.08:99-i*.025;
    rows.push([oTs,String(open),String(high),String(low),String(close),'1000',cTs,'100000',100,'0','55000','0']);
  }
  return rows;
}

const cutoff=Date.parse('2026-09-20T15:00:00Z');
const base=frameSet(cutoff);
const withFutureA=addFuture(base,cutoff);
const withFutureB=addFuture(base,cutoff,(r)=>{r[1]='1';r[2]='50000';r[3]='0.0001';r[4]='40000';r[5]='999999999';});

const a=Replay.buildReplayDecision({symbol:'TESTUSDT',frames:withFutureA,cutoff,selectedTf:'1h'});
const b=Replay.buildReplayDecision({symbol:'TESTUSDT',frames:withFutureB,cutoff,selectedTf:'1h'});
assert.equal(a.schemaVersion,'FOREX_BOOK_BLIND_REPLAY_v1');
assert.equal(a.outcome_entry_basis,'NEXT_OPEN');
assert(a.provenance.max_source_candle_close_ts<=cutoff);
assert.equal(a.provenance.future_candle_seen,false);
assert.deepEqual(
  {stage:a.stage_label,score:a.final_state_score,mtf:a.mtf,features:a.selected_tf_features},
  {stage:b.stage_label,score:b.final_state_score,mtf:b.mtf,features:b.selected_tf_features},
  'future candles changed a T0 decision'
);

assert.throws(()=>Replay.buildReplayDecision({
  symbol:'TESTUSDT',frames:base,cutoff,selectedTf:'1h',
  historicalContext:{asOfTs:cutoff+1,preSurge:{state:'PRE-SURGE'}}
}),/leaks beyond replay cutoff/i);

const historical=Replay.buildReplayDecision({
  symbol:'TESTUSDT',frames:base,cutoff,selectedTf:'1h',
  historicalContext:{asOfTs:cutoff,preSurge:{available:true,state:'WATCH',score:45,direction:'중립'},dna:{available:false}}
});
assert.equal(historical.provenance.context_not_after_cutoff,true);

const seq=Replay.replaySequence({
  symbol:'TESTUSDT',frames:base,selectedTf:'1h',
  cutoffs:[cutoff-2*H,cutoff-H,cutoff]
});
assert.equal(seq.length,3);
assert(seq.every(x=>typeof x.stage_label==='string'&&typeof x.stage_transition==='string'));
assert(seq.slice(1).every((x,i)=>x.stage_transition.startsWith(seq[i].stage_label+'→')));

const successDecision={...a,event_id:'SUCCESS:1'};
const controlDecision={...a,event_id:'CONTROL:1'};
const success=Replay.evaluateNextOpenOutcome({decision:successDecision,futureBars:futureOutcomeBars(cutoff,{surge:true})});
const control=Replay.evaluateNextOpenOutcome({decision:controlDecision,futureBars:futureOutcomeBars(cutoff,{surge:false})});
assert.equal(success.entry_basis,'NEXT_OPEN');
assert.equal(success.next_open_price,100);
assert.equal(success.outcome_class,'SURGE');
assert.equal(success.labels.Hit_6H_8pct,true);
assert.equal(success.labels.Hit_24H_12pct,true);
assert.equal(control.outcome_class,'CONTROL');
assert.equal(control.labels.Hit_6H_8pct,false);
assert.equal(control.labels.Hit_24H_12pct,false);

const smoke=Replay.batchSummary({decisions:[successDecision,controlDecision],outcomes:[success,control]});
assert.equal(smoke.surgeCount,1);
assert.equal(smoke.controlCount,1);
assert.equal(smoke.performanceConclusionAllowed,false,'tiny smoke batch must never authorize a performance conclusion');

const manyDecisions=[],manyOutcomes=[];
for(let i=0;i<50;i++){
  const d={...a,event_id:'E:'+i,stage_label:i%2?'점화대기':'준비중',is_stage_transition:i%3===0};
  const o={...(i%2?success:control),event_id:d.event_id,outcome_class:i%2?'SURGE':'CONTROL'};
  manyDecisions.push(d);manyOutcomes.push(o);
}
const formal=Replay.batchSummary({decisions:manyDecisions,outcomes:manyOutcomes});
assert.equal(formal.performanceConclusionAllowed,true);
assert.equal(formal.evaluatedCount,50);
assert.equal(formal.surgeCount,25);
assert.equal(formal.controlCount,25);

console.log('Forex Book blind replay PASS');

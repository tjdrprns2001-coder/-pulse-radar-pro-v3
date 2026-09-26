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
  ...Array.from({length:75},(_,i)=>candle(t0+(i+1)*3600000,1.04,1.05,1.02,1.04))
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
  verdict:{key:'WATCH_PRIORITY',label:'watch',score:68}
},{source:'astra-astra',marketState:{regime:'RISK_ON'},asOf:t0});
assert.equal(astra.regime,'RISK_ON');
assert.equal(astra.flow.oi4hPct,2.4);
assert.equal(astra.flow.takerRatio,1.35);
assert.equal(astra.stats['1h'].rvol,1.8);
assert.equal(astra.setup.type,'WATCH_PRIORITY');

console.log('Research AI v2 PASS');

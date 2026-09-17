const test=require('node:test');
const assert=require('node:assert/strict');

const Outcome=require('../lib/signal-quality/outcome-recorder');
const Backfill=require('../lib/signal-quality/historical-backfill');
const Calibration=require('../lib/signal-quality/calibration');
const Policy=require('../lib/signal-quality/policy-gate');
const AlertHistory=require('../lib/signal-quality/alert-history');
const Micro=require('../lib/signal-quality/microstructure');

function memoryStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}

function candles(n=80,start=100){return Array.from({length:n},(_,i)=>({time:(i+1)*60000,open:start+i,high:start+i+2,low:start+i-1,close:start+i+1,volume:100+i}))}

test('outcome recorder separates LIVE_VALIDATED and BACKTESTED and dedupes by snapshot key',()=>{
  const storage=memoryStorage();
  const a=Outcome.recordSnapshot({symbol:'UNIUSDT',tf:'4h',asOfTime:1000,pattern:'falling_wedge',regime:'up:high:normal',venue:'cex',bias:'bullish',modelScore:70,validationSource:'LIVE_VALIDATED'},storage);
  const b=Outcome.recordSnapshot({symbol:'UNIUSDT',tf:'4h',asOfTime:1000,pattern:'falling_wedge',regime:'up:high:normal',venue:'cex',bias:'bullish',modelScore:70,validationSource:'LIVE_VALIDATED'},storage);
  Outcome.recordSnapshot({...a,validationSource:'BACKTESTED',id:undefined,snapshotKey:undefined},storage);
  assert.equal(a.snapshotKey,b.snapshotKey);
  assert.equal(Outcome.list({validationSource:'LIVE_VALIDATED'},storage).length,1);
  assert.equal(Outcome.list({validationSource:'BACKTESTED'},storage).length,1);
});

test('historical backfill is deterministic and resolves 5/10/20/50 bar outcomes',()=>{
  const storage=memoryStorage(),cs=candles(90,100);
  const detector=({index,candle})=>index===10?{pattern:'trend',regime:'up:normal:normal',venue:'cex',bias:'bullish',modelScore:75,entryPrice:candle.close}:null;
  const first=Backfill.backfill(cs,detector,{symbol:'BTCUSDT',tf:'1h',storage});
  const second=Backfill.backfill(cs,detector,{symbol:'BTCUSDT',tf:'1h',storage});
  assert.equal(first.created,1);
  assert.equal(second.created,0);
  const row=Outcome.list({symbol:'BTCUSDT',tf:'1h',validationSource:'BACKTESTED'},storage)[0];
  assert.ok(row.outcomes['5']&&row.outcomes['10']&&row.outcomes['20']&&row.outcomes['50']);
});

test('hierarchical calibration backs off and labels broader live bucket',()=>{
  const rows=[];
  for(let i=0;i<40;i++)rows.push({probability:.6,outcome:i<24?1:0,symbol:'BTCUSDT',tf:'4h',pattern:'wedge',regime:'up',venue:'cex',validationSource:'LIVE_VALIDATED'});
  const r=Calibration.resolveHierarchical(rows,{symbol:'UNIUSDT',tf:'4h',pattern:'wedge',regime:'up',venue:'cex'},{minSamples:30,adequateSamples:100,validationSource:'LIVE_VALIDATED'});
  assert.equal(r.available,true);
  assert.equal(r.bucketLevel,1);
  assert.equal(r.broaderBucket,true);
  assert.equal(r.validationSource,'LIVE_VALIDATED');
});

test('backtested calibration remains separate and cannot masquerade as live',()=>{
  const rows=Array.from({length:50},(_,i)=>({probability:.7,outcome:i<35?1:0,tf:'4h',pattern:'wedge',regime:'up',venue:'cex',validationSource:'BACKTESTED'}));
  const live=Calibration.resolveHierarchical(rows,{symbol:'UNIUSDT',tf:'4h',pattern:'wedge',regime:'up',venue:'cex'},{minSamples:30,validationSource:'LIVE_VALIDATED'});
  const bt=Calibration.resolveHierarchical(rows,{symbol:'UNIUSDT',tf:'4h',pattern:'wedge',regime:'up',venue:'cex'},{minSamples:30,validationSource:'BACKTESTED'});
  assert.equal(live.available,false);
  assert.equal(bt.available,true);
  assert.equal(bt.validationSource,'BACKTESTED');
});

test('known-value statistics: Wilson90 60/100, Brier and ECE',()=>{
  const ci=Calibration.wilsonInterval(60,100,.9);
  assert.ok(Math.abs(ci.low-0.5178)<0.002);
  assert.ok(Math.abs(ci.high-0.6769)<0.002);
  const rows=[{probability:.8,outcome:1},{probability:.2,outcome:0}];
  assert.ok(Math.abs(Calibration.brierScore(rows)-0.04)<1e-12);
  assert.ok(Math.abs(Calibration.expectedCalibrationError(rows,2)-0.2)<1e-12);
});

test('policy gate caps at WATCH for missing/live-invalid calibration or material drift warning',()=>{
  const missing=Policy.evaluate({integrityState:'live',calibration:{available:false},drift:{status:'stable'}});
  assert.equal(missing.maxState,'WATCH');
  const bt=Policy.evaluate({integrityState:'live',calibration:{available:true,validationSource:'BACKTESTED'},drift:{status:'stable'}});
  assert.equal(bt.maxState,'WATCH');
  const drift=Policy.evaluate({integrityState:'live',calibration:{available:true,validationSource:'LIVE_VALIDATED'},drift:{status:'warning'},materiallyContributing:true});
  assert.equal(drift.maxState,'WATCH');
  const ok=Policy.evaluate({integrityState:'live',calibration:{available:true,validationSource:'LIVE_VALIDATED'},drift:{status:'stable'},materiallyContributing:true});
  assert.equal(ok.maxState,'CONFIRMED');
});

test('alert history persists transitions and summarizes states',()=>{
  const storage=memoryStorage();
  AlertHistory.recordTransition({state:'WATCH'},{state:'ARMED',reason:'aligned',conditionsMet:3,conditionsTotal:3},{symbol:'BTCUSDT',tf:'4h',calibrationBucket:'pattern+venue',driftStatus:'stable',integrityStatus:'live',validationSource:'LIVE_VALIDATED',atMs:1000},storage);
  AlertHistory.recordTransition({state:'ARMED'},{state:'NO_SIGNAL',reason:'stale'},{symbol:'BTCUSDT',tf:'4h',atMs:2000},storage);
  assert.equal(AlertHistory.list({symbol:'BTCUSDT'},storage).length,2);
  const s=AlertHistory.summary({symbol:'BTCUSDT'},storage);
  assert.equal(s.ARMED,1);
  assert.equal(s.NO_SIGNAL,1);
});

test('abstention snapshots preserve reason and can resolve 20/50-bar outcomes',()=>{
  const storage=memoryStorage();
  const snap=Outcome.recordAbstention({symbol:'ETHUSDT',tf:'1h',asOfTime:1000,entryPrice:100,bias:'bullish',modelScore:45,venue:'cex',reason:'calibration_insufficient'},storage);
  Outcome.attachOutcome(snap.id,20,{success:false,returnPct:-2},storage);
  Outcome.attachOutcome(snap.id,50,{success:true,returnPct:4},storage);
  const row=Outcome.list({symbol:'ETHUSDT',abstained:true},storage)[0];
  assert.equal(row.snapshot.abstained,true);
  assert.equal(row.snapshot.abstainReason,'calibration_insufficient');
  assert.ok(row.outcomes['20']&&row.outcomes['50']);
});

test('DEX feature schema keeps missing data null and provenance/freshness explicit',()=>{
  const x=Micro.dexFeatures({buySwapVolume:120,sellSwapVolume:80,poolLiquidityChangePct:2,lpNetFlowUsd:10000,priceImpactBps:8,liquidityUsd:5000000,marketCapUsd:25000000,uniqueTraderAcceleration:1.4,whaleSwapShare:.22,volumeAcceleration:3,source:'dex-provider',fetchedAtMs:1000,eventTimeMs:900});
  assert.equal(x.venue,'dex');
  assert.ok(Math.abs(x.liquidityMarketCapRatio-.2)<1e-12);
  assert.equal(x.provenance.source,'dex-provider');
  assert.equal(x.provenance.freshnessMs,100);
  const missing=Micro.dexFeatures({});
  assert.equal(missing.liquidityMarketCapRatio,null);
  assert.equal(missing.priceImpactBps,null);
});

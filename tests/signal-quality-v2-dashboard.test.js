const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Performance=require('../lib/signal-quality/performance');

function row(id,source,pattern,outcome,ret,score=60,alert='ARMED',abstained=false){return{snapshot:{id,symbol:'BTCUSDT',tf:'4h',pattern,regime:'up',venue:'cex',validationSource:source,modelScore:score,entryPrice:100,invalidation:95,alertStateAtCapture:alert,abstained,createdAt:Number(id)},outcomes:{'20':{success:outcome,returnPct:ret}}}}

test('performance aggregation computes source-separated core metrics',()=>{
  const rows=[row('1','LIVE_VALIDATED','wedge',true,5,70),row('2','LIVE_VALIDATED','wedge',false,-2,50),row('3','BACKTESTED','wedge',true,3,80)];
  const groups=Performance.aggregate(rows,['validationSource','pattern'],{horizon:20});
  const live=groups.find(x=>x.validationSource==='LIVE_VALIDATED');
  const bt=groups.find(x=>x.validationSource==='BACKTESTED');
  assert.equal(live.n,2);
  assert.equal(live.hitRate,.5);
  assert.equal(live.averageReturn,1.5);
  assert.equal(live.medianReturn,1.5);
  assert.ok(Number.isFinite(live.averageR));
  assert.ok(Number.isFinite(live.drawdownProxy));
  assert.equal(bt.n,1);
});

test('performance groups by alert state and abstention comparison stays source aware',()=>{
  const rows=[row('1','LIVE_VALIDATED','wedge',true,4,70,'ARMED',false),row('2','LIVE_VALIDATED','wedge',false,-1,50,'NO_SIGNAL',true),row('3','BACKTESTED','wedge',true,3,80,'ARMED',false)];
  const byState=Performance.aggregate(rows,['validationSource','alertStateAtCapture'],{horizon:20});
  assert.ok(byState.some(x=>x.alertStateAtCapture==='NO_SIGNAL'));
  const c=Performance.abstentionComparison(rows,{horizons:[20,50]});
  assert.equal(c.LIVE_VALIDATED.accepted.n,1);
  assert.equal(c.LIVE_VALIDATED.abstained.n,1);
});

test('performance dashboard exists with live/backtested, filters, drift and drilldown UI',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../performance-dashboard.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../ui/signal-quality/performance-dashboard.js'),'utf8');
  assert.match(html,/Outcome Performance/i);
  assert.match(html,/LIVE_VALIDATED/);
  assert.match(html,/BACKTESTED/);
  assert.match(js,/PulsePerformance/);
  assert.match(js,/30.*90|90.*30/s);
  assert.match(js,/snapshot|drill/i);
});

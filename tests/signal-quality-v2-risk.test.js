const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Risk=require('../lib/signal-quality/risk-calculator');

test('risk calculator computes reference-only risk, size and staged exits',()=>{
  const r=Risk.calculate({accountSize:10000,riskPct:1,entry:100,invalidation:95,targets:[110,120],exitWeights:[50,50]});
  assert.equal(r.riskAmount,100);
  assert.equal(r.stopDistance,5);
  assert.equal(r.quantity,20);
  assert.equal(r.notional,2000);
  assert.deepEqual(r.targets.map(x=>x.rewardRisk),[2,4]);
  assert.equal(r.stagedExits[0].quantity,10);
  assert.equal(r.stagedExits[1].quantity,10);
});

test('risk calculator rejects invalid geometry instead of inventing size',()=>{
  const r=Risk.calculate({accountSize:10000,riskPct:1,entry:100,invalidation:100,targets:[110]});
  assert.equal(r.valid,false);
  assert.equal(r.quantity,null);
});

test('risk calculator rejects missing, nonpositive, excessive and overflowing inputs',()=>{
  const base={accountSize:10000,riskPct:1,entry:100,invalidation:95,targets:[110,120]};
  for(const change of [{invalidation:-5},{invalidation:0},{riskPct:101},{accountSize:true},{accountSize:''},{accountSize:1e308,entry:1e-308,invalidation:2e-308},{targets:[0]},{targets:[90]},{targets:['bad']},{exitWeights:[-1,101]}]){
    const r=Risk.calculate({...base,...change});assert.equal(r.valid,false,JSON.stringify(change));assert.equal(r.quantity,null);
  }
  assert.equal(Risk.calculate(null).valid,false);
});

test('risk calculator supports short targets and normalizes legitimate exit allocations',()=>{
 const r=Risk.calculate({accountSize:10000,riskPct:1,entry:100,invalidation:105,targets:[90,80],exitWeights:[1,3]});
 assert.equal(r.valid,true);assert.equal(r.side,'short');assert.deepEqual(r.stagedExits.map(x=>x.weightPct),[25,75]);assert.equal(r.stagedExits.reduce((s,x)=>s+x.quantity,0),r.quantity);
});

test('risk calculator page is explicitly reference-only and contains no order/exchange-key action',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../risk-calculator.html'),'utf8');
  assert.match(html,/참고용|reference-only/i);
  assert.doesNotMatch(html,/apiKey|secretKey|placeOrder|주문 실행|자동 주문/i);
});

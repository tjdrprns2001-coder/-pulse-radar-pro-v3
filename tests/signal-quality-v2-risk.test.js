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

test('risk calculator page is explicitly reference-only and contains no order/exchange-key action',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../risk-calculator.html'),'utf8');
  assert.match(html,/참고용|reference-only/i);
  assert.doesNotMatch(html,/apiKey|secretKey|placeOrder|주문 실행|자동 주문/i);
});

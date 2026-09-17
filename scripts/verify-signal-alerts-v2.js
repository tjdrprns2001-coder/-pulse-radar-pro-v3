'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createAlertService}=require('../lib/signal-performance/alerts.js');
(async()=>{
  let t=1_000_000;const store=createMemoryStore();const svc=createAlertService({store,now:()=>t,cooldownMs:1800000});
  await svc.observe([{symbol:'AAAUSDT',scanClass:{key:'ACCUMULATION-PRE'},tradeSignal:{confidence:60},reasons:['base']}]);
  assert.equal((await store.listAlerts()).length,0,'first observation must not alert');
  t+=1000;let r=await svc.observe([{symbol:'AAAUSDT',scanClass:{key:'PRE-SURGE'},tradeSignal:{confidence:78},reasons:['volume']}]);
  assert.equal(r.recorded,1);let alerts=await store.listAlerts();assert.equal(alerts.length,1);assert.equal(alerts[0].from,'ACCUMULATION-PRE');assert.equal(alerts[0].to,'PRE-SURGE');
  await svc.observe([{symbol:'AAAUSDT',scanClass:{key:'PRE-SURGE'},tradeSignal:{confidence:79}}]);assert.equal((await store.listAlerts()).length,1,'same state must not alert');
  t+=1000;await svc.observe([{symbol:'AAAUSDT',scanClass:{key:'ANOMALY'}}]);t+=1000;await svc.observe([{symbol:'AAAUSDT',scanClass:{key:'PRE-SURGE'}}]);assert.equal((await store.listAlerts()).length,2,'different approved transition may alert');
  t+=1000;await svc.observe([{symbol:'AAAUSDT',scanClass:{key:'DISTRIBUTION-RISK'},tradeSignal:{confidence:20},reasons:['sell']}]);alerts=await store.listAlerts();assert(alerts.some(x=>x.to==='DISTRIBUTION-RISK'&&x.priority==='risk'));

  // Sliding cooldown must work across fixed bucket boundaries.
  const boundaryStore=createMemoryStore();let bt=1_799_000;const boundary=createAlertService({store:boundaryStore,now:()=>bt,cooldownMs:1_800_000});
  await boundary.observe([{symbol:'CCCUSDT',scanClass:{key:'ACCUMULATION-PRE'}}]);
  await boundary.observe([{symbol:'CCCUSDT',scanClass:{key:'PRE-SURGE'}}]);
  assert.equal((await boundaryStore.listAlerts()).length,1);
  bt=1_800_000;await boundary.observe([{symbol:'CCCUSDT',scanClass:{key:'ACCUMULATION-PRE'}}]);
  bt=1_801_000;await boundary.observe([{symbol:'CCCUSDT',scanClass:{key:'PRE-SURGE'}}]);
  assert.equal((await boundaryStore.listAlerts()).length,1,'same transition inside cooldown must not re-alert across bucket boundary');
  bt=3_600_000;await boundary.observe([{symbol:'CCCUSDT',scanClass:{key:'ACCUMULATION-PRE'}}]);
  bt=3_601_000;await boundary.observe([{symbol:'CCCUSDT',scanClass:{key:'PRE-SURGE'}}]);
  assert.equal((await boundaryStore.listAlerts()).length,2,'same transition may alert after cooldown expires');

  const badStore={async getState(){return {classKey:'ANOMALY'}},async putState(){return true},async putAlert(){throw new Error('blob down')},async listAlerts(){return[]}};const isolated=createAlertService({store:badStore,now:()=>t});const out=await isolated.observe([{symbol:'BBB',scanClass:{key:'PRE-SURGE'}}]);assert.equal(out.errors.length,1,'store failure must be isolated');
  console.log('signal transition alerts PASS');
})().catch(e=>{console.error(e);process.exit(1)});

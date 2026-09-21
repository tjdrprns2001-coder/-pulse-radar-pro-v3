'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {TF_ORDER,confirmedCandles,buildBundle,createTransitionSnapshotService}=require('../lib/coin-scan/transition-snapshot-service.js');

function frame({start=1700000000000,step=3600000,count=70,capturedAt}={}){
  const rows=[];
  for(let i=0;i<count;i++){
    const openTime=start+i*step,closeTime=openTime+step-1,base=100+i*.15+Math.sin(i/5);
    rows.push([openTime,String(base),String(base+1.1),String(base-1),String(base+.35),String(1000+i*8),closeTime,String((1000+i*8)*(base+.35)),100,'0',String((1000+i*8)*(base+.35)*.55),'0']);
  }
  const openTime=(capturedAt??(start+count*step))-Math.floor(step/2),base=120;
  rows.push([openTime,String(base),String(base+1),String(base-1),String(base+.2),'900',openTime+step-1,'108000',100,'0','59400','0']);
  return rows;
}
(async()=>{
  const detectedAt=1700300000000,rows=frame({start:detectedAt-70*3600000,step:3600000,count:70,capturedAt:detectedAt});
  const confirmed=confirmedCandles(rows,detectedAt);
  assert.equal(confirmed.length,70,'open candle at detection time must be excluded');
  assert(confirmed.every(x=>Number(x.time)<=detectedAt),'confirmed snapshot must not contain future candles');

  const frames=Object.fromEntries(TF_ORDER.map(tf=>[tf,rows]));
  const item={symbol:'BTCUSDT',v2Type:'A',v2Stage:'🟢 준비중',v2Flow:{type:'A',stageLabel:'🟢 준비중',direction:'long',paramSet:'v2_test'},v2Csv:{stage_label:'🟢 준비중'},direction:'long',paramSet:'v2_test',updatedAt:detectedAt};
  const bundle=buildBundle({item,frames,previous:{type:'A-pre',stageLabel:'🟢 준비중'},detectedAt});
  assert.equal(bundle.records.length,8,'transition bundle must contain 8TF');
  assert.equal(bundle.eventMeta.typeTransition,'A-pre→A');
  assert(bundle.records.every(x=>x.candles.length===70),'all records must stop at the confirmed candle');
  assert(bundle.records.every(x=>x.params.capturedBy==='scanner-transition'),'bundle provenance must identify scanner capture');
  assert(bundle.snapshotIds.every(Boolean),'all 8TF records must have deterministic snapshot IDs');
  assert(bundle.records.every(x=>Array.isArray(x.analysis?.overlays?.trendlines)),'transition bundle must preserve trendline overlay coordinates');

  const store=createMemoryStore(),service=createTransitionSnapshotService({store,now:()=>detectedAt});
  const first={...item,v2Type:'A-pre',v2Flow:{...item.v2Flow,type:'A-pre'},updatedAt:detectedAt-60000};
  let r=await service.observe({items:[first],framesBySymbol:{BTCUSDT:frames}});
  assert.equal(r.archived,0,'first observation only seeds persistent state');
  const second={...item};
  r=await service.observe({items:[second],framesBySymbol:{BTCUSDT:frames}});
  assert.equal(r.transitions,1,'A-pre→A must be a type transition');
  assert.equal(r.archived,1,'transition must archive immediately without opening the UI');
  assert(second.eventSnapshotId,'scanner item must expose the durable event snapshot ID');
  const saved=await service.get(second.eventSnapshotId);
  assert(saved&&saved.records.length===8,'server archive must be retrievable');
  assert.equal(saved.detectedAt,detectedAt,'archive time must equal scanner detection time');
  assert.equal((await service.list({symbol:'BTCUSDT'})).length,1,'archive must be listable for export/comparison');

  const same={...item,updatedAt:detectedAt+60000};
  r=await service.observe({items:[same],framesBySymbol:{BTCUSDT:frames}});
  assert.equal(r.archived,0,'same v2 type must not create a new event snapshot');
  assert.equal(same.isTransitionEvent,false,'stage/no-op observations must not become v2 type events');

  const stageOnly={...item,v2Type:'A',v2Stage:'🟡 점화대기',v2Flow:{...item.v2Flow,type:'A',stageLabel:'🟡 점화대기'},v2Csv:{stage_label:'🟡 점화대기'},updatedAt:detectedAt+120000};
  r=await service.observe({items:[stageOnly],framesBySymbol:{BTCUSDT:frames}});
  assert.equal(r.archived,0,'stage-only change must not pollute A-type transition samples');
  assert.equal(stageOnly.isStageTransitionEvent,true);
  assert.equal(stageOnly.isTransitionEvent,false);

  console.log('transition snapshot archive PASS');
})().catch(e=>{console.error(e);process.exit(1)});

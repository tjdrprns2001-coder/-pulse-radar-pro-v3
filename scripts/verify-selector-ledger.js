const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createSelectorLedgerService}=require('../lib/coin-scan/selector-ledger-service.js');

(async()=>{
  const store=createMemoryStore(),now=Date.parse('2026-09-25T02:00:00Z');
  const resolver={async resolve(symbol,targetTs){return{status:'evaluated',price:110,marketTs:targetTs}}};
  const svc=createSelectorLedgerService({store,resolver,now:()=>now+86400000});
  const snapshot={
    spec_version:'selector-r0.1',snapshot_id:'snap:test',instrument_id:'binance:TESTUSDT:perpetual',symbol:'TESTUSDT',
    decision_time:new Date(now).toISOString(),data_cutoff:new Date(now).toISOString(),timeframe:'5m',input_hash:'sha256:'+'a'.repeat(64),
    classification:'WATCHLIST',scores:{final_score:70},evidence:[],contradictions:[],data_gaps:[],invalidation_conditions:[],disclaimer:'read-only'
  };
  const raw={row:{symbol:'TESTUSDT',state:'READY',validationGate:{status:'VALIDATED',crowding:{crowded:false}},invalidations:[],item:{symbol:'TESTUSDT',lastPrice:100,dataState:'live',updatedAt:now,v3AlignmentPct:80,v3LongTier:'PASS',v3:{causalIct:{primaryTf:'4h',longStage:'WAIT_MSS'}},scanClass:{key:'ACCUMULATION-PRE'},quoteVolume24h:100000000,oi4hChangePct:2,trueTakerRatio:1.2,fundingRate:.01}},execution:{futures:{available:true,spreadBps:3,depthUsd:{bid10bps:100000,ask10bps:100000},slippage:{buy:[{notional:10000,slippageBps:4}],sell:[{notional:10000,slippageBps:4}]}}},intelligence:{cex:{exchangeCount:3,maxPriceDispersionPct:.1},coverage:{cex:true,indicators:true,news:true,execution:true}}};
  const first=await svc.observe({screeningBundle:{all:[snapshot]},rawBySymbol:new Map([['TESTUSDT',raw]])});
  assert.equal(first.snapshotsRecorded,1);
  assert.equal(first.transitionsRecorded,1);
  const second=await svc.observe({screeningBundle:{all:[snapshot]},rawBySymbol:new Map([['TESTUSDT',raw]])});
  assert.equal(second.snapshotsRecorded,0);
  assert(second.duplicates>=1);
  assert.equal((await svc.list()).length,1);
  assert.equal((await svc.transitions()).length,1);
  const evald=await svc.evaluateDue();assert(evald.evaluated>=1);
  const stats=await svc.stats({lockedOosStart:now});assert.equal(stats.lockedOos.configured,true);
  const csv=svc.toCsv(await svc.list());assert(csv.includes('snapshot_id')&&csv.includes('TESTUSDT'));
  console.log('selector ledger PASS');
})().catch(e=>{console.error(e);process.exit(1)});

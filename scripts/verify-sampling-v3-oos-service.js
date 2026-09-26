'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createSamplingV3OosService}=require('../lib/coin-scan/sampling-v3-oos-service.js');

(async()=>{
let now=Date.parse('2026-09-27T00:30:00Z');
const store=createMemoryStore();
const resolver={
  async resolve(snapshot,targetTs){
    const key=targetTs-snapshot.capturedAt===6*3600000?'h6':'h24';
    const label=snapshot.symbol.startsWith('A')?'SURGE':snapshot.symbol.startsWith('B')?'FAILED_BOS':'NO_TRIGGER';
    return{status:'evaluated',label,reason:label==='SURGE'?'UPPER_BARRIER_HIT':label==='FAILED_BOS'?'LOWER_BARRIER_HIT':'TIME_EXPIRED',market:'futures',mfePct:label==='SURGE'?5:1,maePct:label==='FAILED_BOS'?-2:-.5,rowCount:key==='h6'?360:1440};
  }
};
const service=createSamplingV3OosService({store,resolver,now:()=>now,maxEventsPerEvaluation:200,evaluationConcurrency:4});
function item(symbol,stage='QUIET',score=50){
  return{symbol,lastPrice:100,marketScope:'futures',spotListed:false,futuresListed:true,dataState:'live',scanClass:{key:'WATCH'},v2Type:'A-pre',
    samplingV3:{evidenceScore:score,rankingEffect:0,sequence:{stage,eventTypes:['CUSUM_UP','OI_BUILD_4H'],eventCount:2,bullishEventCount:2},integrity:{status:'PASS'},nativeSyntheticAudit:{status:'PASS'},microstructure:{status:'READY'},alternativeBars:{version:'SAMPLING_V3_ALT_BARS_v2',revision:'3.2',status:'READY',tradeCount:200,evaluationTradeCount:130,policy:{thresholdMode:'FROZEN_CALIBRATION',thresholdScope:'PER_SNAPSHOT_CAUSAL_SPLIT',tickDefinition:'BINANCE_AGGTRADE_EVENT_COUNT',overshootPolicy:'INCLUDE_FULL_TRADE'},calibration:{status:'READY',calibrationTradeCount:70,evaluationTradeCount:130,calibrationEndTime:1000,evaluationStartTime:1001,thresholds:{tickTrades:20,volumeQty:40,dollarUsd:4000,imbalanceUsd:1500,runUsd:1000}},bars:{tickCount:6,volumeCount:5,dollarCount:4,imbalanceCount:2,runCount:3}},latestOutcomeProbe:{upperPct:2.5,lowerPct:1.2}},
    sampleSimilarityV2:{successScore:80,negativeScore:40,netEvidenceScore:58,ignitionPath:'OI_BUILD',successTop5:[],negativeTop3:[]},
    priceChange24h:2,oi4hChangePct:3,trueTakerRatio:1.3,v3Rvol:{main1h:{value:2},ignition15m:{value:3}}
  };
}
const batch=[item('AAAUSDT','FLOW_IGNITION',80),item('BBBUSDT','ABSORPTION_BUILD',35),item('CCCUSDT','QUIET',20)];
const first=await service.observe(batch,{capturedAt:now,sourceScanId:'scan-1'});
assert.equal(first.recorded,3);assert.equal(first.duplicates,0);
let captured=await service.list({limit:10,includeOutcomes:false});
assert(captured.every(x=>x.samplingRevision==='3.2'),'forward snapshots must preserve Sampling research revision');
assert(captured.every(x=>x.alternativeBars.tickCount===6&&x.alternativeBars.volumeCount===5),'forward snapshots must persist tick/volume counts');
assert(captured.every(x=>x.alternativeBars.thresholdMode==='FROZEN_CALIBRATION'),'forward snapshots must preserve frozen-threshold policy');
assert(captured.every(x=>x.alternativeBars.overshootPolicy==='INCLUDE_FULL_TRADE'),'forward snapshots must preserve overshoot policy');
assert(captured.every(x=>x.alternativeBars.thresholdScope==='PER_SNAPSHOT_CAUSAL_SPLIT'),'forward snapshots must preserve causal split scope');
assert(captured.every(x=>x.alternativeBars.tickDefinition==='BINANCE_AGGTRADE_EVENT_COUNT'),'forward snapshots must identify aggregate-trade tick semantics');
const dup=await service.observe(batch,{capturedAt:now+20*60000,sourceScanId:'scan-2'});
assert.equal(dup.recorded,0);assert.equal(dup.duplicates,3,'same symbol/hour must dedupe');

now+=7*3600000;
const e6=await service.evaluateDue();
assert.equal(e6.evaluated,3,'6H outcomes must evaluate first');
let rows=await service.list({limit:10});
assert(rows.every(x=>x.outcome.horizons.h6.status==='evaluated'));
assert(rows.every(x=>x.outcome.horizons.h24.status==='pending'));

now+=18*3600000;
const e24=await service.evaluateDue();
assert.equal(e24.evaluated,3,'24H outcomes must evaluate later');
rows=await service.list({limit:10});
const labels=new Map(rows.map(x=>[x.symbol,x.outcome.horizons.h24.label]));
assert.equal(labels.get('AAAUSDT'),'SURGE');
assert.equal(labels.get('BBBUSDT'),'FAILED_BOS');
assert.equal(labels.get('CCCUSDT'),'NO_TRIGGER');
const stats=await service.stats();
assert.equal(stats.snapshotCount,3);assert.equal(stats.evaluated24hCount,3);assert.equal(stats.labels.SURGE,1);assert.equal(stats.labels.FAILED_BOS,1);assert.equal(stats.labels.NO_TRIGGER,1);
assert.equal(stats.promotionReady,false,'three samples must never promote research ranking');
console.log('sampling v3 OOS service PASS');

})().catch(e=>{console.error(e);process.exit(1)});

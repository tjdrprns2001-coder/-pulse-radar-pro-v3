'use strict';
const assert=require('node:assert/strict');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
const Analyst=require('../lib/pulse-ai/deterministic-analyst.js');
const T0=1792100000000;
function snapshot(at=T0,options={}){
  return{
    status:'ok',updatedAt:at,scanCount:2,partial:false,
    dataHealth:{live:2,errors:0,blocked:0,delayed:0},
    marketCoverage:{spot:2,futures:2,both:0,total:2},
    marketBreadth:{count:2,up:1,down:1,flat:0,median:.1,majors:{BTC:.2,ETH:-.1,SOL:0}},
    items:[
      {symbol:'BTCUSDT',category:'급등 전조 관찰',sector:'L1',dataState:'live',
      candidateScore:44,preIgnitionScore:33,priority:50,priceChange24h:.2,takerRatio:1.1,oiChangePct:.2},
      {symbol:'ETHUSDT',category:'급등 전조 관찰',sector:'L1',dataState:'live',
      candidateScore:40,preIgnitionScore:30,priority:48,priceChange24h:-.1,takerRatio:1.1,oiChangePct:.2}
    ],...options
  };
}
function gateway(fn){return{available:true,provider:'test',model:'test',
  health:()=>({model:'test'}),brief:fn,chat:async()=>({summary:'ok'})}}
function reply(label){return{status:'ok',aiGenerated:true,provider:'test',model:'test',usedWeb:false,
  summary:label,eventCatalysts:[],dataWarnings:[],sources:[]}}
async function isolatedCache(){
  let calls=0;
  const service=createBriefingService({
    scanService:{run:async()=>snapshot()},
    gateway:gateway(async({context})=>{calls++;return reply('model focus '+(context.selected?.symbol||'global'))}),
    now:()=>T0,cacheMs:60000
  });
  const btc=await service.getBrief({selectedSymbol:'BTCUSDT'});
  const eth=await service.getBrief({selectedSymbol:'ETHUSDT'});
  const btcAgain=await service.getBrief({selectedSymbol:'BTCUSDT'});
  assert.equal(btc.selectedFocus.symbol,'BTCUSDT');
  assert.equal(eth.selectedFocus.symbol,'ETHUSDT');
  assert.equal(btcAgain.selectedFocus.symbol,'BTCUSDT');
  assert.equal(btc.summary,btcAgain.summary,'original symbol cache should be preserved');
  assert.notEqual(btc.summary,eth.summary,'other symbol must not reuse previous AI brief');
  assert.equal(calls,2,'one AI call per selected symbol, no cross-symbol pollution');
}
async function narrativeAsOf(){
  let clock=T0,modelCalls=0;
  const service=createBriefingService({
    scanService:{run:async()=>snapshot(clock)},
    gateway:gateway(async()=>{modelCalls++;return reply('original AI narrative')}),
    now:()=>clock,cacheMs:0,eventRefreshMs:300000
  });
  const first=await service.getBrief({selectedSymbol:'BTCUSDT'});
  assert.equal(first.narrativeScanAsOf,T0);
  assert.equal(first.narrativeReused,false);
  clock+=60000;
  const second=await service.getBrief({selectedSymbol:'BTCUSDT'});
  assert.equal(modelCalls,1,'no unnecessary repeated AI call for unchanged signals');
  assert.equal(second.scanUpdatedAt,clock,'market scan must remain fresh');
  assert.equal(second.narrativeScanAsOf,T0,'AI provenance must remain original');
  assert.equal(second.narrativeReused,true,'reused AI narrative must be identified');
  assert(second.dataWarnings.some(s=>s.includes('이전 스캔 기준')));
  clock+=60000;
  const third=await service.getBrief({selectedSymbol:'BTCUSDT'});
  assert.equal(third.narrativeScanAsOf,T0,'repeated reuse must not silently reset AI provenance');
  assert.equal(third.dataWarnings.filter(s=>s.includes('이전 스캔 기준')).length,1,'warning must not duplicate');
}
function qualityGates(){
  const good=snapshot(T0);
  assert.equal(Analyst.dataQuality(good,T0).state,'LIVE');
  assert.equal(Analyst.dataQuality({...good,pulseAiScanSource:'last-good',partial:true},T0).state,'PARTIAL');
  assert.equal(Analyst.dataQuality({...good,marketCoverage:{futures:0,spot:0,both:0}},T0).state,'DEGRADED');
  assert.equal(Analyst.dataQuality({...good,updatedAt:T0-400000},T0).state,'STALE');
}
(async()=>{await isolatedCache();await narrativeAsOf();qualityGates();console.log('Pulse AI cache isolation/provenance/data-quality PASS');})()
.catch(e=>{console.error(e);process.exitCode=1});

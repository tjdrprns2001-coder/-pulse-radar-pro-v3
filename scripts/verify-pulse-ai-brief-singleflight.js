'use strict';
const assert=require('node:assert/strict');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');

const now=Date.now();
function scan(){
  return{
    status:'ok',updatedAt:now,scanCount:2,partial:false,
    dataHealth:{live:2,errors:0,blocked:0,delayed:0},
    marketCoverage:{spot:2,futures:2,both:0,total:2},
    marketBreadth:{count:2,up:1,down:1,flat:0,median:0,
      majors:{BTC:0.8,ETH:-0.5,SOL:0}},
    items:[
      {symbol:'BTCUSDT',category:'급등 전조 관찰',sector:'L1',
        candidateScore:52,preIgnitionScore:38,priority:50,
        dataState:'live',futuresListed:true,spotListed:true,
        priceChange24h:0.8,oiChangePct:0.2,takerRatio:1.1},
      {symbol:'ETHUSDT',category:'급등 전조 관찰',sector:'L1',
        candidateScore:48,preIgnitionScore:30,priority:40,
        dataState:'live',futuresListed:true,spotListed:true,
        priceChange24h:-0.5,oiChangePct:0.1,takerRatio:1.0}
    ]
  };
}
function gateway(brief){
  return{
    available:true,provider:'mock',model:'mock',
    brief,health:()=>({provider:'mock',model:'mock',available:true}),
    chat:async()=>({summary:'test answer'})
  };
}
function aiResult(){
  return{
    status:'ok',usedWeb:false,provider:'mock',model:'mock',
    summary:'검증된 시장 근거 요약',eventCatalysts:[],dataWarnings:[],sources:[]
  };
}
async function testSingleflight(){
  let scanCalls=0,aiCalls=0,marketCalls=0,resolveAi;
  const pendingAi=new Promise(resolve=>{resolveAi=resolve});
  const svc=createBriefingService({
    scanService:{run:async()=>{scanCalls++;return scan()}},
    gateway:gateway(async()=>{aiCalls++;return pendingAi}),
    marketIntelService:{getOverview:async()=>{marketCalls++;return{health:{available:true},global:null,trending:[]}}},
    cacheMs:0,eventRefreshMs:300000,now:()=>now
  });
  const a=svc.getBrief({selectedSymbol:'BTCUSDT'});
  const b=svc.getBrief({selectedSymbol:'BTCUSDT'});
  assert.strictEqual(a,b,'identical brief requests must return the same in-flight promise');
  resolveAi(aiResult());
  const [one,two]=await Promise.all([a,b]);
  assert.equal(one.status,'ok');
  assert.equal(two.status,'ok');
  assert.equal(scanCalls,1,'singleflight must deduplicate scanner');
  assert.equal(aiCalls,1,'singleflight must deduplicate AI calls');
  assert.equal(marketCalls,1,'singleflight must deduplicate enrichment');

  // New scan required with zero TTL, but no new web call if the last web
  // attempt declined grounding and there are no material market changes.
  const fresh=await svc.getBrief({selectedSymbol:'BTCUSDT'});
  assert.equal(fresh.status,'ok');
  assert.equal(scanCalls,2);
  assert.equal(aiCalls,1,'skipped web search must not trigger unbounded AI calls');

  // Explicit fresh scans still fetch data even when a cached market summary exists.
  const forced=await svc.getBrief({selectedSymbol:'BTCUSDT',force:true});
  assert.equal(forced.status,'ok');
  assert.equal(scanCalls,3);
}

async function testDifferentSymbols(){
  let scans=0;
  const svc=createBriefingService({
    scanService:{run:async()=>{scans++;return scan()}},
    gateway:gateway(async()=>aiResult()),
    cacheMs:0,now:()=>now
  });
  const [btc,eth]=await Promise.all([
    svc.getBrief({selectedSymbol:'BTCUSDT'}),
    svc.getBrief({selectedSymbol:'ETHUSDT'})
  ]);
  assert.equal(btc.selectedFocus.symbol,'BTCUSDT');
  assert.equal(eth.selectedFocus.symbol,'ETHUSDT');
  assert.equal(scans,2,'different symbols keep independent briefing contexts');
}

(async()=>{
  await testSingleflight();
  await testDifferentSymbols();
  console.log('Pulse AI brief singleflight and web refresh cooldown PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

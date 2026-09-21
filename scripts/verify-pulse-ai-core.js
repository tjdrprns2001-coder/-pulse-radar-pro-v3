const assert=require('assert');
const {detectEvents}=require('../lib/pulse-ai/event-detector.js');
const {buildContext}=require('../lib/pulse-ai/context-builder.js');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
const {enrichCatalysts,summarizeCatalysts}=require('../lib/pulse-ai/event-catalyst.js');

const base={status:'ok',updatedAt:1000,scanCount:3,items:[
 {symbol:'AAAUSDT',category:'급등 전조 관찰',sector:'AI',candidateScore:55,priority:90,dataState:'live',reasons:['r1'],tfState:{'1h':'up'}},
 {symbol:'BBBUSDT',category:'매수세 유입',sector:'AI',candidateScore:40,priority:70,dataState:'live',reasons:['r2'],tfState:{}},
 {symbol:'CCCUSDT',category:'거래량 이상징후',sector:'DeFi',candidateScore:45,priority:60,dataState:'live',reasons:['r3'],tfState:{}}
]};

let d=detectEvents(base,JSON.parse(JSON.stringify(base)));
assert.equal(d.material,false,'unchanged scans must be suppressed');
const prev=JSON.parse(JSON.stringify(base));prev.items[0].category='매수세 유입';prev.items[0].candidateScore=25;
d=detectEvents(base,prev);
assert.equal(d.material,true);assert(d.events.some(e=>e.symbol==='AAAUSDT'&&e.type==='presurge_transition'));
const clustered=JSON.parse(JSON.stringify(base));clustered.items[1].category='급등 전조 관찰';
d=detectEvents(clustered,prev);assert(d.sectorClusters.some(x=>x.sector==='AI'));
const bad=JSON.parse(JSON.stringify(base));bad.items[0].dataState='failed';
d=detectEvents(bad,base);assert(d.events.some(e=>e.type==='data_warning'));
const withMissing=JSON.parse(JSON.stringify(base));withMissing.items[0].fundingPct=null;
const ctx=buildContext(withMissing,detectEvents(withMissing,prev),{maxSymbols:2});
assert(ctx.symbols.length<=2,'context must be bounded');
const a=ctx.symbols.find(x=>x.symbol==='AAAUSDT');if(a)assert.equal(a.fundingPct,null,'missing values must remain null');
assert(!JSON.stringify(ctx).includes('OPENAI_API_KEY'));
const eventNow=Date.UTC(2026,8,21,4,0,0);
const enriched=enrichCatalysts([{symbol:'AAA',eventType:'mainnet',titleKo:'메인넷 업그레이드',summaryKo:'공식 일정',eventTime:'2026-09-22T04:00:00Z',sourceTier:'A',sourceName:'AAA 공식',sourceUrl:'https://example.com/official',confirmed:true}],base,eventNow);
assert.equal(enriched[0].eventTypeKo,'메인넷');
assert.equal(enriched[0].sourceTierKo,'공식 확정');
assert.equal(enriched[0].timingKo,'D-1');
assert.equal(enriched[0].technicalStateKo,'기술 신호 동반');
assert(enriched[0].catalystScore>0);
assert(summarizeCatalysts(enriched,true).includes('공식·신뢰 이벤트 1건'));

(async()=>{
  const scanService={run:async()=>base};
  const quotaError=new Error('Gemini request failed: 429 RESOURCE_EXHAUSTED secret provider details');quotaError.statusCode=429;
  const gateway={available:true,brief:async()=>{throw quotaError}};
  const marketIntelService={getOverview:async()=>({health:{binance:'ok',coinGecko:'ok',coinMarketCap:'ok'},global:{marketCapUsd:2500000000000,volume24hUsd:90000000000},trending:[{symbol:'AAA',name:'AAA'}],categories:[{name:'AI'}],warnings:[]})};
  const service=createBriefingService({scanService,gateway,marketIntelService,cacheMs:0,now:()=>2000});
  const out=await service.getBrief();
  assert.equal(out.aiGenerated,false,'quota exhaustion must use deterministic fallback');
  assert.equal(out.aiAvailable,true,'configured AI remains available even when quota is exhausted');
  assert(String(out.summary).includes('시장 데이터 자동 요약'),'fallback must clearly identify deterministic market-data summary');
  assert(String(out.summary).includes('AAAUSDT'),'fallback summary should include highest-priority live symbol');
  assert(!JSON.stringify(out).includes('RESOURCE_EXHAUSTED'),'provider internals must not reach the UI');
  assert(!JSON.stringify(out).includes('secret provider details'),'raw provider errors must be hidden');
  assert((out.dataWarnings||[]).some(x=>String(x).includes('AI 사용량 한도')),'quota failure should show a short Korean status');
  console.log('pulse ai core PASS');
})().catch(e=>{console.error(e);process.exit(1)});

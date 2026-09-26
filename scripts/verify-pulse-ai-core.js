'use strict';
const assert=require('assert');
const {detectEvents}=require('../lib/pulse-ai/event-detector.js');
const {buildContext}=require('../lib/pulse-ai/context-builder.js');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
const {enrichCatalysts,summarizeCatalysts}=require('../lib/pulse-ai/event-catalyst.js');
const Analyst=require('../lib/pulse-ai/deterministic-analyst.js');

const base={status:'ok',updatedAt:1000,scanCount:5,partial:false,dataHealth:{live:5,delayed:0,blocked:0,errors:0},
 marketBreadth:{count:5,up:3,down:2,flat:0,median:.7,majors:{BTC:-.5,ETH:-.8,SOL:1.2}},
 candidateSymbols:['AAAUSDT','BBBUSDT','DDDUSDT'],categories:{'급등 전조 관찰':4,'이미 급등함':1},
 items:[
 {symbol:'AAAUSDT',category:'급등 전조 관찰',sector:'AI',candidateScore:55,preIgnitionScore:44,priority:90,dataState:'live',futuresListed:true,spotListed:true,quoteVolume24h:50e6,priceChange24h:2,reasons:['r1'],scanClass:{key:'PATTERN-SETUP',label:'패턴 셋업'},volumeAcceleration:2,takerRatio:1.1,oiChangePct:.5},
 {symbol:'BBBUSDT',category:'급등 전조 관찰',sector:'AI',candidateScore:40,preIgnitionScore:36,priority:70,dataState:'live',futuresListed:true,spotListed:true,quoteVolume24h:40e6,priceChange24h:1,reasons:['r2'],scanClass:{key:'SECTOR-ROTATION',label:'섹터 순환'}},
 {symbol:'CCCUSDT',category:'급등 전조 관찰',sector:'DeFi',candidateScore:45,preIgnitionScore:30,priority:60,dataState:'live',futuresListed:false,spotListed:true,quoteVolume24h:10e6,priceChange24h:3,reasons:['r3'],scanClass:{key:'SECTOR-ROTATION',label:'섹터 순환'}},
 {symbol:'DDDUSDT',category:'급등 전조 관찰',sector:'DeFi',candidateScore:48,preIgnitionScore:33,priority:65,dataState:'live',futuresListed:true,spotListed:false,quoteVolume24h:30e6,priceChange24h:4,reasons:['r4'],scanClass:{key:'PATTERN-SETUP',label:'패턴 셋업'}},
 {symbol:'HOTUSDT',category:'이미 급등함',sector:'Meme',candidateScore:90,preIgnitionScore:90,priority:100,dataState:'live',futuresListed:true,quoteVolume24h:100e6,priceChange24h:35,reasons:['already']}
 ]};

let d=detectEvents(base,JSON.parse(JSON.stringify(base)));
assert.equal(d.material,false,'unchanged scans must be suppressed');
const prev=JSON.parse(JSON.stringify(base));
prev.items[0].category='매수세 유입';prev.items[0].candidateScore=25;prev.items[0].volumeAcceleration=1;prev.items[0].takerRatio=.8;prev.items[0].oiChangePct=0;
d=detectEvents(base,prev);
assert(d.events.some(e=>e.symbol==='AAAUSDT'&&e.type==='presurge_transition'));
const crossed=JSON.parse(JSON.stringify(base));crossed.items[0].volumeAcceleration=3.5;crossed.items[0].takerRatio=1.35;crossed.items[0].oiChangePct=1.4;
d=detectEvents(crossed,prev);
assert(d.events.some(e=>e.type==='volume_spike'),'volume threshold crossing');
assert(d.events.some(e=>e.type==='taker_buy'),'taker threshold crossing');
assert(d.events.some(e=>e.type==='oi_build'),'OI threshold crossing');
const bad=JSON.parse(JSON.stringify(base));bad.items[0].dataState='failed';
d=detectEvents(bad,base);assert(d.events.some(e=>e.type==='data_warning'));

const researchStatus={version:'RESEARCH_AI_v2',shadowOnly:true,observations:5,pending:5,labels:0,positive:0,negative:0,model:{state:'SHADOW',active:false,minimumLabels:20}};
const ctx=buildContext(base,detectEvents(base,prev),{maxSymbols:2,researchStatus,selectedSymbol:'AAAUSDT'});
assert(ctx.symbols.length<=2,'context must be bounded');
assert.equal(ctx.selected.symbol,'AAAUSDT');
assert.equal(ctx.researchAI.labels,0);
assert(!JSON.stringify(ctx).includes('GEMINI_API_KEY'));
assert(!JSON.stringify(ctx).includes('OPENAI_API_KEY'));

const candidates=Analyst.topCandidates(base,8);
assert(candidates.some(x=>x.symbol==='AAAUSDT'),'normal candidate should remain');
assert(!candidates.some(x=>x.symbol==='HOTUSDT'),'already surged coin must be excluded from pre-ignition priority');
assert.equal(Analyst.marketPulse(base).regime,'MIXED');
const answer=Analyst.deterministicAnswer({question:'AAA 지금 어때?',selectedSymbol:'AAAUSDT',scan:base,researchStatus});
assert(answer.answer.includes('AAAUSDT'),'local chat must answer selected symbol');
const researchAnswer=Analyst.deterministicAnswer({question:'Research AI 학습 상태',scan:base,researchStatus});
assert(researchAnswer.answer.includes('5개'),'local chat must answer research state');

const eventNow=Date.UTC(2026,8,21,4,0,0);
const enriched=enrichCatalysts([
 {symbol:'AAA',eventType:'mainnet',titleKo:'메인넷 업그레이드',summaryKo:'공식 일정',eventTime:'2026-09-22T04:00:00Z',sourceTier:'A',sourceName:'AAA 공식',sourceUrl:'https://example.com/official',confirmed:true},
 {symbol:'AAA',eventType:'mainnet',titleKo:'중복',summaryKo:'중복',eventTime:'2026-09-22T04:00:00Z',sourceTier:'A',sourceName:'AAA 공식',sourceUrl:'https://example.com/official',confirmed:true}
],base,eventNow);
assert.equal(enriched.length,1,'duplicate catalysts must collapse');
assert.equal(enriched[0].eventTypeKo,'메인넷');assert.equal(enriched[0].timingKo,'D-1');assert(enriched[0].catalystScore>0);
assert(summarizeCatalysts(enriched,true).includes('공식·신뢰 이벤트 1건'));

(async()=>{
  const scanService={run:async()=>JSON.parse(JSON.stringify(base))};
  const researchAI={hydrateRemote:async()=>true,status:()=>researchStatus};
  const gateway={available:false,provider:'gemini',model:'gemini-test',brief:async()=>{throw new Error('must not call')},chat:async()=>{throw new Error('must not call')}};
  const service=createBriefingService({scanService,gateway,researchAI,cacheMs:0,now:()=>2000});
  const out=await service.getBrief({selectedSymbol:'AAAUSDT'});
  assert.equal(out.aiGenerated,false);assert.equal(out.aiAvailable,false);
  assert(out.summary.includes('시장 상태'),'fallback should be useful local market analysis');
  assert(out.candidates.some(x=>x.symbol==='AAAUSDT'));
  assert(!out.candidates.some(x=>x.symbol==='HOTUSDT'));
  assert.equal(out.selectedFocus.symbol,'AAAUSDT');
  assert.equal(out.researchAI.model.state,'SHADOW');
  const chat=await service.chat({question:'AAA 지금 어때?',selectedSymbol:'AAAUSDT'});
  assert.equal(chat.answerMode,'deterministic');assert(chat.answer.includes('AAAUSDT'));
  const health=await service.health();assert.equal(health.status,'ok');assert.equal(health.aiAvailable,false);
  console.log('pulse ai core PASS');
})().catch(e=>{console.error(e);process.exit(1)});

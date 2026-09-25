const assert=require('assert');
const {createScanService,applySectorRotation,AUTO_DEEP_MAX_24H_PCT,fastCandidatePriority,deepPreIgnitionScore}=require('../lib/coin-scan/scan-service.js');
const handler=require('../api/coin-scan.js');

function frame(base=100){return Array.from({length:60},(_,i)=>[0,String(base+i*.1),String(base+i*.1+1),String(base+i*.1-1),String(base+i*.1+.2),String(1000+i*10),Date.now()-1000,String((1000+i*10)*(base+i*.1)),10,'550',String((1000+i*10)*(base+i*.1)*.56),0])}
const exchangeInfo={symbols:Array.from({length:45},(_,i)=>({symbol:`C${i}USDT`,baseAsset:`C${i}`,quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}))};
const tickers=exchangeInfo.symbols.map((s,i)=>({symbol:s.symbol,lastPrice:'1',quoteVolume:String(10000000+i),priceChangePercent:String(i===0?30:2)}));
let deepCalls=[];
const provider={
  failAll:false,
  async getUniverse(){if(this.failAll)throw new Error('upstream down');return exchangeInfo},
  async getTickers(){if(this.failAll)throw new Error('upstream down');return tickers},
  async scanDeepCandidates(symbols,intervals){deepCalls.push(symbols.slice());const results={},errors=[];for(const s of symbols){if(s==='C1USDT'){errors.push({symbol:s,interval:'1h',error:'boom'});continue}if(s==='C2USDT'){const partial=intervals.filter(tf=>tf!=='5m');results[s]=Object.fromEntries(partial.map(tf=>[tf,frame()]));errors.push({symbol:s,interval:'5m',error:'partial'});continue}results[s]=Object.fromEntries(intervals.map(tf=>[tf,frame()]))}return{results,errors,contexts:{}}}
};
(async()=>{
  const earlyFast=fastCandidatePriority({row:{symbol:'EARLYUSDT',futuresListed:true,spotListed:true,marketScope:'spot+futures'},evidence:{priceChange24h:2,quoteVolume24h:25000000,spotFuturesBasisPct:.1},fast:{candidateScore:48,alreadySurged:false}});
  const extendedFast=fastCandidatePriority({row:{symbol:'LATEUSDT',futuresListed:true,marketScope:'futures'},evidence:{priceChange24h:15,quoteVolume24h:25000000},fast:{candidateScore:80,alreadySurged:false}});
  assert.equal(AUTO_DEEP_MAX_24H_PCT,12,'automatic deep-scan extension cutoff must stay aligned with recommendation guard');
  assert(earlyFast.eligible&&earlyFast.score>48,'quiet liquid futures candidate should receive pre-ignition priority boost');
  assert.equal(extendedFast.eligible,false,'already-extended 24H price must be excluded from automatic deep scan');
  assert.equal(extendedFast.reason,'PRICE_EXTENDED');
  const earlyDeep=deepPreIgnitionScore({dataState:'live',scanClass:{key:'PRE-SURGE'},candidateScore:62,tradeSignal:{confidence:66},priceChange24h:2,priceChange1h:1,priceChange15m:.3,v3LongTier:'PASS',v2Type:'A-pre',preSurge:{label:'관찰'},structure:'bullish',reaccumulating:true,oi4hChangePct:3,trueTakerRatio:1.25,v3Rvol:{main1h:{value:1.8},ignition15m:{value:2.1}},momentumSignals:{overheated:false}});
  const lateDeep=deepPreIgnitionScore({dataState:'live',scanClass:{key:'PRE-SURGE'},candidateScore:90,tradeSignal:{confidence:90},priceChange24h:14,priceChange1h:2,priceChange15m:1,v3LongTier:'PASS',v2Type:'A',structure:'bullish'});
  assert(earlyDeep>=60,'aligned pre-ignition structure should receive a high readiness score');
  assert.equal(lateDeep,0,'extended price must hard-zero pre-ignition ranking');

  const rotated=applySectorRotation([
    {symbol:'LEADERUSDT',sector:'AI',dataState:'live',priceChange24h:8,scanClass:{key:'POST-SURGE'},reasons:[],structure:'bullish',summary:''},
    {symbol:'LAGUSDT',sector:'AI',dataState:'live',priceChange24h:2,scanClass:{key:'ANOMALY'},reasons:[],structure:'neutral',summary:''},
    {symbol:'OTHERUSDT',sector:'RWA',dataState:'live',priceChange24h:1,scanClass:{key:'ANOMALY'},reasons:[],structure:'neutral',summary:''}
  ]);
  assert.equal(rotated.find(x=>x.symbol==='LAGUSDT').scanClass.key,'SECTOR-ROTATION','same-sector laggard should become sector rotation');
  assert.equal(rotated.find(x=>x.symbol==='OTHERUSDT').scanClass.key,'ANOMALY','unrelated sector must not be relabeled');

  const service=createScanService({provider,now:()=>123456});
  deepCalls=[];
  const out=await service.run({mode:'summary',limit:100});
  assert.equal(out.status,'ok');
  assert.equal(out.scanCount,45);
  assert.equal(out.deepScanCount,0,'summary must not launch expensive 6TF deep scan');
  assert.equal(deepCalls.length,0,'summary path must stay fast');
  assert(Array.isArray(out.candidateSymbols)&&out.candidateSymbols.length>0,'summary returns candidate symbols for progressive enrichment');
  assert(!out.candidateSymbols.includes('C0USDT'),'24H +30% symbol must not consume automatic deep-scan capacity');
  assert(out.candidateSelection&&out.candidateSelection.version==='PREIGNITION_SELECTION_v1','candidate selection audit metadata required');
  assert(out.candidateSelection.extendedExcludedCount>=1,'candidate selection metadata must count extended exclusions');
  assert.equal(out.candidateSelection.max24hAutoDeepPct,12);
  assert(out.categories&&typeof out.categories==='object');
  assert(out.scanClasses&&typeof out.scanClasses==='object','v2 scan class counts required');
  assert(out.marketBreadth&&Number.isFinite(out.marketBreadth.up),'market breadth summary required');
  assert(out.dataHealth&&typeof out.dataHealth.live==='number');
  for(const x of out.items.slice(0,3)){
    for(const k of ['symbol','category','scanClass','sector','priority','dataState','reasons','tfState','summary','updatedAt','tradeSignal'])assert(Object.prototype.hasOwnProperty.call(x,k),`${k} required`);
    assert(x.scanClass&&typeof x.scanClass.key==='string','scanClass key required');
    assert(typeof x.scanClass.label==='string'&&x.scanClass.label.length>0,'Korean scanClass label required');
    assert(['매수 후보','관찰','제외'].includes(x.tradeSignal.level));
    assert(Number.isFinite(x.tradeSignal.confidence));
    assert(Array.isArray(x.tradeSignal.reasons));
    assert(Array.isArray(x.tradeSignal.invalidations));
  }

  deepCalls=[];
  const deep=await service.run({mode:'deep',symbols:['C0USDT','C1USDT','C2USDT'],limit:10});
  assert.equal(deep.scanCount,45);
  assert.equal(deep.deepScanCount,3);
  assert.equal(deepCalls.length,1);
  assert.deepEqual(deepCalls[0],['C0USDT','C1USDT','C2USDT']);
  for(const sym of ['C1USDT','C2USDT']){const failed=deep.items.find(x=>x.symbol===sym);assert(failed&&failed.category==='데이터 부족·판정 보류',`${sym} partial/missing TF must block`);assert.equal(failed.scanClass.key,'STALE',`${sym} failed data must map to STALE`);assert.equal(failed.tradeSignal.level,'제외',`${sym} blocked data cannot become a trade candidate`)}
  assert(deep.items.find(x=>x.symbol==='C0USDT'),'deep mode returns requested symbol');
  assert.equal(deep.items.find(x=>x.symbol==='C0USDT').preIgnitionScore,0,'manual deep scan may inspect an extended symbol but must rank it out of pre-ignition candidates');
  assert.equal(deep.items.find(x=>x.symbol==='C0USDT').autoDeepEligible,false,'manual deep scan must preserve automatic-deep exclusion audit');

  let recorderCalls=0;
  const recorder={async recordItems(items){recorderCalls++;assert(items.length>0);throw new Error('blob down')}};
  const isolated=createScanService({provider,now:()=>222222,performanceRecorder:recorder});
  const isolatedDeep=await isolated.run({mode:'deep',symbols:['C0USDT'],limit:1});
  assert.equal(isolatedDeep.status,'ok','recorder failure must not fail scan');
  assert.equal(recorderCalls,1,'deep scan should invoke performance recorder once');
  assert(Number.isFinite(isolatedDeep.items[0]?.lastPrice),'deep item must expose finite lastPrice for immutable snapshot');

  let transitionCalls=0;
  const transitionRecorder={
    async observe({items,framesBySymbol}){transitionCalls++;assert(items.length===1);assert(framesBySymbol.C0USDT);items[0].eventSnapshotId='EV-A';items[0].isTransitionEvent=true;return{observed:1,transitions:1,archived:1,duplicates:0,skipped:0,errors:[]}},
    async get(id){return id==='EV-A'?{eventId:'EV-A',symbol:'C0USDT',records:[{snapshotId:'S1'}]}:null},
    async list(){return[{eventId:'EV-A',symbol:'C0USDT',detectedAt:222222,records:[{snapshotId:'S1'}],snapshotIds:['S1']}]}
  };
  const transitionService=createScanService({provider,now:()=>222222,transitionSnapshotRecorder:transitionRecorder});
  const transitionDeep=await transitionService.run({mode:'deep',symbols:['C0USDT'],limit:1});
  assert.equal(transitionCalls,1,'deep scan must invoke transition snapshot recorder at detection time');
  assert.equal(transitionDeep.transitionSnapshotRecording.archived,1);
  assert.equal(transitionDeep.items[0].eventSnapshotId,'EV-A');

  let recommendationHistoryCalls=0;
  const recommendationHistory={
    async observe(bundle,context){recommendationHistoryCalls++;assert(bundle&&Array.isArray(bundle.recommended));assert(context&&context.marketSource);return{observed:2,recorded:1,duplicates:0,skipped:1,errors:[]}},
    async evaluateDue(){return{attempted:1,evaluated:1,unavailable:0,pending:0,errors:[]}},
    async stats(){return{sampleCount:3,horizons:{h1:{evaluatedCount:2,positiveRatio:.5,meanReturnPct:1.2}}}},
    async list(){return[{id:'AAA:RECOMMEND:NEW:1',symbol:'AAAUSDT',state:'RECOMMEND',label:'자동 추천',score:81,capturedAt:222222,direction:'NEW'}]}
  };
  const recService=createScanService({provider,now:()=>222222,recommendationHistory});
  const recDeep=await recService.run({mode:'deep',symbols:['C0USDT'],limit:1});
  assert.equal(recommendationHistoryCalls,1,'deep scan must record automatic recommendation history once');
  assert(recDeep.autoRecommendationRecording&&recDeep.autoRecommendationRecording.recorded===1);
  assert(recDeep.autoRecommendationEvaluation&&recDeep.autoRecommendationEvaluation.evaluated===1,'deep scan should evaluate due recommendation outcomes');

  const cat=out.items[0]?.category;
  if(cat){const f=await service.run({mode:'summary',category:cat,limit:10});assert(f.items.every(x=>x.category===cat))}
  const sector=out.items.find(x=>x.sector)?.sector;
  if(sector){const f=await service.run({mode:'summary',sector,limit:10});assert(f.items.every(x=>x.sector===sector))}
  assert((await service.run({mode:'summary',limit:3})).items.length<=3);

  provider.failAll=true;
  const fallback=await service.run({mode:'summary',limit:100});
  assert.equal(fallback.partial,true);
  assert(fallback.items.every(x=>x.dataState==='delayed'));
  assert(fallback.items.every(x=>x.scanClass?.key==='STALE'),'delayed fallback must map to STALE');
  assert(!fallback.items.some(x=>x.category==='급등 전조 강함'),'delayed fallback cannot stay strong');
  assert(fallback.items.every(x=>x.tradeSignal?.level==='제외'),'delayed fallback cannot expose buy candidates');
  provider.failAll=false;

  const req={query:{mode:'deep',symbols:'C0USDT,C3USDT',limit:'2'}};let code=0,body=null,headers={};
  const res={setHeader(k,v){headers[k]=v},status(n){code=n;return this},json(v){body=v;return v}};
  await handler(req,res,{service});
  assert.equal(code,200);assert.equal(body.status,'ok');assert.equal(body.deepScanCount,2);assert(String(headers['Cache-Control']).includes('stale-while-revalidate'));

  code=0;body=null;headers={};
  await handler({query:{mode:'event-snapshots',action:'get',eventId:'EV-A'}},res,{service:transitionService});
  assert.equal(code,200);assert.equal(body.bundle.eventId,'EV-A');assert(String(headers['Cache-Control']).includes('no-store'));
  code=0;body=null;headers={};
  await handler({query:{mode:'event-snapshots',action:'list',symbol:'C0USDT'}},res,{service:transitionService});
  assert.equal(code,200);assert.equal(body.items[0].eventId,'EV-A');
  code=0;body=null;headers={};
  await handler({query:{mode:'recommendation-history',limit:'5'}},res,{service:recService});
  assert.equal(code,200);assert.equal(body.mode,'recommendation-history');assert.equal(body.items[0].symbol,'AAAUSDT');assert(String(headers['Cache-Control']).includes('no-store'));
  code=0;body=null;headers={};
  await handler({query:{mode:'recommendation-history',action:'stats'}},res,{service:recService});
  assert.equal(code,200);assert.equal(body.action,'stats');assert.equal(body.stats.sampleCount,3);
  code=0;body=null;headers={};
  await handler({query:{mode:'recommendation-history',action:'evaluate'}},res,{service:recService});
  assert.equal(code,200);assert.equal(body.action,'evaluate');assert.equal(body.evaluation.evaluated,1);
  code=0;body=null;headers={};
  const callsBefore=recommendationHistoryCalls;
  await handler({method:'POST',query:{mode:'recommendation-history',action:'observe'},body:{symbol:'AAAUSDT',state:'RECOMMEND',label:'자동 추천',score:82,reasons:['Book AI persisted CONFIRMED'],missing:[],invalidations:[],marketSource:'book-ai-client',item:{lastPrice:10,scanClass:{key:'PRE-SURGE'},v2Type:'A-pre',v3LongTier:'PASS',bookConfirmedRuleIds:['LIQUIDITY_SWEEP_RECLAIM']}}},res,{service:recService});
  assert.equal(code,200);assert.equal(body.action,'observe');assert(recommendationHistoryCalls>callsBefore,'promotion POST must reach recommendation history');
  code=0;body=null;headers={};
  await handler({method:'POST',query:{mode:'recommendation-history',action:'observe'},body:{symbol:'BAD!',state:'BOGUS'}},res,{service:recService});
  assert.equal(code,400,'invalid promotion state must be rejected');

  console.log('coin scan api PASS');
})().catch(e=>{console.error(e);process.exit(1)});

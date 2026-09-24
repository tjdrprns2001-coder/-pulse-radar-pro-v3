'use strict';
const assert=require('assert');
const {createMemoryStore}=require('../lib/signal-performance/store.js');
const {createRecommendationHistoryService}=require('../lib/coin-scan/recommendation-history.js');

(async()=>{
  let now=1_800_000_000_000;
  const store=createMemoryStore();
  const resolver={async resolve(symbol,targetTs,nowTs){if(nowTs<targetTs)return{status:'pending',targetTs};const hours=Math.round((targetTs-1_800_000_000_000)/3600000);const price=hours<=1?11:hours<=4?12:13;return{status:'evaluated',targetTs,marketTs:targetTs,price}}};
  const svc=createRecommendationHistoryService({store,resolver,now:()=>now,cooldownMs:30*60*1000,scoreDelta:8,maxEvaluationsPerRun:10});
  const base={symbol:'AAAUSDT',state:'WATCH',label:'관찰',score:61,reasons:['구조 양호'],missing:['taker'],invalidations:[],item:{lastPrice:10,scanClass:{key:'ACCUMULATION-PRE'},v2Type:'A-pre',v3LongTier:'SOFT_FAIL'}};
  let r=await svc.observe({recommended:[],watch:[base],wait:[],excluded:[]},{updatedAt:now,marketSource:'spot-fallback',derivativesSource:'cross-exchange-oi'});
  assert.equal(r.recorded,1,'first recommendation event must persist');
  r=await svc.observe({recommended:[],watch:[base],wait:[],excluded:[]},{updatedAt:now+60_000,marketSource:'spot-fallback'});
  assert.equal(r.recorded,0,'same state/score within cooldown must not spam history');
  now+=120_000;
  const promoted={...base,state:'RECOMMEND',label:'자동 추천',score:78,item:{...base.item,v3LongTier:'PASS'}};
  r=await svc.observe({recommended:[promoted],watch:[],wait:[],excluded:[]},{updatedAt:now,marketSource:'spot-fallback'});
  assert.equal(r.recorded,1,'WATCH to RECOMMEND transition must persist immediately');
  let rows=await svc.list({symbol:'AAAUSDT',limit:10});
  assert.equal(rows.length,2);
  assert.equal(rows[0].direction,'WATCH→RECOMMEND');
  assert.equal(rows[0].previousState,'WATCH');
  assert.equal(rows[0].price,10);
  assert.equal(rows[0].marketSource,'spot-fallback');

  now+=120_000;
  const up={...promoted,score:88};
  r=await svc.observe({recommended:[up],watch:[],wait:[],excluded:[]},{updatedAt:now});
  assert.equal(r.recorded,1,'meaningful score rise must persist');
  rows=await svc.list({state:'RECOMMEND',limit:10});
  assert(rows.some(x=>x.direction==='SCORE_UP'));

  now+=120_000;
  const tiny={...up,score:90};
  r=await svc.observe({recommended:[tiny],watch:[],wait:[],excluded:[]},{updatedAt:now});
  assert.equal(r.recorded,0,'small score move inside cooldown must be suppressed');

  now=1_800_000_000_000+25*3600000;
  const ev=await svc.evaluateDue();
  assert(ev.evaluated>=3,'due horizons should be evaluated');
  rows=await svc.list({symbol:'AAAUSDT',limit:10,includeOutcomes:true});
  const firstWithOutcome=rows.find(x=>x.outcome&&x.outcome.horizons?.h1?.status==='evaluated');
  assert(firstWithOutcome,'history list should include evaluated outcomes');
  assert(Number.isFinite(firstWithOutcome.outcome.horizons.h1.returnPct));
  const stats=await svc.stats({state:'RECOMMEND'});
  assert.equal(stats.cacheWarm,true,'recommendation stats should come from incremental cache');
  assert(stats.horizons.h1.evaluatedCount>=1);
  assert(stats.horizons.h1.positiveRatio>0);
  assert(Number.isFinite(stats.horizons.h1.bestReturnPct));
  assert(Number.isFinite(stats.horizons.h1.worstReturnPct));
  assert(['표본 부족','참고용','통계 사용 가능'].includes(stats.horizons.h1.sampleState));
  assert(stats.byScanClass&&stats.byScanClass['ACCUMULATION-PRE']);
  assert(stats.byV2Type&&stats.byV2Type['A-pre']);
  console.log('recommendation history PASS');
})().catch(e=>{console.error(e);process.exit(1)});

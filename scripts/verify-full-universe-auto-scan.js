'use strict';
const assert=require('assert');
const Core=require('../lib/coin-scan/full-universe-auto-scan.js');
const Cap=require('../lib/coin-scan/market-cap-provider.js');
let checks=0;const ok=(cond,msg)=>{checks++;assert(cond,msg)},eq=(a,b,msg)=>{checks++;assert.deepEqual(a,b,msg)};
(async()=>{
  eq(Core.VERSION,'FULL_UNIVERSE_AUTO_SCAN_v1','version');
  eq(Core.AUTO_INTERVAL_MS,1800000,'30m interval');eq(Core.AUTO_STALE_MS,90000,'stale run recovery threshold');
  eq(Core.TIMEFRAMES,['5m','15m','1h','4h','1d','1w'],'six timeframes');
  eq(Core.TIER_ORDER,['small','mid','large'],'tier order');
  eq(Core.autoBucketStart(0),0,'bucket zero');
  eq(Core.autoBucketStart(1799999),0,'same bucket');
  eq(Core.autoBucketStart(1800000),1800000,'next bucket');
  eq(Core.autoBucketKey(1800001),'auto:1800000','bucket key');
  eq(Core.normalizeTierSelection('large,small,small'),['small','large'],'tier normalize');
  eq(Core.normalizeTierSelection(['mid','bad']),['mid'],'tier invalid removed');
  const info={symbols:[{symbol:'AAAUSDT',baseAsset:'AAA',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'},{symbol:'BBBUSD',baseAsset:'BBB',quoteAsset:'USD',contractType:'PERPETUAL',status:'TRADING'},{symbol:'CCCUSDT',baseAsset:'CCC',quoteAsset:'USDT',contractType:'CURRENT_QUARTER',status:'TRADING'},{symbol:'DDDUSDT',baseAsset:'DDD',quoteAsset:'USDT',contractType:'PERPETUAL',status:'BREAK'}]};
  const u=Core.buildUniverse(info);eq(u.length,1,'universe strict');eq(u[0].symbol,'AAAUSDT','universe symbol');eq(u[0].baseAsset,'AAA','base asset');
  const rows=['A','B','C','D','E','F','G','H'].map((x,i)=>({symbol:x+'USDT',baseAsset:x}));
  const caps=new Map(rows.map((x,i)=>[x.baseAsset,(i+1)*100]));const tiered=Core.assignMarketCapTiers(rows,caps);
  eq(tiered.filter(x=>x.tier==='small').length,2,'small bottom 25');eq(tiered.filter(x=>x.tier==='mid').length,4,'mid middle 50');eq(tiered.filter(x=>x.tier==='large').length,2,'large top 25');
  eq(Core.selectUniverse(tiered,{kind:'auto',tiers:['small']}).length,8,'auto ignores size filter');eq(Core.selectUniverse(tiered,{kind:'manual',tiers:['small']}).length,2,'manual small');eq(Core.selectUniverse(tiered,{kind:'manual',tiers:['small','large']}).length,4,'manual multi select');eq(Core.selectUniverse(tiered,{kind:'manual',tiers:[]}).length,0,'manual requires tiers');
  const now=10000,kl=[[0,'10','12','9','11','100',5000],[5001,'11','13','10','12','200',9000],[9001,'12','14','11','13','300',15000]];const closed=Core.closedRows(kl,now);eq(closed.length,2,'incomplete candle excluded');const fs=Core.frameSummary(kl,now);eq(fs.closedBars,2,'summary closed bars');eq(fs.close,12,'summary last close');eq(fs.volume,200,'summary volume');ok(Math.abs(fs.barChangePct-9.090909)<0.001,'bar change');ok(fs.rvol20===2,'rvol');
  eq(Core.summarizeCounts(tiered),{total:8,small:2,mid:4,large:2,unknown:0},'tier counts');
  eq(Cap.cleanBase('1000PEPE'),'PEPE','market cap symbol normalization');eq(Cap.cleanBase('1000000MOG'),'MOG','million multiplier normalization');eq(Cap.cleanBase('BTC'),'BTC','normal base');
  let capCalls=0;const capProvider=Cap.createMarketCapProvider({now:()=>1,fetchImpl:async url=>{capCalls++;return{ok:true,json:async()=>url.includes('page=1')?[{symbol:'aaa',market_cap:1000},{symbol:'AAA',market_cap:900},{symbol:'bbb',market_cap:2000}]:[]}},pages:2,perPage:3});const capMap=await capProvider.resolve([{baseAsset:'AAA'},{baseAsset:'BBB'}]);eq(capMap.get('AAA'),1000,'largest duplicate cap wins');eq(capMap.get('BBB'),2000,'cap resolves');eq(capCalls,2,'pages fetched once');await capProvider.resolve([{baseAsset:'AAA'}]);eq(capCalls,2,'cap cache reused');
  let fallbackCalls=0;const fallbackCap=Cap.createMarketCapProvider({now:()=>2,fetchImpl:async url=>{fallbackCalls++;if(url.includes('coingecko.com'))return{ok:false,status:429,json:async()=>({})};return{ok:true,json:async()=>[{symbol:'MOG',quotes:{USD:{market_cap:12345}}},{symbol:'BTC',quotes:{USD:{market_cap:99999}}}]}}});const fallbackMap=await fallbackCap.resolve([{baseAsset:'1000000MOG'},{baseAsset:'BTC'}]);eq(fallbackMap.get('1000000MOG'),12345,'CoinPaprika fallback maps multiplier symbol');eq(fallbackCap.state.source,'coinpaprika','fallback source exposed');ok(fallbackCalls===2,'fallback called after CoinGecko failure');
  const cachedUniverseStore=Core.createMemoryFullScanStore();
  await cachedUniverseStore.createRun({id:'prior',kind:'auto',bucketKey:'prior',status:'DONE',completedAt:1,createdAt:1,updatedAt:1});
  await cachedUniverseStore.putItem('prior',{symbol:'BTCUSDT',baseAsset:'BTC',complete:true,tier:'large',marketCapUsd:1,frames:{},errors:[]});
  const blockedProvider={async getStrictFuturesUniverse(){throw new Error('Futures HTTP 418')},async getFundingMap(){return new Map()},async getFuturesKlines(){return[]},async getV2OiProfile(){return{}}};
  const cachedUniverseSvc=Core.createFullUniverseScanService({provider:blockedProvider,marketCapProvider:{async resolve(){return new Map([['BTC',100]])}},store:cachedUniverseStore,now:()=>5000,sleep:async()=>{},requestsPerMinute:999999});
  const cachedUniverse=await cachedUniverseSvc.loadUniverse();eq(cachedUniverse.map(x=>x.symbol),['BTCUSDT'],'418 recovery reuses last completed Binance universe');
  let strictCalls=0,fallbackUniverseCalls=0;
  const strictProvider={
    async getStrictFuturesUniverse(){strictCalls++;return{symbols:[{symbol:'BINANCEONLYUSDT',baseAsset:'BINANCEONLY',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'}]}},
    async getFuturesUniverse(){fallbackUniverseCalls++;return{symbols:[{symbol:'OTHERUSDT',baseAsset:'OTHER',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'}]}},
    async getFundingMap(){return new Map()},async getFuturesKlines(){return[]},async getV2OiProfile(){return{}}
  };
  const strictSvc=Core.createFullUniverseScanService({provider:strictProvider,marketCapProvider:{async resolve(){return new Map()}},store:Core.createMemoryFullScanStore(),now:()=>5000,sleep:async()=>{},requestsPerMinute:999999});
  const strictUniverse=await strictSvc.loadUniverse();eq(strictUniverse.map(x=>x.symbol),['BINANCEONLYUSDT'],'strict Binance universe selected');eq(strictCalls,1,'strict universe called');eq(fallbackUniverseCalls,0,'venue fallback universe not called');
  const provider={
    async getFuturesUniverse(){return{symbols:rows.map(x=>({symbol:x.symbol,baseAsset:x.baseAsset,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'}))}},
    async getFundingMap(){return new Map(rows.map(x=>[x.symbol,.01]))},
    async getFuturesKlines(symbol,tf){return[[0,1,2,.5,1,10,1],[2,1,2,.5,2,20,3],[4,2,3,1,3,30,5]]},
    async getV2OiProfile(){return{oi1hPct:1,oi4hPct:2,oi8hPct:3,oi12hPct:4,oi24hPct:5,oiDrawdownPct:-1}}
  };
  const marketCapProvider={async resolve(){return caps}};const store=Core.createMemoryFullScanStore();let t=1800000+1000;
  const svc=Core.createFullUniverseScanService({provider,marketCapProvider,store,now:()=>t,sleep:async()=>{},maxWorkers:3,requestsPerMinute:999999,klineRows:3});
  const auto=await svc.execute({kind:'auto'});eq(auto.status,'DONE','auto done');eq(auto.selectedCount,8,'auto scans entire universe');eq(auto.completedCount,8,'auto completed all');eq(auto.items.length,8,'auto items returned');eq(auto.items[0].fundingPct,.01,'funding included');eq(auto.items[0].oi.oi4hPct,2,'oi included');eq(Object.keys(auto.items[0].frames),Core.TIMEFRAMES,'all frame keys');ok(auto.items.every(x=>x.complete),'items complete');
  const again=await svc.execute({kind:'auto'});ok(again.skipped===true&&again.cacheHit===true,'same 30m bucket is cache hit');eq(again.id,auto.id,'same cached run');
  const manual=await svc.execute({kind:'manual',tiers:['small']});eq(manual.kind,'manual','manual kind');eq(manual.selectedCount,2,'manual selected tier only');eq(manual.items.length,2,'manual item count');
  t+=Core.AUTO_INTERVAL_MS;const auto2=await svc.execute({kind:'auto'});ok(auto2.id!==auto.id,'next 30m bucket creates new run');
  const latest=await store.latest();eq(latest.id,auto2.id,'latest cache get');eq(latest.items.length,8,'latest items');
  let active=0,maxActive=0;await Core.mapLimit([1,2,3,4,5],2,async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,2));active--});ok(maxActive<=2,'bounded worker concurrency');ok(maxActive===2,'worker pool parallel');
  let sleeps=[];let gateNow=0;const gate=Core.createSpacingGate({requestsPerMinute:60,now:()=>gateNow,sleep:async ms=>{sleeps.push(ms);gateNow+=ms}});await gate(async()=>{});await gate(async()=>{});eq(sleeps,[1000],'rate gate spacing');
  eq(Core.frameSummary([],now).available,false,'empty frame unavailable');eq(Core.assignMarketCapTiers([{symbol:'XUSDT',baseAsset:'X'}],{} )[0].tier,'unknown','unknown cap stays unknown');
  const failProvider={...provider,async getV2OiProfile(){throw new Error('oi fail')}};const failStore=Core.createMemoryFullScanStore();const failSvc=Core.createFullUniverseScanService({provider:failProvider,marketCapProvider,store:failStore,now:()=>9999999,sleep:async()=>{},maxWorkers:1,requestsPerMinute:999999});const fail=await failSvc.execute({kind:'manual',tiers:['small']});ok(fail.items.every(x=>x.complete===false),'oi failure marks incomplete');ok(fail.items.every(x=>x.errors.some(e=>e.source==='oi')),'oi failure preserved');
  const unknownCaps=Core.assignMarketCapTiers(rows,new Map([['A',100],['B',200]]));eq(unknownCaps.filter(x=>x.tier==='unknown').length,6,'unresolved caps explicit');eq(Core.selectUniverse(unknownCaps,{kind:'manual',tiers:['mid']}).length,0,'two resolved caps split into edge quartiles');
  let resumeT=7200000+1000,resumeKlines=0;
  const resumeProvider={...provider,async getFuturesKlines(symbol,tf){resumeKlines++;return[[0,1,2,.5,1,10,1],[2,1,2,.5,2,20,3],[4,2,3,1,3,30,5]]}};
  const resumeStore=Core.createMemoryFullScanStore(),resumeSvc=Core.createFullUniverseScanService({provider:resumeProvider,marketCapProvider,store:resumeStore,now:()=>resumeT,sleep:async()=>{},maxWorkers:2,requestsPerMinute:999999,staleRunMs:60000});
  const preparedResume=await resumeSvc.prepare({kind:'auto'});await resumeStore.putItem(preparedResume.run.id,{symbol:'AUSDT',tier:'small',complete:true,frames:{},errors:[]});
  const staleRun=resumeStore._runs.get(preparedResume.run.id);staleRun.status='RUNNING';staleRun.updatedAt=resumeT-120000;resumeStore._runs.set(staleRun.id,staleRun);
  const recovered=await resumeSvc.execute({kind:'auto'});eq(recovered.id,preparedResume.run.id,'stale run reuses bucket run id');ok(recovered.recovered===true,'stale run marked recovered');eq(recovered.resumedCount,1,'completed symbol resumed');eq(recovered.items.length,8,'recovered run returns full universe');eq(recovered.items.find(x=>x.symbol==='AUSDT').marketCapUsd,100,'resumed item receives refreshed market-cap metadata');eq(resumeKlines,42,'resumed symbol is not rescanned across six timeframes');
  const freshStore=Core.createMemoryFullScanStore(),freshSvc=Core.createFullUniverseScanService({provider,marketCapProvider,store:freshStore,now:()=>resumeT,sleep:async()=>{},maxWorkers:1,requestsPerMinute:999999,staleRunMs:60000});
  const freshPrepared=await freshSvc.prepare({kind:'auto'}),freshRun=freshStore._runs.get(freshPrepared.run.id);freshRun.status='RUNNING';freshRun.updatedAt=resumeT;freshStore._runs.set(freshRun.id,freshRun);
  const freshAttempt=await freshSvc.execute({kind:'auto'});ok(freshAttempt.skipped===true,'fresh running bucket is not duplicated');eq(freshAttempt.id,freshPrepared.run.id,'fresh running bucket id preserved');
  ok(checks>=76,'minimum checks');
  console.log(`full-universe auto-scan verification PASS (${checks} checks)`);
})().catch(e=>{console.error(e);process.exit(1)});

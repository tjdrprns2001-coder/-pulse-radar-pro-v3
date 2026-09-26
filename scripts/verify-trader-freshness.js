'use strict';
const assert=require('node:assert/strict');
const {createTraderService}=require('../lib/coin-scan/trader-service');
const {fixture,NOW}=require('./verify-trader-scan');
let clock=NOW,universeCalls=0,tickerCalls=0,frameCalls=0;
function live(){const f=fixture(),delta=clock-NOW;f.now=clock;f.ticker.closeTime=clock;f.execution.observedAt=clock;f.regime.observedAt=clock;for(const rows of Object.values(f.frames))for(const r of rows){r[0]+=delta;r[6]+=delta}for(const r of f.derivatives.rows)r.timestamp+=delta;for(const r of f.derivatives.taker15m)r.timestamp+=delta;return f}
const provider={
  getFuturesUniverse:async()=>{universeCalls++;return{symbols:['TESTUSDT','GUSDT','龙虾USDT','THINUSDT'].map(symbol=>({symbol,status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT'}))}},
  getFuturesTickers:async()=>{tickerCalls++;return ['TESTUSDT','GUSDT','龙虾USDT','THINUSDT'].map(symbol=>({...live().ticker,symbol,quoteVolume:symbol==='THINUSDT'?1:40000000}))},
  getFuturesKlines:async(s,tf)=>{frameCalls++;return live().frames[tf]},
  getV2DerivativesProfile:async()=>live().derivatives,getFuturesExecution:async()=>live().execution,getFundingInfoMap:async()=>new Map()
};
(async()=>{
 const service=createTraderService({provider,now:()=>clock});
 assert.equal((await service.summary()).eligibleCount,3);
 clock+=180000;
 const after=await service.summary();assert.equal(after.eligibleCount,3,'a long scan must refresh live quotes instead of excluding the entire market after 2 minutes');
 assert.equal(universeCalls,1,'symbol metadata must remain cached');
 assert.equal(tickerCalls,2,'refresh whole-market quotes once, not once per symbol');
 await Promise.all([service.summary(),service.summary()]);assert.equal(tickerCalls,2);
 const result=await service.deep('TESTUSDT');assert.equal(result.item.state,'CONFIRMED');
 assert.equal(result.item.dataAudit.tickerTimestamp,clock);
 assert.equal(result.item.dataAudit.frames['15m'].lastClosedAt,clock-1000);
 assert.equal(result.item.dataAudit.stage,'DEEP');
 const before=frameCalls;const excluded=await service.deep('THINUSDT');assert.equal(excluded.item.dataAudit.stage,'PREFILTER');assert.equal(frameCalls,before,'prefilter exclusions must not request 6TF');
 assert.equal((await service.deep('GUSDT')).item.symbol,'GUSDT');
 assert.equal((await service.deep('龙虾USDT')).item.symbol,'龙虾USDT','all exchange-listed Unicode symbols must be accepted');
 await assert.rejects(()=>service.deep('FAKEUSDT'),/not in Binance/, 'unlisted symbols must remain rejected');
 clock+=180000;provider.getFuturesTickers=async()=>{throw new Error('quotes unavailable')};
 await assert.rejects(()=>service.summary(),/quotes unavailable/,'do not stamp stale cached quotes as fresh on failure');
 console.log('trader freshness: long-scan refresh, coalescing, cached universe, source timestamps and prefilter PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict');
const {fetchBinanceFundingWindow,auditFundingForTrades}=require('../lib/research-backtest-v2/binance-funding-audit.js');
const HR=3600000,START=1700000000000,END=START+40*HR;
const events=[8,16,24,32,40].map((h,i)=>({symbol:'BTCUSDT',fundingRate:String([.0001,-.0002,.0005,.0001,0][i]),fundingTime:START+h*HR,markPrice:String(101+i),rateType:'Regular'}));
const calls=[];
const mock=async url=>{
 const u=new URL(url),start=Number(u.searchParams.get('startTime')),end=Number(u.searchParams.get('endTime')),
 limit=Number(u.searchParams.get('limit'));
 calls.push({start,end,limit});
 return{ok:true,json:async()=>events.filter(e=>e.fundingTime>=start&&e.fundingTime<=end).slice(0,limit)};
};
(async()=>{
 const fetched=await fetchBinanceFundingWindow({symbol:'BTCUSDT',startTime:START,endTime:END,fetchImpl:mock,limit:2});
 assert.equal(fetched.status,'READY');
 assert.equal(fetched.pageCount,3);
 assert.equal(fetched.eventCount,5);
 assert.equal(calls[0].start,START);
 assert.equal(calls[1].start,START+16*HR+1,'pagination must continue after last funding timestamp');
 assert.equal(calls[2].start,START+32*HR+1);
 const trade={symbol:'BTCUSDT',status:'SIMULATED',entryTime:START+2*HR,exitTime:END,
  entryFillEstimate:100,entryReferencePrice:100,estimatedAfterCostsExFundingPct:10};
 const report=auditFundingForTrades({symbol:'BTCUSDT',trades:[trade],window:fetched});
 assert.equal(report.status,'OBSERVED_ONLY');
 assert.equal(report.verifiedNet,false);
 assert.equal(report.trades[0].settlementCount,5);
 const expected=-100*events.reduce((sum,x)=>sum+Number(x.fundingRate)*Number(x.markPrice)/100,0);
 assert(Math.abs(report.trades[0].signedFundingCashflowPct-expected)<1e-10);
 assert(Math.abs(report.trades[0].estimatedAfterCostsAndObservedFundingPct-(10+expected))<1e-10);
 assert(report.trades[0].hasPossibleGap===false);
 const noRates=auditFundingForTrades({symbol:'BTCUSDT',trades:[{...trade,entryTime:START+34*HR,exitTime:START+36*HR}],window:fetched});
 assert.equal(noRates.status,'PARTIAL');
 assert.equal(noRates.trades[0].status,'UNKNOWN_SETTLEMENT_COVERAGE_OR_MARK');
 const noMark=auditFundingForTrades({symbol:'BTCUSDT',trades:[trade],window:{...fetched,events:events.map((e,i)=>({
  time:e.fundingTime,rate:Number(e.fundingRate),markPrice:i===0?null:Number(e.markPrice),type:'Regular'
 }))}});
 assert.equal(noMark.status,'PARTIAL');
 const capped=await fetchBinanceFundingWindow({symbol:'BTCUSDT',startTime:START,endTime:END,fetchImpl:mock,limit:2,maxPages:1});
 assert.equal(capped.status,'INCOMPLETE_PAGE_LIMIT','do not call truncated funding full window');
 assert.equal(auditFundingForTrades({symbol:'BTCUSDT',trades:[trade],window:capped}).status,'UNAVAILABLE');
 const denied=await fetchBinanceFundingWindow({symbol:'BTCUSDT',startTime:START,endTime:END,
  fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(denied.status,'UNAVAILABLE');assert.equal(denied.events.length,0);
 const invalid=await fetchBinanceFundingWindow({symbol:'BTCUSDT',startTime:START,endTime:END,
  fetchImpl:async()=>({ok:true,json:async()=>[{...events[0],symbol:'ETHUSDT'}]})});
 assert.equal(invalid.status,'UNAVAILABLE');
 const duped=await fetchBinanceFundingWindow({symbol:'BTCUSDT',startTime:START,endTime:END,
  fetchImpl:async()=>({ok:true,json:async()=>[events[0],{...events[0],markPrice:'999'}]})});
 assert.equal(duped.status,'UNAVAILABLE');
 assert.equal(auditFundingForTrades({symbol:'BTCUSDT',trades:[trade],window:{...fetched,status:'UNAVAILABLE'}}).status,'UNAVAILABLE');
 assert.equal(auditFundingForTrades({symbol:'ETHUSDT',trades:[trade],window:fetched}).status,'INVALID_INPUT');
 console.log('funding pagination, signed mark-price cashflows, missing data and no-false-net PASS');
})().catch(err=>{console.error(err);process.exitCode=1});

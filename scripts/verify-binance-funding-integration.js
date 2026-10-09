'use strict';
const assert=require('node:assert/strict');
const {main}=require('./run-bowl-walk-forward.js');
const DAY=86400000,HR=3600000,t0=Date.parse('2023-06-01T00:00:00Z'),rows=[];
function append(price,volume=100){
 const open=t0+rows.length*DAY;
 rows.push([open,String(price),String(price*1.004),String(price*.996),String(price),String(volume),open+DAY-1]);
}
for(let i=0;i<560;i++)append(100);
for(let i=0;i<30;i++)append(100-20*(i+1)/30);
for(let i=0;i<35;i++)append(80+Math.sin(i/5)*.6);
append(110,500);
for(let i=0;i<10;i++)append(122+(i>2?i*.1:0));
for(let i=rows.length;i<1100;i++)append(115+(i%15)*.005);
const asOf=rows.at(-1)[6],fundingRequests=[];
const provider={getFuturesKlines:async()=>{
 const copy=rows.map(x=>x.slice());copy._source='BINANCE_FUTURES';return copy;
}};
const fundingFetch=async url=>{
 const u=new URL(url),symbol=u.searchParams.get('symbol');
 assert.equal(symbol,'BTCUSDT');
 const start=Number(u.searchParams.get('startTime')),end=Number(u.searchParams.get('endTime'));
 fundingRequests.push({start,end});
 const period=8*HR,out=[];
 for(let t=Math.ceil(start/period)*period;t<=end;t+=period)out.push({symbol,fundingTime:t,
  fundingRate:'0.0001',markPrice:'112.00',rateType:'Regular'});
 return{ok:true,json:async()=>out};
};
(async()=>{
 let result=null;
 const reports=await main(['BTCUSDT','--tf=1d','--funding-audit'],{
  provider,now:()=>asOf,fundingFetch,write:s=>{result=JSON.parse(s)}
 });
 assert.equal(reports.length,1);
 assert(reports[0].bySplit.train.signals.count>=1,'synthetic breakout must be detected');
 assert(fundingRequests.length>=1,'funding fetch must actually execute for train candidate');
 const split=result.hypotheticalCostRisk.splits.train;
 assert.equal(split.fundingAudit.status,'OBSERVED_ONLY');
 assert.equal(split.fundingAudit.markets[0].observedCount,1);
 assert(split.fundingAudit.markets[0].observedFundingPctSum<0,'long should pay positive funding');
 assert.equal(split.fundingAudit.verifiedNet,false);
 assert.equal(result.hypotheticalCostRisk.holdout,'LOCKED_BY_DESIGN');
 assert.equal(Object.keys(result.hypotheticalCostRisk.splits).includes('test'),false);
 assert(fundingRequests.every(req=>req.end<asOf-150*DAY),'do not query test funding window');
 console.log('funding CLI real-signal integration / signed costs / OOS holdout lock PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

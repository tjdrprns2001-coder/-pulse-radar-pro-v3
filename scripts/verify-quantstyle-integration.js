'use strict';
const assert=require('node:assert/strict');
const {main}=require('./run-bowl-walk-forward.js');
const DAY=86400000,STEP=4*3600000,now=()=>Date.parse('2026-10-10T00:00:00Z');
const rows=[];
for(let i=0;i<1150;i++){
 const t=now()-(1150-i)*STEP,p=100+Math.sin(i/17);
 rows.push([t,p,p*1.004,p*.996,p,100,t+STEP-1]);
}
let log=null,calls=[];
const provider={async getFuturesKlines(symbol,tf,n){
 calls.push([symbol,tf,n]);const result=rows.map(r=>r.slice());result._source='BINANCE_FUTURES';return result;
}};
(async()=>{
 const rs=await main(['BTCUSDT','ETHUSDT','--tf=4h','--limit=1200','--risk'],{
  provider,now,write:s=>{log=JSON.parse(s)}
 });
 assert.equal(rs.length,2);
 assert.equal(calls.length,2);
 assert.equal(log.hypotheticalCostRisk.status,'RESEARCH_ONLY');
 assert.equal(log.hypotheticalCostRisk.holdout,'LOCKED_BY_DESIGN');
 assert(log.hypotheticalCostRisk.splits.train.status);
 assert(log.hypotheticalCostRisk.splits.validation.status);
 assert.equal('test' in log.hypotheticalCostRisk.splits,false,'no unapproved holdout performance');
 const resultsNoRisk=await main(['BTCUSDT','ETHUSDT','--tf=4h'],{
  provider,now,write:s=>{log=JSON.parse(s)}
 });
 assert.equal(resultsNoRisk.length,2);
 assert.equal('hypotheticalCostRisk' in log,false,'flag opt-in only');
 const noSource={getFuturesKlines:async()=>[]};
 await main(['BTCUSDT','ETHUSDT','--tf=4h','--risk'],{provider:noSource,now,
  write:s=>{log=JSON.parse(s)}});
 assert.equal(log.hypotheticalCostRisk.splits.train.status,'INCOMPLETE_SOURCE_OR_EVENT_EXPORT');
 console.log('bowl QuantStyle opt-in CLI integration, no holdout disclosure PASS');
})().catch(e=>{console.error(e);process.exitCode=1});

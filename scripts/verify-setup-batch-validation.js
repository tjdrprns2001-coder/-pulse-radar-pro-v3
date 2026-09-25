'use strict';
const assert=require('assert');
const Batch=require('../lib/research-backtest-v2/setup-batch-validation.js');
const {createCryptoResearchDataEngine}=require('../lib/research-backtest-v2/crypto-data-engine.js');

const STEP=15*60*1000,START=Date.UTC(2026,0,1);
function bar(i,{o=100,h=102,l=98,c=100}={}){
  const ot=START+i*STEP,ct=ot+STEP-1;
  return[ot,String(o),String(h),String(l),String(c),'1000',ct,String(c*1000)];
}
function transitions(symbol,offset=0){
  const risk={evidence:{risk:{stop:95,target:105}}};
  const t=i=>START+(i+1)*STEP-1;
  return[
    {symbol,setupType:'BOTTOM_REVERSAL',fromState:'NO_SETUP',toState:'WATCH_BOTTOM',decisionTime:t(offset+4),candleCloseTime:t(offset+4),features:{}},
    {symbol,setupType:'BOTTOM_REVERSAL',fromState:'WATCH_BOTTOM',toState:'BOTTOM_CONFIRMED',decisionTime:t(offset+5),candleCloseTime:t(offset+5),features:risk},
    {symbol,setupType:'PREBREAKOUT',fromState:'NO_SETUP',toState:'WATCH_BREAKOUT',decisionTime:t(offset+14),candleCloseTime:t(offset+14),features:{}},
    {symbol,setupType:'PREBREAKOUT',fromState:'WATCH_BREAKOUT',toState:'BREAKOUT_CONFIRMED',decisionTime:t(offset+15),candleCloseTime:t(offset+15),features:risk}
  ];
}
function makeRows(winFirst=true){
  const rows=[];for(let i=0;i<70;i++)rows.push(bar(i));
  rows[6]=bar(6,winFirst?{o:100,h:106,l:99,c:104}:{o:100,h:102,l:94,c:96});
  rows[16]=bar(16,winFirst?{o:100,h:102,l:94,c:96}:{o:100,h:106,l:99,c:104});
  return rows;
}
const splits={
  development:{startTs:START,endTs:START+19*STEP},
  walkForward:{startTs:START+20*STEP,endTs:START+39*STEP,foldMs:10*STEP},
  lockedOos:{startTs:START+40*STEP,endTs:START+69*STEP}
};
const cfg={initialCash:100000,commissionRate:.0005,slippageRate:.0005,riskPerTradeFraction:.01,maxPositionValueFraction:.25,stopTargetPriority:'stop_first'};
const cases=[
  {symbol:'AAAUSDT',rows:makeRows(true),transitions:transitions('AAAUSDT'),splits,executionConfig:cfg},
  {symbol:'BBBUSDT',rows:makeRows(false),transitions:transitions('BBBUSDT'),splits,executionConfig:cfg}
];
const out=Batch.runBatchValidation({cases});
assert.equal(out.caseCount,2);
assert.equal(out.errorCount,0);
assert.equal(out.symbolSummary.length,2);
assert(out.regimeAggregates.development['1x']['ALL|ALL'].tradeCount>=4);
assert(out.regimeAggregates.development['1x']['BOTTOM_REVERSAL|ALL']);
assert(out.regimeAggregates.development['1x']['PREBREAKOUT|ALL']);

// Paginated range loader: force multiple pages with a small page size.
const all=[];for(let i=0;i<40;i++)all.push(bar(i));
const fakeFetch=async url=>{
  const u=new URL(url),end=Number(u.searchParams.get('endTime')||Infinity),limit=Number(u.searchParams.get('limit')||1500);
  const eligible=all.filter(r=>r[6]<=end).slice(-limit);
  return{ok:true,status:200,json:async()=>eligible};
};
(async()=>{
  const engine=createCryptoResearchDataEngine({fetchImpl:fakeFetch,marketType:'spot'});
  const r=await engine.getKlinesRange('AAAUSDT','15m',{startTime:all[5][6],endTime:all[35][6],pageSize:10,maxBars:100});
  assert(r.pages>=3);
  assert.equal(r.rows[0][6],all[5][6]);
  assert.equal(r.rows.at(-1)[6],all[35][6]);
  assert.equal(new Set(r.rows.map(x=>x[0])).size,r.rows.length);
  console.log('setup batch/regime and pagination verification passed');
})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
const assert=require('assert');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {assessWarmup}=require('../lib/research-backtest-v2/bowl224/coverage.js');

function row(open,close){return[open,1,1,1,1,1,close,1,1,1,1,0]}
(async()=>{
  const DAY=86400000;
  const source=Array.from({length:1205},(_,i)=>row(i*DAY,(i+1)*DAY-1));
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    const u=new URL(url),start=Number(u.searchParams.get('startTime')||0),end=Number(u.searchParams.get('endTime')||Infinity),limit=Number(u.searchParams.get('limit')||1000);
    const rows=source.filter(r=>r[0]>=start&&r[0]<=end).slice(0,limit);
    return{ok:true,status:200,json:async()=>rows};
  };
  const p=createBinanceProvider({fetchImpl,bases:['https://x']});
  const out=await p.getKlinesRange('AAAUSDT','1d',{startTime:0,endTime:source[source.length-1][6],minBars:1205,maxRequests:5});
  assert(out.coverage.requestCount>=2,'must paginate >1000 rows');
  assert.equal(out.rows.length,1205);
  assert.equal(new Set(out.rows.map(r=>r[0])).size,1205,'duplicate page boundary');
  assert.deepEqual(out.rows.map(r=>r[0]),out.rows.map(r=>r[0]).slice().sort((a,b)=>a-b));
  assert.equal(out.coverage.complete,true);
  assert.equal(calls,out.coverage.requestCount);

  let repeatedCalls=0;
  const repeated=createBinanceProvider({bases:['https://x'],fetchImpl:async()=>{repeatedCalls++;return{ok:true,status:200,json:async()=>source.slice(0,1000)}}});
  const rep=await repeated.getKlinesRange('AAAUSDT','1d',{startTime:0,endTime:source[source.length-1][6],minBars:1205,maxRequests:4});
  assert.equal(rep.coverage.complete,false);
  assert.equal(rep.coverage.stopReason,'repeated-page');
  assert(repeatedCalls<=2);

  const empty=createBinanceProvider({bases:['https://x'],fetchImpl:async()=>({ok:true,status:200,json:async()=>[]})});
  const emp=await empty.getKlinesRange('AAAUSDT','1d',{startTime:0,endTime:10*DAY,minBars:10,maxRequests:3});
  assert.equal(emp.coverage.complete,false);
  assert.equal(emp.coverage.stopReason,'empty-page');

  const warm=assessWarmup({
    daily:{rows:Array(400).fill(0),coverage:{complete:true}},
    h4:{rows:Array(240).fill(0),coverage:{complete:true}},
    h1:{rows:Array(500).fill(0),coverage:{complete:true}},
    future:{rows:Array(672).fill(0),coverage:{complete:true}}
  });
  assert.equal(warm.bowlDailyEligible,true);
  assert.equal(warm.preferredDailyWarmup,true);
  assert.equal(warm.lowerTimeframeReady,true);
  assert.equal(warm.future7dReady,true);
  console.log('bowl224 range fetch PASS');
})().catch(e=>{console.error(e);process.exit(1)});